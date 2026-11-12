/* Reel decorativo: poster imediato, reprodução silenciosa, controlo explícito e legenda do projeto em cena. */
(() => {
  'use strict';
  const video = document.querySelector('[data-hero-video]');
  const toggle = document.querySelector('[data-hero-toggle]');
  const hero = document.querySelector('.home-hero');
  if (!video || !toggle || !hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Dois cortes do mesmo reel: horizontal por omissão, vertical em ecrãs ao alto. */
  const tallScreen = window.matchMedia('(max-aspect-ratio: 4/5)');
  const pickSource = () => (tallScreen.matches && video.dataset.srcTall) || video.dataset.src;
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
    if (!video.getAttribute('src')) video.src = pickSource();
    pending = true;
    video.play().catch(() => {
      // Bloqueio de autoplay ou rede: manter o poster e permitir tentativa manual.
      updateControl();
    }).finally(() => { pending = false; });
  }

  toggle.addEventListener('click', () => {
    if (!video.paused) userPaused = true;
    else { userPaused = false; userStarted = true; }
    /* A mesma pausa pára as faixas em movimento (clientes e faixa tipográfica). */
    document.documentElement.classList.toggle('is-motion-paused', userPaused);
    syncPlayback();
  });

  /* A legenda "Em cena" acompanha o projeto que está a passar: [segundo, nome, ligação]. */
  const project = document.querySelector('[data-hero-project]');
  const projectName = project?.querySelector('[data-hero-project-name]');
  const readCues = (value) => { try { return JSON.parse(value || 'null'); } catch { return null; } };
  const cuesWide = readCues(project?.dataset.cues);
  const cuesTall = readCues(project?.dataset.cuesTall) || cuesWide;
  let swapTimer = 0;
  function syncProject() {
    if (!projectName || !cuesWide) return;
    const cues = video.dataset.srcTall && video.getAttribute('src') === video.dataset.srcTall ? cuesTall : cuesWide;
    let index = 0;
    /* O evento chega cerca de 4 vezes por segundo: adianta um quarto de segundo. */
    for (let i = 0; i < cues.length; i += 1) if (video.currentTime + 0.25 >= cues[i][0]) index = i;
    const [, name, href] = cues[index];
    if (project.dataset.cue === String(index) && projectName.textContent === name) return;
    project.dataset.cue = String(index);
    window.clearTimeout(swapTimer);
    project.classList.add('is-swapping');
    swapTimer = window.setTimeout(() => {
      projectName.textContent = name;
      project.setAttribute('href', href);
      project.classList.remove('is-swapping');
    }, reducedMotion.matches ? 0 : 160);
  }
  video.addEventListener('timeupdate', syncProject);
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
