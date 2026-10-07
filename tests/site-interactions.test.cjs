const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');

class Element {
  constructor() {
    this.attrs = {}; this.children = []; this.listeners = {}; this.hidden = false;
    const classes = new Set();
    this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: v => classes.has(v), toggle: (v, on) => { on = on ?? !classes.has(v); on ? classes.add(v) : classes.delete(v); return on; } };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(e) { this.children.push(e); return e; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  focus() { this.focused = true; }
  matches(s) { return s === '.form-success'; }
}
function setupForm(fetchImplementation, search = '') {
  const form = new Element(); const button = new Element(); const success = new Element(); const events = [];
  form.nextElementSibling = success; form.reportValidity = () => true;
  let nativeSubmissions = 0; form.submit = () => nativeSubmissions++;
  form.querySelector = s => s.includes('button') ? button : null;
  const document = {
    querySelector: () => null,
    querySelectorAll: s => s === 'form[data-form]' ? [form] : [],
    createElement: () => new Element(),
  };
  let calls = 0;
  const window = { scrollY: 0, addEventListener() {}, matchMedia: () => ({ matches: false }), setTimeout, clearTimeout, pmTrackEvent: (...args) => events.push(args) };
  const context = { document, window, location: { pathname: '/index.html', search }, FormData: class {}, AbortController, fetch: (...args) => { calls++; return fetchImplementation(...args); } };
  vm.runInNewContext(fs.readFileSync(`${repo}/scroll-cinematic.js`, 'utf8'), context);
  return { form, button, success, events, status: form.children[0], submit: () => form.listeners.submit({ preventDefault() {} }), calls: () => calls, nativeSubmissions: () => nativeSubmissions };
}
const result = (success, ok = true) => ({ ok, json: async () => ({ success }) });

test('FormSubmit HTTP 200 with success:false stays visible and reports an error', async () => {
  const app = setupForm(async () => result(false)); await app.submit();
  assert.equal(app.form.classList.contains('is-sent'), false);
  assert.equal(app.events.length, 0); assert.equal(app.button.disabled, false);
  assert.equal(app.status.attrs.role, 'alert'); assert.match(app.status.textContent, /não confirmou/);
});
test('Both supported boolean/string success variants confirm exactly one lead', async () => {
  for (const success of [true, 'true']) {
    const app = setupForm(async () => result(success)); await app.submit(); await app.submit();
    assert.equal(app.calls(), 1); assert.equal(app.events.length, 1);
    assert.equal(app.events[0][0], 'generate_lead'); assert.equal(app.form.classList.contains('is-sent'), true);
    assert.equal(app.success.focused, true); assert.equal(app.button.disabled, true);
  }
});
test('Double submit while request is pending sends only one POST', async () => {
  let complete; const response = new Promise(resolve => complete = resolve);
  const app = setupForm(() => response); const pending = app.submit(); await app.submit();
  assert.equal(app.calls(), 1); assert.equal(app.button.disabled, true);
  complete(result(true)); await pending; assert.equal(app.events.length, 1);
});
test('Network failure never automatically repeats or submits natively', async () => {
  const app = setupForm(async () => { throw new Error('offline'); }); await app.submit();
  assert.equal(app.calls(), 1); assert.equal(app.nativeSubmissions(), 0);
  assert.equal(app.events.length, 0); assert.match(app.status.textContent, /evitar repetir/);
});
test('Invalid JSON and HTTP error cannot create successful leads', async () => {
  for (const response of [{ ok: true, json: async () => { throw new SyntaxError(); } }, result(true, false)]) {
    const app = setupForm(async () => response); await app.submit();
    assert.equal(app.events.length, 0); assert.equal(app.form.classList.contains('is-sent'), false);
    assert.equal(app.nativeSubmissions(), 0);
  }
});
test('An arbitrary enviado query cannot show success or create analytics events', () => {
  for (const query of ['?enviado=1', '?enviado=0']) {
    const app = setupForm(async () => result(true), query);
    assert.equal(app.form.classList.contains('is-sent'), false); assert.equal(app.calls(), 0); assert.equal(app.events.length, 0);
  }
});

function setupAnalytics() {
  let stored = null; const head = new Element(); const body = new Element(); const footer = new Element(); const listeners = {};
  const banner = new Element(); const reject = new Element(); const accept = new Element();
  banner.querySelector = s => s.includes('reject') ? reject : accept; banner.remove = () => {};
  footer.querySelector = () => null;
  const document = { head, body, querySelector: s => s === '.pm-consent' ? banner : footer,
    createElement: tag => tag === 'section' ? banner : new Element(), addEventListener: (k, fn) => listeners[k] = fn };
  const window = {};
  vm.runInNewContext(fs.readFileSync(`${repo}/analytics-consent.js`, 'utf8'), {
    document, window, location: { pathname: '/', search: '' }, localStorage: { getItem: () => stored, setItem: (_k, value) => stored = value },
  });
  listeners.DOMContentLoaded();
  return { window, head, reject: () => reject.listeners.click(), accept: () => accept.listeners.click(), click: href => listeners.click({ target: { closest: () => ({ getAttribute: () => href, textContent: 'Contactar' }) } }) };
}
test('Contact clicks need consent and use contact_click, never generate_lead', () => {
  const app = setupAnalytics(); app.click('https://wa.me/351913667443');
  assert.equal(app.head.children.length, 0);
  assert.equal(app.window.dataLayer.filter(args => args[0] === 'event').length, 0);
  app.accept(); app.click('https://wa.me/351913667443'); app.click('mailto:geral@pixelmotion.pt'); app.click('tel:+351913667443');
  const events = app.window.dataLayer.filter(args => args[0] === 'event');
  assert.equal(events.length, 3); assert.ok(events.every(args => args[1] === 'contact_click'));
  assert.equal(app.head.children.length, 1);
});
test('Revoke and reaccept applies consent again without injecting a second GA script', () => {
  const app = setupAnalytics(); app.accept(); app.reject(); app.click('tel:+351913667443');
  assert.equal(app.window['ga-disable-G-4Z5W00MF5G'], true);
  assert.equal(app.window.dataLayer.filter(args => args[0] === 'event').length, 0);
  app.accept(); app.click('tel:+351913667443');
  assert.equal(app.window['ga-disable-G-4Z5W00MF5G'], false); assert.equal(app.head.children.length, 1);
  assert.equal(app.window.dataLayer.filter(args => args[0] === 'event').length, 1);
  const updates = app.window.dataLayer.filter(args => args[0] === 'consent' && args[1] === 'update');
  assert.equal(updates.at(-1)[2].analytics_storage, 'granted');
});

function setupMenu() {
  const body = new Element(); const toggle = new Element(); const nav = new Element();
  const first = new Element(); const last = new Element(); const listeners = {};
  const media = { matches: true, addEventListener: (_name, fn) => media.change = fn };
  const document = { body, activeElement: null,
    querySelector: selector => selector === '.nav-toggle' ? toggle : selector === '.site-nav' ? nav : null,
    querySelectorAll: () => [], addEventListener: (name, fn) => listeners[name] = fn,
  };
  for (const element of [toggle, first, last]) element.focus = () => { document.activeElement = element; };
  nav.querySelector = () => first; nav.querySelectorAll = () => [first, last];
  nav.contains = element => [first, last].includes(element);
  const window = { matchMedia: () => media, scrollY: 0, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(`${repo}/scroll-cinematic.js`, 'utf8'), { document, window });
  return { document, nav, toggle, first, last, media, open: () => toggle.listeners.click(), key: (key, shiftKey = false) => listeners.keydown({ key, shiftKey, preventDefault() {} }) };
}
test('Mobile navigation starts inert, opens with focus, traps Tab and closes with Escape', () => {
  const app = setupMenu();
  assert.equal(app.nav.inert, true); assert.equal(app.toggle.attrs['aria-expanded'], 'false');
  app.open(); assert.equal(app.nav.inert, false); assert.equal(app.document.activeElement, app.first);
  app.last.focus(); app.key('Tab'); assert.equal(app.document.activeElement, app.toggle);
  app.key('Tab', true); assert.equal(app.document.activeElement, app.last);
  app.key('Escape'); assert.equal(app.nav.inert, true); assert.equal(app.document.activeElement, app.toggle);
  assert.equal(app.toggle.attrs['aria-expanded'], 'false');
});
test('Changing viewport preserves a visible focus target and re-enables desktop navigation', () => {
  const app = setupMenu(); app.toggle.focus();
  app.media.matches = false; app.media.change();
  assert.equal(app.nav.inert, false); assert.equal(app.document.activeElement, app.first);
  assert.equal(app.nav.attrs['aria-hidden'], undefined);
  app.media.matches = true; app.media.change();
  assert.equal(app.nav.inert, true); assert.equal(app.document.activeElement, app.toggle);
});
