/* Excerto decorativo: poster imediato, reprodução silenciosa e controlo explícito. */
(() => {
  'use strict';
  const video = document.querySelector('[data-hero-video]');
  const toggle = document.querySelector('[data-hero-toggle]');
  const hero = document.querySelector('.home-hero');
  if (!video || !toggle || !hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  let visible = true;
  let userPaused = false;
  let userStarted = false;
  let pending = false;

  video.muted = true;
  toggle.hidden = false;

  function updateControl() {
    const playing = !video.paused;
    toggle.setAttribute('aria-label', playing ? 'Pausar vídeo de fundo' : 'Reproduzir vídeo de fundo');
    toggle.querySelector('[data-hero-label]').textContent = playing ? 'Pausar vídeo' : 'Reproduzir vídeo';
    toggle.querySelector('[data-hero-icon]').textContent = playing ? 'Ⅱ' : '▶';
  }

  function syncPlayback() {
    const motionAllowed = userStarted || (!reducedMotion.matches && !connection?.saveData);
    if (!visible || document.hidden || userPaused || !motionAllowed) {
      video.pause();
      updateControl();
      return;
    }
    if (!video.paused || pending) return;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    pending = true;
    video.play().catch(() => {
      // Bloqueio de autoplay ou rede: manter o poster e permitir tentativa manual.
      updateControl();
    }).finally(() => { pending = false; });
  }

  toggle.addEventListener('click', () => {
    if (!video.paused) userPaused = true;
    else { userPaused = false; userStarted = true; }
    syncPlayback();
  });
  video.addEventListener('playing', () => {
    video.classList.add('has-played');
    updateControl();
  });
  video.addEventListener('pause', updateControl);
  video.addEventListener('error', () => {
    video.classList.remove('has-played');
    updateControl();
  });
  reducedMotion.addEventListener('change', syncPlayback);
  connection?.addEventListener?.('change', syncPlayback);
  document.addEventListener('visibilitychange', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0 }).observe(hero);
  }
  updateControl();
  syncPlayback();
})();
