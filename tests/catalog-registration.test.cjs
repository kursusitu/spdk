const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function loadAppScript() {
  const listeners = {};
  const window = {
    location: { pathname: '/spdk/', search: '', hash: '#login', reload() {} },
    history: { replaceState() {} },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const context = {
    console,
    confirm: () => true,
    document: {
      body: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ remove() {} })
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {},
    setTimeout,
    clearTimeout,
    queueMicrotask,
    URLSearchParams,
    window
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(inlineScript, context);
  return context;
}

const app = loadAppScript();

test('registration is open only within the configured registration window', () => {
  const state = app.getKatalogRegistrationState({
    status: 'aktif',
    tarikhMulaInput: '2026-07-20',
    tarikhTamatInput: '2026-07-22',
    tarikhMulaDaftarInput: '2026-07-01',
    tarikhTutupDaftarInput: '2026-07-19'
  }, '2026-07-14');

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    statusLabel: 'Pendaftaran Dibuka',
    infoText: '',
    buttonText: 'Daftar Sekarang',
    disabled: false
  });
});

test('registration is disabled after closing date but before course starts', () => {
  const state = app.getKatalogRegistrationState({
    status: 'aktif',
    tarikhMulaInput: '20/07/2026',
    tarikhTamatInput: '22/07/2026',
    tarikhMulaDaftarInput: '01/07/2026 00:00:00',
    tarikhTutupDaftarInput: '12/07/2026 23:59:59'
  }, '2026-07-14');

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    statusLabel: 'Pendaftaran Ditutup',
    infoText: 'Pendaftaran ditutup pada 12 Julai 2026',
    buttonText: 'Pendaftaran Ditutup',
    disabled: true
  });
});

test('ongoing course remains visible with closed registration', () => {
  const state = app.getKatalogRegistrationState({
    status: 'aktif',
    tarikhMula: '2026-07-13T00:00:00.000Z',
    tarikhTamat: '2026-07-15T00:00:00.000Z',
    tarikhMulaDaftar: '06/07/2026',
    tarikhTutupDaftar: '12/07/2026'
  }, '2026-07-14');

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    statusLabel: 'Sedang Berlangsung',
    infoText: 'Pendaftaran ditutup pada 12 Julai 2026',
    buttonText: 'Pendaftaran Ditutup',
    disabled: true
  });
});

test('registration is disabled before its opening date', () => {
  const state = app.getKatalogRegistrationState({
    status: 'aktif',
    tarikhMulaInput: '2026-08-20',
    tarikhTamatInput: '2026-08-22',
    tarikhMulaDaftarInput: '2026-08-01',
    tarikhTutupDaftarInput: '2026-08-19'
  }, '2026-07-14');

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    statusLabel: 'Pendaftaran Belum Dibuka',
    infoText: 'Pendaftaran dibuka pada 1 Ogos 2026',
    buttonText: 'Belum Dibuka',
    disabled: true
  });
});
