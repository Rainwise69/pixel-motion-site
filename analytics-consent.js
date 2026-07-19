(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-4Z5W00MF5G';
  const CONSENT_KEY = 'pm_analytics_consent';
  const isProjectPage = location.pathname.includes('/projetos/');
  const privacyUrl = `${isProjectPage ? '../' : ''}privacidade.html`;
  let analyticsLoaded = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  function getConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // O site continua funcional quando o armazenamento local está bloqueado.
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  window.pmTrackEvent = (name, parameters = {}) => {
    if (getConsent() !== 'granted') return;
    loadAnalytics();
    window.gtag('event', name, {
      page_path: `${location.pathname}${location.search}`,
      ...parameters,
    });
  };

  function setConsent(value) {
    saveConsent(value);
    if (value === 'granted') loadAnalytics();
    else window.gtag('consent', 'update', { analytics_storage: 'denied' });
    document.querySelector('.pm-consent')?.remove();
  }

  function showConsent() {
    document.querySelector('.pm-consent')?.remove();
    const banner = document.createElement('section');
    banner.className = 'pm-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferências de privacidade');
    banner.innerHTML = `
      <div class="pm-consent-copy">
        <strong>Podemos medir o que funciona?</strong>
        <p>Usamos o Google Analytics apenas com a sua autorização para perceber visitas e pedidos de contacto. Não ativamos publicidade. <a href="${privacyUrl}">Política de privacidade</a></p>
      </div>
      <div class="pm-consent-actions">
        <button type="button" class="pm-consent-reject">Recusar</button>
        <button type="button" class="btn btn-primary pm-consent-accept">Aceitar medição</button>
      </div>`;
    document.body.appendChild(banner);
    banner.querySelector('.pm-consent-reject').addEventListener('click', () => setConsent('denied'));
    banner.querySelector('.pm-consent-accept').addEventListener('click', () => setConsent('granted'));
  }

  function addPrivacyControl() {
    const footerTarget = document.querySelector('.site-footer .copyright') || document.querySelector('.site-footer');
    if (!footerTarget || footerTarget.querySelector('.pm-privacy-settings')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pm-privacy-settings';
    button.textContent = 'Preferências de privacidade';
    button.addEventListener('click', showConsent);
    footerTarget.appendChild(button);
  }

  function trackContactClicks(event) {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    let contactMethod = '';
    if (href.includes('wa.me/')) contactMethod = 'whatsapp';
    else if (href.startsWith('mailto:')) contactMethod = 'email';
    else if (href.startsWith('tel:')) contactMethod = 'telefone';
    if (!contactMethod) return;

    window.pmTrackEvent('generate_lead', {
      contact_method: contactMethod,
      link_text: (link.textContent || '').trim().slice(0, 100),
    });
  }

  if (getConsent() === 'granted') loadAnalytics();

  document.addEventListener('DOMContentLoaded', () => {
    addPrivacyControl();
    document.addEventListener('click', trackContactClicks, { capture: true });
    if (!getConsent()) showConsent();
  });
})();
