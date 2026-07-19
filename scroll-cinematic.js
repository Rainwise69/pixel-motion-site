/* ============================================================
   PIXEL MOTION — motor v2
   Canvas frame-scrub + Lenis + interações do site.
   Mobile (<768px): carrega 1 em cada 2 frames (Map esparso).
   Sem frames em /frames/<secção>/ → fallback CSS automático.
   ============================================================ */

const SCRUB_SECTIONS = [
  { section: '#hero', frameCount: 140, framePath: (i) => `frames/hero/frame_${String(i).padStart(4, '0')}.webp` },
  { section: '#ia',   frameCount: 159, framePath: (i) => `frames/ia/frame_${String(i).padStart(4, '0')}.jpg` },
];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FRAME_STEP = window.matchMedia('(max-width: 768px)').matches ? 2 : 1;

/* ---------- Lenis ---------- */
let lenis = null;
if (typeof Lenis !== 'undefined' && !REDUCED) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
}

/* ---------- Scrubber ---------- */
class Scrubber {
  constructor(cfg) {
    this.el = document.querySelector(cfg.section);
    if (!this.el) return;
    this.canvas = this.el.querySelector('canvas.scrub-canvas');
    this.cfg = cfg;
    this.frames = new Map(); // índice 1-based → Image (esparso em mobile)
    this.lastIndex = -1;
    this.overlays = [...this.el.querySelectorAll('[data-scrub]')];
    this.hasStarted = false;
    if (cfg.section === '#hero') this.start();
    else this.observeUntilNear();
  }

  start() {
    if (this.hasStarted) return;
    this.hasStarted = true;
    this.probe();
  }

  observeUntilNear() {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      this.start();
    }, { rootMargin: '800px 0px' });
    observer.observe(this.el);
  }

  probe() {
    const test = new Image();
    test.onload = () => this.preloadAll();
    test.onerror = () => this.el.classList.add('no-frames');
    test.src = this.cfg.framePath(1);
  }

  preloadAll() {
    const { frameCount, framePath } = this.cfg;
    for (let i = 1; i <= frameCount; i += FRAME_STEP) {
      const img = new Image();
      if (i === 1) img.onload = () => this.firstFrame(img);
      img.decoding = 'async';
      img.fetchPriority = i === 1 ? 'high' : 'low';
      img.src = framePath(i);
      this.frames.set(i, img);
    }
  }

  firstFrame(img) {
    this.el.classList.add('has-frames');
    this.resize();
    this.draw(img);
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.lastIndex = -1;
  }

  draw(img) {
    if (!this.canvas || !img || !img.naturalWidth) return;
    const ctx = this.canvas.getContext('2d');
    const cw = this.canvas.width, ch = this.canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  update() {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = rect.height - vh;
    if (total <= 0) return;
    const progress = Math.min(Math.max(-rect.top / total, 0), 1);

    if (this.frames.size) {
      const raw = 1 + Math.round(progress * (this.cfg.frameCount - 1));
      const idx = raw - ((raw - 1) % FRAME_STEP); // snap ao frame carregado
      if (idx !== this.lastIndex) {
        const img = this.frames.get(idx);
        if (img && img.complete && img.naturalWidth) {
          this.draw(img);
          this.lastIndex = idx;
        }
      }
    }

    for (const o of this.overlays) {
      const [a, b] = o.dataset.scrub.split(',').map(Number);
      const span = (b - a) || 1;
      const local = (progress - a) / span;
      let op = 0;
      if (local > 0 && local < 1) {
        op = local < 0.25 ? local / 0.25 : local > 0.75 ? (1 - local) / 0.25 : 1;
      }
      if (a === 0) op = local >= 1 ? 0 : Math.min(1, (1 - local) / 0.35);
      o.style.opacity = op.toFixed(3);
      o.style.transform = `translateY(${((1 - op) * 14).toFixed(1)}px)`;
      o.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
    }
  }
}

const scrubbers = SCRUB_SECTIONS.map((c) => new Scrubber(c)).filter((s) => s.el);

function frame(time) {
  if (lenis) lenis.raf(time);
  for (const s of scrubbers) s.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => scrubbers.forEach((s) => s.resize()));

/* ---------- reveal ---------- */
const revealObs = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-visible')),
  { threshold: 0.15 }
);
document.querySelectorAll('[data-reveal]').forEach((el) => revealObs.observe(el));

/* ---------- header ---------- */
const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('is-scrolled', window.scrollY > 40);
}, { passive: true });

/* ---------- menu mobile ---------- */
const navToggle = document.querySelector('.nav-toggle');
if (navToggle) navToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(open));
});

/* ---------- escolha comercial ---------- */
document.querySelectorAll('[data-solution]').forEach((link) => {
  link.addEventListener('click', () => {
    const select = document.querySelector('#f-solucao');
    if (select) select.value = link.dataset.solution || '';
  });
});

/* ---------- âncoras suaves ---------- */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    document.body.classList.remove('nav-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    if (lenis) lenis.scrollTo(target, { offset: 0 });
    else target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });
});

/* ---------- formulários (formsubmit.co AJAX + fallback nativo) ---------- */
document.querySelectorAll('form[data-form]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.querySelector('[name="_honey"]')?.value) return; // bot
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch('https://formsubmit.co/ajax/geral@pixelmotion.pt', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.classList.add('is-sent');
      window.pmTrackEvent?.('generate_lead', { contact_method: 'formulario' });
    } catch {
      form.removeAttribute('data-form'); // evita loop do handler
      form.submit(); // fallback nativo → _next volta com ?enviado=1
    } finally {
      if (btn) btn.disabled = false;
    }
  });
});
if (new URLSearchParams(location.search).has('enviado')) {
  const f = document.querySelector('form[data-form], form[action^="https://formsubmit"]');
  if (f) {
    f.classList.add('is-sent');
    window.pmTrackEvent?.('generate_lead', { contact_method: 'formulario_fallback' });
  }
}

/* ---------- filtros de portfólio ---------- */
const filterBar = document.querySelector('[data-filters]');
if (filterBar) {
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    filterBar.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    const f = btn.dataset.filter;
    document.querySelectorAll('.work').forEach((w) => {
      w.hidden = f !== 'todos' && w.dataset.cat !== f;
    });
  });
}

/* ---------- lightbox de vídeo (facade: iframe só ao clique) ---------- */
const lightbox = document.querySelector('#lightbox');
if (lightbox) {
  const frameBox = lightbox.querySelector('.lb-frame');
  document.querySelectorAll('.work[data-video], .work[data-instagram]').forEach((w) => {
    const title = w.querySelector('h3')?.textContent || 'Vídeo';
    w.tabIndex = 0;
    w.setAttribute('role', 'button');
    w.setAttribute('aria-label', `Ver vídeo: ${title}`);

    const openVideo = () => {
      lightbox.classList.toggle('is-vertical', Boolean(w.dataset.instagram));
      const src = w.dataset.instagram
        ? `https://www.instagram.com/reel/${w.dataset.instagram}/embed/`
        : `https://www.youtube-nocookie.com/embed/${w.dataset.video}?autoplay=1`;
      frameBox.innerHTML = `<iframe src="${src}" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${title}"></iframe>`;
      lightbox.showModal();
    };

    w.addEventListener('click', openVideo);
    w.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openVideo();
    });
  });
  lightbox.querySelector('.lb-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('close', () => {
    frameBox.innerHTML = '';
    lightbox.classList.remove('is-vertical');
  });
}
