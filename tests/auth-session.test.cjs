const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function response(data) {
  return { ok: true, json: async () => data };
}

function createHarness({ token = '', role = '', nama = '', hash = '#dashboard', fetchImpl }) {
  const listeners = {};
  const elements = {
    app: { innerHTML: '' },
    tc: { appendChild() {} },
    lo: { style: { display: 'none' } }
  };
  const localStorage = storage({
    ...(token ? { spdk_token: token } : {}),
    ...(role ? { spdk_role: role } : {}),
    ...(nama ? { spdk_nama: nama } : {})
  });
  const sessionStorage = storage({ spdk_pending_attendance: JSON.stringify({ shortCode: 'ABC234', via: 'qr' }) });
  let currentHash = hash;
  const location = {
    pathname: '/spdk/',
    search: '',
    reload() {},
    get hash() { return currentHash; },
    set hash(value) {
      currentHash = value;
      if (listeners.hashchange) queueMicrotask(() => listeners.hashchange());
    }
  };
  const window = {
    location,
    history: { replaceState() {} },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const context = {
    console,
    confirm: () => true,
    document: {
      body: { appendChild() {} },
      getElementById(id) { return elements[id] || null; },
      createElement() { return { className: '', textContent: '', remove() {} }; }
    },
    fetch: fetchImpl,
    localStorage,
    navigator: {},
    sessionStorage,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    URLSearchParams,
    window
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(inlineScript, context);
  return { context, elements, listeners, localStorage, sessionStorage, location };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('startup without a token renders login without calling the API', async () => {
  const actions = [];
  const h = createHarness({
    hash: '#dashboard',
    fetchImpl: async (_url, options = {}) => {
      if (options.body) actions.push(JSON.parse(options.body).action);
      return response({ success: true });
    }
  });
  h.listeners.load();
  await settle();
  assert.deepEqual(actions, []);
  assert.match(h.elements.app.innerHTML, /Log Masuk/);
});

test('startup renews a stored token before rendering a protected route', async () => {
  const actions = [];
  const h = createHarness({
    token: 'old-token', role: 'peserta', nama: 'Nama Lama',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      actions.push(body.action);
      if (body.action === 'renewSession') return response({ success: true, token: 'new-token', role: 'peserta', nama: 'Nama Baharu' });
      return response({ success: true, statDaftar: 0, statLulus: 0, statSijil: 0, pendaftaran: [] });
    }
  });
  h.listeners.load();
  await settle();
  assert.equal(actions[0], 'renewSession');
  assert.equal(h.localStorage.getItem('spdk_token'), 'new-token');
  assert.equal(h.localStorage.getItem('spdk_nama'), 'Nama Baharu');
});

test('expired startup session clears auth but preserves pending attendance', async () => {
  const h = createHarness({
    token: 'expired-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async () => response({ success: false, auth: false, message: 'Sesi telah tamat.' })
  });
  h.listeners.load();
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.equal(h.location.hash, '#login');
  assert.match(h.elements.app.innerHTML, /Sesi anda telah tamat\. Sila log masuk semula\./);
  assert.ok(h.sessionStorage.getItem('spdk_pending_attendance'));
});

test('a cleaned-up backend session is treated as expired using the exact message fallback', async () => {
  const h = createHarness({
    token: 'stale-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async () => response({ success: false, message: 'Sesi tidak dijumpai.' })
  });
  h.listeners.load();
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.equal(h.location.hash, '#login');
});

test('network failure during startup retains auth and renders retry state', async () => {
  const h = createHarness({
    token: 'stored-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async () => { throw new Error('offline'); }
  });
  h.listeners.load();
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), 'stored-token');
  assert.match(h.elements.app.innerHTML, /Tidak dapat menyemak sesi/);
  assert.match(h.elements.app.innerHTML, /Cuba Semula/);
  assert.doesNotMatch(h.elements.app.innerHTML, /class="main"/);
});

test('startup session validation times out into retry state without clearing auth', async () => {
  const h = createHarness({
    token: 'stored-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async () => new Promise(() => {})
  });
  h.context.bootstrapAuth(5);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.localStorage.getItem('spdk_token'), 'stored-token');
  assert.match(h.elements.app.innerHTML, /Tidak dapat menyemak sesi/);
});

test('retrying startup validation can recover without clearing the stored token', async () => {
  let renewAttempts = 0;
  const h = createHarness({
    token: 'stored-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async (_url, options = {}) => {
      if (!options.body) return response({ version: '1.0.5' });
      const action = JSON.parse(options.body).action;
      if (action === 'renewSession' && ++renewAttempts === 1) throw new Error('offline');
      if (action === 'renewSession') return response({ success: true });
      return response({ success: true, statDaftar: 0, statLulus: 0, statSijil: 0, pendaftaran: [] });
    }
  });
  h.listeners.load();
  await settle();
  await h.context.bootstrapAuth();
  await settle();
  assert.equal(renewAttempts, 2);
  assert.equal(h.localStorage.getItem('spdk_token'), 'stored-token');
  assert.match(h.elements.app.innerHTML, /class="main"/);
});

test('authenticated API auth failure logs out while public API is exempt', async () => {
  const h = createHarness({
    token: 'stored-token', role: 'peserta', nama: 'Peserta', hash: '#login',
    fetchImpl: async () => response({ success: false, auth: false, message: 'Sesi telah tamat.' })
  });
  for (const action of ['login', 'daftarAkaun', 'lupaKataLaluan', 'resetKataLaluan', 'verifyCert']) {
    const publicResult = await h.context.api(action);
    assert.equal(publicResult.auth, false);
    assert.equal(h.localStorage.getItem('spdk_token'), 'stored-token');
  }

  await assert.rejects(h.context.api('getDashboardPeserta'), /Sesi telah tamat/);
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.ok(h.sessionStorage.getItem('spdk_pending_attendance'));
});

test('manual logout clears auth and routes to login without waiting for the backend', async () => {
  const h = createHarness({
    token: 'stored-token', role: 'peserta', nama: 'Peserta',
    fetchImpl: async () => new Promise(() => {})
  });
  h.context.doLogout();
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.equal(h.location.hash, '#login');
});
