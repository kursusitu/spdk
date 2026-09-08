const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
      createElement: () => ({ remove() {} }),
      querySelectorAll: () => []
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

function reportFixture() {
  return {
    success: true,
    statKursus: { jumlah: 4, aktif: 2, tamat: 1, dibatal: 1 },
    statPeserta: { jumlahUnik: 7, jumlahDaftar: 13 },
    statSijil: { jumlah: 9, jumlahPeserta: 6, jumlahPenceramah: 3 },
    statKehadiran: {
      purataPct: 75,
      jumlahHadir: 18,
      jumlahTidakHadir: 6,
      jumlahPeluang: 24,
      kursusTarikhTidakSah: 1
    },
    chartPendaftaranBulan: [
      { bulan: 'Jul 2026', jumlah: 3 },
      { bulan: 'Ogos 2026', jumlah: 5 }
    ],
    chartStatusPendaftaran: { lulus: 8, menunggu: 2, tolak: 2, batal: 1 },
    laporanKursus: [],
    laporanPendaftaran: [],
    laporanKehadiran: [],
    laporanMaklumBalas: []
  };
}

test('summary uses corrected KPI meanings and exposes certificate split', () => {
  const app = loadAppScript();
  const output = app.laporanRingkasanHtml(reportFixture());

  assert.match(output, /Jumlah Kursus/);
  assert.match(output, />4</);
  assert.match(output, /Peserta Berdaftar Unik/);
  assert.match(output, />7</);
  assert.match(output, /13 jumlah pendaftaran/);
  assert.doesNotMatch(output, /Jumlah Pengguna/);
  assert.doesNotMatch(output, /Pendaftaran Lulus/);
  assert.match(output, /Sijil Dijana/);
  assert.match(output, /Peserta: 6/);
  assert.match(output, /Penceramah: 3/);
  assert.match(output, /class="sn">75%/);
  assert.match(output, /18 daripada 24 slot peserta-hari/);
  assert.match(output, /1 kursus mempunyai tarikh tidak sah/);
});

test('course rows use effective status, quota semantics, attendance validity and certificate types', () => {
  const app = loadAppScript();
  const output = app.laporanKursusRowsHtml([
    {
      courseId: 'CRS-1', namaKursus: 'Kursus Terhad', tarikhMula: '01/08/2026',
      tarikhTamat: '02/08/2026', tempat: 'ITU', status: 'aktif', statusAsal: 'aktif',
      statusEfektif: 'penuh', hadPeserta: 2, jumlahPeserta: 2, bakiTempat: 0,
      kuotaTanpaHad: false, pctPenggunaanKuota: 100, bilDaftar: 3, bilLulus: 2,
      bilTolak: 1, bilHadir: 3, jumlahPeluangKehadiran: 4, pctKehadiran: 75,
      statusKiraanKehadiran: 'dikira', puratRating: 4.5, bilSijil: 3,
      bilSijilPeserta: 2, bilSijilPenceramah: 1
    },
    {
      courseId: 'CRS-2', namaKursus: 'Kursus Tanpa Had', tarikhMula: '',
      tarikhTamat: '', tempat: 'Online', status: 'aktif', statusAsal: 'aktif',
      statusEfektif: 'aktif', hadPeserta: null, jumlahPeserta: 4, bakiTempat: null,
      kuotaTanpaHad: true, pctPenggunaanKuota: null, bilDaftar: 4, bilLulus: 4,
      bilTolak: 0, bilHadir: 0, jumlahPeluangKehadiran: 0, pctKehadiran: 0,
      statusKiraanKehadiran: 'tarikh_tidak_sah', puratRating: 0, bilSijil: 0,
      bilSijilPeserta: 0, bilSijilPenceramah: 0
    }
  ]);

  assert.match(output, /Penuh/);
  assert.match(output, /Pengisian: 2 \/ 2/);
  assert.match(output, /Baki: 0 tempat/);
  assert.match(output, /Penggunaan: 100%/);
  assert.match(output, /Tanpa Had/);
  assert.match(output, /Pengisian: 4/);
  assert.match(output, /Tarikh tidak sah/);
  assert.match(output, /Peserta: 2/);
  assert.match(output, /Penceramah: 1/);
  assert.match(output, /Jumlah: 3/);
});

