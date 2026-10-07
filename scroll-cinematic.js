/* PIXEL MOTION — navegação, contactos e reprodução a pedido. */
(() => {
  'use strict';

  /* O conteúdo permanece visível mesmo sem JavaScript. */
  document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'));

  const header = document.querySelector('.site-header');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 40);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* Menu móvel: estado semântico, Escape e ciclo de foco. */
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  const mobileNav = window.matchMedia('(max-width: 760px)');
  let menuOpen = false;

  function setMenu(open, restoreFocus = false) {
    if (!nav || !navToggle) return;
    menuOpen = Boolean(open && mobileNav.matches);
    document.body.classList.toggle('nav-open', menuOpen);
    navToggle.setAttribute('aria-expanded', String(menuOpen));
    navToggle.setAttribute('aria-label', menuOpen ? 'Fechar menu' : 'Abrir menu');
    nav.inert = mobileNav.matches && !menuOpen;
    if (nav.inert) nav.setAttribute('aria-hidden', 'true');
    else nav.removeAttribute('aria-hidden');
    if (menuOpen) nav.querySelector('a[href], button:not([disabled])')?.focus();
    else if (restoreFocus && mobileNav.matches) navToggle.focus();
  }

  if (nav && navToggle) {
    nav.id = nav.id || 'site-navigation';
    navToggle.setAttribute('aria-controls', nav.id);
    navToggle.addEventListener('click', () => setMenu(!menuOpen, menuOpen));
    nav.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const wasOpen = menuOpen;
      setMenu(false);
      const href = link.getAttribute('href');
      if (wasOpen && href.startsWith('#')) {
        const target = document.getElementById(href.slice(1));
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      }
    });
    document.addEventListener('keydown', (event) => {
      if (!menuOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false, true);
      } else if (event.key === 'Tab') {
        const controls = [navToggle, ...nav.querySelectorAll('a[href], button:not([disabled])')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    mobileNav.addEventListener('change', () => {
      const focusWasInNav = nav.contains(document.activeElement);
      const focusWasOnToggle = document.activeElement === navToggle;
      setMenu(false, focusWasInNav);
      if (!mobileNav.matches && focusWasOnToggle) nav.querySelector('a[href]')?.focus();
    });
    setMenu(false);
  }

  document.querySelectorAll('[data-solution]').forEach((link) => {
    link.addEventListener('click', () => {
      const select = document.querySelector('#f-solucao');
      if (select) select.value = link.dataset.solution || '';
    });
  });

  /* Uma tentativa de envio de cada vez; sem reenvio automático em caso de erro. */
  document.querySelectorAll('form[data-form]').forEach((form) => {
    let submitting = false;
    let submitted = false;
    const button = form.querySelector('button[type="submit"]');
    const status = document.createElement('p');
    status.className = 'form-status full';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    form.appendChild(status);
    const success = form.nextElementSibling?.matches('.form-success') ? form.nextElementSibling : null;
    if (success) {
      success.setAttribute('role', 'status');
      success.setAttribute('aria-live', 'polite');
      success.setAttribute('tabindex', '-1');
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submitting || submitted || form.querySelector('[name="_honey"]')?.value) return;
      if (!form.reportValidity()) return;
      submitting = true;
      if (button) button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      status.hidden = false;
      status.classList.remove('is-error');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = 'A enviar a sua mensagem…';
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('https://formsubmit.co/ajax/geral@pixelmotion.pt', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || ![true, 'true'].includes(result?.success)) {
          status.textContent = 'O serviço não confirmou o envio. Os seus dados continuam no formulário. Pode tentar novamente ou contactar-nos por email ou WhatsApp.';
          status.classList.add('is-error');
          status.setAttribute('role', 'alert');
          status.setAttribute('aria-live', 'assertive');
          return;
        }
        submitted = true;
        if (success) {
          form.classList.add('is-sent');
          success.focus({ preventScroll: true });
        } else {
          status.textContent = 'Mensagem enviada. Respondemos em 24h úteis. Obrigado!';
        }
        window.pmTrackEvent?.('generate_lead', { contact_method: 'formulario', form_page: location.pathname });
      } catch {
        status.textContent = 'Não conseguimos confirmar o envio. Para evitar repetir o pedido, contacte-nos por email ou WhatsApp. Os seus dados continuam aqui.';
        status.classList.add('is-error');
        status.setAttribute('role', 'alert');
        status.setAttribute('aria-live', 'assertive');
      } finally {
        window.clearTimeout(timeout);
        submitting = false;
        form.removeAttribute('aria-busy');
        if (button) button.disabled = submitted;
      }
    });
  });
  // Um parâmetro no endereço não comprova que o serviço recebeu uma mensagem.
  // O retorno nativo do FormSubmit continua disponível quando o JavaScript está desligado.

  const filterBar = document.querySelector('[data-filters]');
  if (filterBar) {
    const buttons = [...filterBar.querySelectorAll('button[data-filter]')];
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
    filterBar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      buttons.forEach((item) => {
        item.classList.toggle('is-active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      document.querySelectorAll('.work').forEach((work) => {
        work.hidden = button.dataset.filter !== 'todos' && work.dataset.cat !== button.dataset.filter;
      });
    });
  }

  function createEmbed(src, title) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'eager';
    return iframe;
  }

  /* As páginas de projeto só contactam o Instagram após uma escolha explícita. */
  document.querySelectorAll('.video-facade[data-instagram]').forEach((facade) => {
    facade.querySelector('.video-facade-trigger')?.addEventListener('click', () => {
      const iframe = createEmbed(
        `https://www.instagram.com/reel/${encodeURIComponent(facade.dataset.instagram)}/embed/`,
        facade.dataset.title || 'Vídeo do projeto',
      );
      facade.replaceChildren(iframe);
      iframe.focus();
    }, { once: true });
  });

  const lightbox = document.querySelector('#lightbox');
  if (lightbox) {
    const frameBox = lightbox.querySelector('.lb-frame');
    document.querySelectorAll('.work[data-video], .work[data-instagram], .work[data-local-video]').forEach((work) => {
      const title = work.querySelector('h3')?.textContent || 'Vídeo';
      work.tabIndex = 0;
      work.setAttribute('role', 'button');
      work.setAttribute('aria-label', `Ver vídeo: ${title}`);
      const openVideo = () => {
        lightbox.classList.toggle('is-vertical', Boolean(work.dataset.instagram));
        let player;
        if (work.dataset.localVideo) {
          player = document.createElement('video');
          player.src = work.dataset.localVideo;
          if (work.dataset.poster) player.poster = work.dataset.poster;
          player.controls = true;
          player.autoplay = true;
          player.playsInline = true;
          player.preload = 'metadata';
          player.setAttribute('aria-label', title);
        } else {
          const src = work.dataset.instagram
            ? `https://www.instagram.com/reel/${encodeURIComponent(work.dataset.instagram)}/embed/`
            : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(work.dataset.video)}?autoplay=1`;
          player = createEmbed(src, title);
        }
        frameBox.replaceChildren(player);
        work.focus();
        lightbox.showModal();
      };
      work.addEventListener('click', (event) => {
        if (!event.target.closest('a, button')) openVideo();
      });
      work.addEventListener('keydown', (event) => {
        if (event.target.closest('a, button') || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openVideo();
      });
    });
    lightbox.querySelector('.lb-close')?.addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });
    lightbox.addEventListener('close', () => {
      frameBox.replaceChildren();
      lightbox.classList.remove('is-vertical');
    });
  }
})();