test('attendance methods use all three current SPDK labels', () => {
  const app = loadAppScript();
  assert.equal(app.laporanKaedahLabel('qr_scan'), 'Imbasan QR');
  assert.equal(app.laporanKaedahLabel('self_link'), 'Pautan Kehadiran');
  assert.equal(app.laporanKaedahLabel('manual'), 'Manual');
});

test('report navigation is visible to admin and superadmin while route guard stays unchanged', () => {
  const app = loadAppScript();
  vm.runInContext("S.role='admin'; S.nama='Admin'", app);
  assert.match(app.shell('Laporan', 'laporan', ''), /goTo\('laporan'\)[^>]*>Laporan &amp; Statistik</);

  vm.runInContext("S.role='superadmin'; S.nama='Superadmin'", app);
  const superadminShell = app.shell('Laporan', 'laporan', '');
  assert.match(superadminShell, /goTo\('laporan'\)[^>]*>Laporan &amp; Statistik</);
  assert.match(superadminShell, /Urus Pengguna/);

  const roles = vm.runInContext("ROUTES.laporan.role.slice()", app);
  assert.deepEqual(Array.from(roles), ['admin', 'superadmin']);
});

test('report shell contains all five tabs and backend failures render a retry state safely', () => {
  const app = loadAppScript();
  const page = app.laporanPageContentHtml();
  for (const label of ['Ringkasan', 'Kursus', 'Pendaftaran', 'Kehadiran', 'Maklum Balas']) {
    assert.match(page, new RegExp(label));
  }

  const error = app.laporanErrorHtml('<b>Backend gagal</b>');
  assert.match(error, /&lt;b&gt;Backend gagal&lt;\/b&gt;/);
  assert.match(error, /Cuba Semula/);
  assert.doesNotMatch(error, /<b>Backend gagal<\/b>/);
});

test('report UI does not advertise unavailable PDF or Excel exports', () => {
  const app = loadAppScript();
  const output = [
    app.laporanPageContentHtml(),
    app.laporanRingkasanHtml(reportFixture()),
    app.laporanKursusPanelHtml(),
    app.laporanPendaftaranPanelHtml([]),
    app.laporanKehadiranPanelHtml(),
    app.laporanMaklumBalasPanelHtml([])
  ].join('');

  assert.doesNotMatch(output, /Export PDF|Export Excel|exportPDF|exportExcel/i);
});

test('client-side course filters combine search, effective status and quota type', () => {
  const app = loadAppScript();
  const rows = [
    { namaKursus: 'Asas Unggas', statusEfektif: 'penuh', kuotaTanpaHad: false },
    { namaKursus: 'Biosekuriti', statusEfektif: 'aktif', kuotaTanpaHad: true }
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(app.laporanTapisKursus(rows, { carian: 'unggas', status: 'penuh', kuota: 'terhad' }))),
    [rows[0]]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.laporanTapisKursus(rows, { carian: '', status: '', kuota: 'tanpa_had' }))),
    [rows[1]]
  );
});

test('registration month options are ordered by year and month, newest first', () => {
  const app = loadAppScript();
  const options = app.laporanPilihanBulan([
    { tarikhDaftar: '15/12/2025' },
    { tarikhDaftar: '02/01/2026' },
    { tarikhDaftar: '20/11/2025' }
  ]);

  assert.ok(options.indexOf('Jan 2026') < options.indexOf('Dis 2025'));
  assert.ok(options.indexOf('Dis 2025') < options.indexOf('Nov 2025'));
});

test('PWA application, release metadata and service-worker cache are consistently versioned at 1.0.14', () => {
  const app = loadAppScript();
  const appVersion = vm.runInContext('APP_VERSION', app);
  const versionInfo = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert.equal(appVersion, '1.0.14');
  assert.equal(versionInfo.version, '1.0.14');
  assert.match(serviceWorker, /spdk-cache-v1\.0\.14/);
});
