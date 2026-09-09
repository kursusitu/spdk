const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const COURSE_A = 'CRS-03092026-1234';
const COURSE_B = 'CRS-04092026-5678';
const TOKEN = 'admin-session-token';
const FP_A = 'a'.repeat(64), FP_B = 'b'.repeat(64);
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
const counts = (extra = {}) => ({ inserted: 1, updated: 1, unchanged: 2, skipped: 1, errors: 0, ...extra });
const row = (extra = {}) => ({ source: 1, row: 1, kategori: 'Peserta', maskedNoKp: '******-**-1234', status: 'inserted', code: 'CPD_RECORD_OK', ...extra });
const preview = (extra = {}) => ({ success: true, fingerprint: FP_A, canExecute: true, counts: counts(), rows: [row()], ...extra });
const courseList = () => ({ success: true, kursus: [
  { courseId: COURSE_A, namaKursus: 'Kursus Alpha', tarikhMulaInput: '2026-09-03', status: 'tamat' },
  { courseId: COURSE_B, namaKursus: 'Kursus Beta', tarikhMulaInput: '2026-09-04', status: 'aktif' }
] });

const diagnosticSchema=(extra={})=>({source:1,sourceLabel:'Senarai CPD',sourceFile:'Kursus September',sourceTab:'CPD data',
  expectedHeaders:['IC (without "-")','Email'],detectedHeaders:['IC','Email'],missingHeaders:['IC (without "-")'],
  duplicateHeaders:[],reservedHeaders:[],unexpectedHeaders:['IC'],aliasSuggestions:[{detectedHeader:'IC',expectedHeaders:['IC (without "-")'],ambiguous:false}],valid:false,...extra});
const diagnosticIssue=(extra={})=>({type:'SOURCE_INVALID_NOKP',severity:'error',source:1,sourceRow:12,kategori:'Peserta',
  maskedNoKP:'******-**-1234',field:'IC (without "-")',...extra});

test('Phase 1 schema and row issues provide actionable BM preview',async()=>{
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview({canExecute:false,
    sourceSchema:[diagnosticSchema()],issues:[diagnosticIssue(),diagnosticIssue({type:'SOURCE_INVALID_POINTS',sourceRow:18,kategori:'Penceramah'})]})});
  await h.ready();for(const text of ['Struktur sumber perlu diperbaiki','Dijangka:','Dikesan:','Tiada:','Cadangan:',
    'Tiada pemetaan automatik','Sumber 1 / 12','Sumber 1 / 18','Mata CPD tidak sah','NoKP tidak sah','Senarai CPD','Kursus September','CPD data'])assert.ok(h.output().includes(text),text);
  assert.equal(h.nodes['cpd-confirm'].disabled,true);assert.equal(h.nodes['cpd-execute'].disabled,true);
  h.context.cpdSetConfirmed(true);await h.context.cpdExecute();assert.equal(executeCalls(h).length,0);
});
test('Phase 1 diagnostics independently disable confirmation when backend canExecute is inconsistent',async()=>{
  for(const diagnostics of [
    {sourceSchema:[diagnosticSchema()],issues:[]},
    {sourceSchema:[diagnosticSchema({valid:true})],issues:[diagnosticIssue()]}
  ]){
    const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview(diagnostics)});
    await h.ready(true);assert.equal(h.nodes['cpd-confirm'].disabled,true);assert.equal(h.context.cpdCanExecute(),false);
    await h.context.cpdExecute();assert.equal(executeCalls(h).length,0);
  }
});
test('Phase 1 warnings retain explicit confirmation and exact execute contract',async()=>{
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():body.action==='executeCpdSync'?{success:true,counts:counts()}:
    preview({sourceSchema:[diagnosticSchema({valid:true,missingHeaders:[]})],issues:[diagnosticIssue({type:'SOURCE_UNMATCHED_IDENTITY',severity:'warning'})]})});
  await h.ready();assert.equal(h.nodes['cpd-confirm'].disabled,false);assert.equal(h.context.cpdCanExecute(),false);
  assert.match(h.output(),/0 isu menyekat · 1 amaran/);h.context.cpdSetConfirmed(true);await h.context.cpdExecute();
  assert.deepEqual(executeCalls(h)[0].body,{action:'executeCpdSync',token:TOKEN,courseId:COURSE_A,fingerprint:FP_A});
});
test('Phase 1 diagnostics reject partial, unknown or malformed payloads without enabling sync',async()=>{
  for(const diagnostics of [{sourceSchema:[]},{issues:[]},{sourceSchema:null,issues:[]},
    {sourceSchema:[diagnosticSchema()],issues:[diagnosticIssue({type:'NEW_UNKNOWN_CODE'})]},
    {sourceSchema:[diagnosticSchema()],issues:[diagnosticIssue({sourceRow:'12'})]},
    {sourceSchema:[diagnosticSchema()],issues:[diagnosticIssue({source:2})]},
    {sourceSchema:[diagnosticSchema({missingHeaders:'IC'})],issues:[]}]){
    const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview(diagnostics)});await h.ready(true);
    assert.equal(h.page().preview,null);assert.equal(h.context.cpdCanExecute(),false);assert.equal(executeCalls(h).length,0);
  }
});
test('Phase 1 diagnostic strings are escaped, masked and discard raw message/name/email/value fields',async()=>{
  const marker='<img src=x onerror=alert(1)>',secret='900101101234 private@example.test https://docs.google.com/private';
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview({
    sourceSchema:[diagnosticSchema({sourceLabel:marker,sourceFile:secret,sourceTab:marker,detectedHeaders:[marker,secret]})],
    issues:[diagnosticIssue({maskedNoKP:'900101101234',field:secret,message:'PRIVATE MESSAGE',suggestion:'PRIVATE SUGGESTION',value:secret,nama:'PRIVATE NAME',email:secret})]})});
  await h.ready();assert.ok(h.output().includes('&lt;img src=x onerror=alert(1)&gt;'));assert.doesNotMatch(h.output(),/<img src=x/);
  assertPrivate(h,['900101101234','private@example.test','https://docs.google.com/private','PRIVATE MESSAGE','PRIVATE SUGGESTION','PRIVATE NAME']);
  assert.match(h.output(),/\*\*\*\*\*\*-\*\*-\*\*\*\*/);
  assert.equal(JSON.stringify(h.page().preview).includes('PRIVATE'),false);
});
test('Phase 1 ambiguous aliases offer alternatives without choosing a mapping',async()=>{
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview({sourceSchema:[diagnosticSchema({
    aliasSuggestions:[{detectedHeader:'CPD',expectedHeaders:['CPD Peserta','CPD Penceramah'],ambiguous:true}]})],issues:[]})});
  await h.ready();assert.match(h.output(),/Padanan tidak jelas; sahkan kategori/);assert.match(h.output(),/CPD Peserta/);assert.match(h.output(),/CPD Penceramah/);assert.equal(h.context.cpdCanExecute(),false);
});
test('Phase 1 mobile issue cards retain accessible table labels',()=>{
  assert.match(html,/\.cpd-stack \.cpd-issues\{display:block;min-width:0;width:100%\}/);
  assert.match(html,/content:attr\(data-label\)/);assert.match(html,/aria-label="Isu sumber CPD"/);
});
test('Phase 1 action display uses Sheet coordinates without changing legacy row DTO',async()=>{
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?courseList():preview({sourceSchema:[diagnosticSchema({valid:true})],issues:[]})});
  await h.ready();assert.match(h.output(),/<th scope="col">Baris Sheet/);assert.match(h.output(),/<td>Sumber 1<\/td><td>2<\/td>/);
  assert.equal(h.page().preview.rows[0].row,1);
});

function harness({ role = 'admin', token = TOKEN, fetchImpl } = {}) {
  const calls = [], logs = [], rendered = [], timers = new Map(), listeners = {};
  const nodes = {};
  let timerId = 0, output = '', hash = '#admin-cpd';
  function storage(initial) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: key => data.has(key) ? data.get(key) : null,
      setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  }
  const localStorage = storage({ spdk_token: token, spdk_role: role, spdk_nama: 'Operator' });
  const sessionStorage = storage({ spdk_pending_attendance: '{"shortCode":"ABC234","via":"qr"}' });
  const app = {};
  Object.defineProperty(app, 'innerHTML', {
    get: () => output,
    set(value) {
      output = value;
      rendered.push(value);
      for (const key of Object.keys(nodes)) delete nodes[key];
      for (const tag of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        nodes[tag[1]] = { disabled: /\sdisabled(?:[\s>])/.test(tag[0]), checked: /\schecked(?:[\s>])/.test(tag[0]),
          style: {}, textContent: '', innerHTML: '', value: '', addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } };
      }
    }
  });
  const location = {
    pathname: '/spdk/', search: '', reload() {},
    get hash() { return hash; },
    set hash(value) { hash = value; if (listeners.hashchange) queueMicrotask(listeners.hashchange); }
  };
  const window = { location, history: { replaceState() {} }, addEventListener(type, fn) { listeners[type] = fn; } };
  const document = {
    getElementById(id) { return id === 'app' ? app : id === 'lo' ? { style: {} } : id === 'tc' ? { appendChild() {} } : nodes[id] || null; },
    createElement: () => ({ remove() {}, className: '', textContent: '' }),
    querySelectorAll: () => [], body: { appendChild() {} }
  };
  const context = {
    window, document, localStorage, sessionStorage, navigator: {}, URLSearchParams, AbortController,
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    confirm: () => true, queueMicrotask,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      calls.push({ url, body, options });
      const result = fetchImpl ? await fetchImpl(body, options) :
        body.action === 'getSenaraiKursus' ? courseList() :
        body.action === 'previewCpdSync' ? preview() : { success: true, counts: counts() };
      return { ok: true, json: async () => result };
    }
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  vm.runInContext('authBootstrapDone = true;', context);
  return {
    context, calls, logs, rendered, nodes, localStorage, sessionStorage, location,
    output: () => output,
    page: () => context.cpdPage,
    async open() { await context.pgCpdAdmin(); },
    async ready(extra) {
      await this.open();
      context.cpdChangeCourse(COURSE_A);
      await context.cpdPreview();
      if (extra) context.cpdSetConfirmed(true);
    },
    expireTimer() {
      const entry = [...timers.entries()].find(([, timer]) => timer.ms === 60000);
      assert.ok(entry, 'production request timeout must exist');
      timers.delete(entry[0]);
      entry[1].fn();
    }
  };
}
const executeCalls = h => h.calls.filter(call => call.body.action === 'executeCpdSync');
function assertFreshRequired(h) {
  assert.equal(h.page().preview, null);
  assert.equal(h.page().confirmed, false);
  assert.equal(h.context.cpdCanExecute(), false);
}
function assertPrivate(h, secrets) {
  const observable = JSON.stringify([h.rendered, [...h.localStorage.data], [...h.sessionStorage.data], h.location, h.logs]);
  for (const secret of secrets) assert.equal(observable.includes(secret), false, 'Leaked ' + secret);
  assert.equal(observable.includes(FP_A), false, 'Fingerprint persisted or displayed');
}

for (const role of ['admin', 'superadmin', 'peserta']) {
  test(role + ' sidebar CPD visibility and placement', () => {
    const h = harness({ role });
    const output = h.context.shell('Test', 'admin', '');
    assert.equal(output.includes('Pengurusan CPD'), role !== 'peserta');
    if (role !== 'peserta') {
      assert.ok(output.indexOf('Pengurusan CPD') > output.indexOf('Laporan &amp; Statistik'));
      if (role === 'superadmin') assert.ok(output.indexOf('Pengurusan CPD') < output.indexOf('Urus Pengguna'));
    }
  });
}
test('CPD route guard rejects participant and missing session before invoking renderer', async () => {
  for (const options of [{ role: 'peserta' }, { token: '' }]) {
    const h = harness(options);
    let rendered = false;
    h.context.pgCpdAdmin = () => { rendered = true; };
    vm.runInContext("ROUTES['admin-cpd'].r = pgCpdAdmin;", h.context);
    h.context.router();
    assert.equal(rendered, false);
    assert.equal(h.calls.length, 0);
    assert.notEqual(h.location.hash, '#admin-cpd');
    await settle();
  }
});
test('both authorized roles render the guarded CPD page', async () => {
  for (const role of ['admin', 'superadmin']) {
    const h = harness({ role });
    h.context.router();
    await settle();
    assert.match(h.output(), /Pengurusan CPD/);
    assert.deepEqual(h.calls[0].body, { action: 'getSenaraiKursus', token: TOKEN });
  }
});
test('course request and labels use exact contract, include completed courses and escape markup', async () => {
  const h = harness({ fetchImpl: () => ({ success: true, kursus: [
    { courseId: COURSE_A, namaKursus: '<img src=x onerror=alert(1)> & "Alpha"', tarikhMulaInput: '2026-09-03', status: 'tamat' }
  ] }) });
  await h.open();
  assert.deepEqual(h.calls[0].body, { action: 'getSenaraiKursus', token: TOKEN });
  assert.equal(h.calls[0].options.headers['Content-Type'], 'text/plain');
  assert.match(h.output(), /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Alpha&quot;/);
  assert.match(h.output(), /03\/09\/2026/);
  assert.match(h.output(), /Pratonton menggunakan tetapan rasmi CPD kursus semasa/);
  assert.equal(h.nodes['cpd-preview'].disabled, true);
  h.context.cpdChangeCourse(COURSE_A);
  assert.equal(h.nodes['cpd-preview'].disabled, false);
});
test('empty and failed course loading have explicit safe recovery', async () => {
  for (const result of [{ success: true, kursus: [] }, { success: false, message: 'RAW PRIVATE ERROR' }, { success: true, kursus: null }]) {
    const h = harness({ fetchImpl: () => result });
    await h.open();
    assert.match(h.output(), /Tiada kursus tersedia/);
    assert.equal(h.nodes['cpd-preview'].disabled, true);
    assert.match(h.output(), /Muat Semula Kursus/);
    assert.doesNotMatch(h.output(), /RAW PRIVATE ERROR/);
  }
});
test('preview requires course selection and shows loading before exact request resolves', async () => {
  const pending = deferred();
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : pending.promise });
  await h.open();
  await h.context.cpdPreview();
  assert.equal(h.calls.length, 1);
  h.context.cpdChangeCourse(COURSE_A);
  const request = h.context.cpdPreview();
  assert.match(h.output(), /Memuatkan pratonton CPD/);
  assert.deepEqual(h.calls[1].body, { action: 'previewCpdSync', token: TOKEN, courseId: COURSE_A });
  pending.resolve(preview());
  await request;
  assert.match(h.output(), /Tindakan yang Dicadangkan/);
  assert.equal(h.page().canExecute, true);
});
test('summary faithfully displays five record/issue counts without calculating people', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    preview({ counts: counts({ inserted: 3, updated: 4, unchanged: 5, skipped: 6, errors: 7 }), canExecute: false }) });
  await h.ready();
  for (const [value, label] of [[3,'Akan Ditambah'],[4,'Akan Dikemas Kini'],[5,'Tiada Perubahan'],[6,'Dilangkau'],[7,'Perlu Semakan']]) {
    assert.ok(h.output().includes('<div class="sn">' + value + '</div><div class="sl">' + label));
  }
  assert.match(h.output(), /bukan bilangan individu unik/);
  assert.match(h.output(), /Pratonton memerlukan semakan/);
});
test('row zero is a source/system issue and never a participant row', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : preview({
    canExecute: false, counts: counts({ errors: 1 }), rows: [row({ row: 0, kategori: '', status: 'error', code: 'CPD_SOURCE_INVALID' })]
  }) });
  await h.ready();
  assert.match(h.output(), /Semakan sumber\/sistem/);
  assert.doesNotMatch(h.output(), /<td>0<\/td>|\*\*\*\*\*\*-\*\*-1234/);
  assert.match(h.output(), /Konfigurasi sumber tidak lengkap/);
});
const rowMessages = {
  CPD_RECORD_OK: 'Rekod melepasi semakan', CPD_EMPTY: 'Tiada maklumat CPD',
  CPD_INVALID_IC: 'No. Kad Pengenalan tidak sah', CPD_INVALID_TEXT: 'Format maklumat CPD tidak sah',
  CPD_INVALID_RECORD: 'Rekod CPD tidak memenuhi semakan', CPD_SOURCE_INVALID: 'Konfigurasi sumber tidak lengkap',
  CPD_AMBIGUOUS_SOURCE: 'Konfigurasi sumber bertindih', CPD_SOURCE_READ_FAILED: 'Sumber tidak dapat dibaca',
  CPD_HEADER_INVALID: 'Struktur lajur sumber tidak sah', CPD_AMBIGUOUS_MATCH: 'Padanan rekod CPD bertindih',
  CPD_ID_EXHAUSTED: 'Julat ID CPD tahun semasa telah habis'
};
for (const [code, message] of Object.entries(rowMessages)) {
  test('row code ' + code + ' has a local BM explanation', async () => {
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : preview({ rows: [row({ code })] }) });
    await h.ready();
    assert.ok(h.output().includes(message));
  });
}
test('unknown row code and unsafe categories/masks do not expose raw values', async () => {
  const secrets = ['900101101234', 'Private Person', 'private@example.test', 'Secret Organisation', 'private-spreadsheet-id',
    'https://docs.google.com/private-source', '=IMPORTXML("private")', '<svg onload=alert(1)>'];
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : preview({
    secret: secrets.join(' '), rows: [row({ maskedNoKp: secrets[0], noKp: secrets[0], nama: secrets[1], email: secrets[2],
      organisasi: secrets[3], spreadsheetId: secrets[4], sourceUrl: secrets[5], formula: secrets[6],
      code: secrets[7], kategori: secrets[1], message: secrets.join(' ') })]
  }) });
  await h.ready();
  assert.match(h.output(), /\*\*\*\*\*\*-\*\*-\*\*\*\*/);
  assert.match(h.output(), /Maklumat semakan tidak dikenali/);
  assertPrivate(h, secrets);
  assert.deepEqual(Object.keys(h.page().preview).sort(), ['counts','courseId','cpdConfig','fingerprint','readiness','rows']);
  assert.deepEqual(Object.keys(h.page().preview.rows[0]).sort(), ['code','kategori','maskedNoKp','row','source','status']);
});
test('confirmation starts unchecked and execute requires a valid current preview', async () => {
  const h = harness();
  await h.ready();
  assert.equal(h.nodes['cpd-confirm'].checked, false);
  assert.equal(h.nodes['cpd-execute'].disabled, true);
  await h.context.cpdExecute();
  assert.equal(executeCalls(h).length, 0);
  h.context.cpdSetConfirmed(true);
  assert.equal(h.nodes['cpd-execute'].disabled, false);
  h.context.cpdSetConfirmed(false);
  assert.equal(h.nodes['cpd-execute'].disabled, true);
});
test('execute sends only course and displayed fingerprint, then shows acknowledged counts and discards preview', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? preview() : { success: true, counts: counts({ inserted: 9, updated: 8 }) } });
  await h.ready(true);
  await h.context.cpdExecute();
  assert.deepEqual(executeCalls(h)[0].body, { action: 'executeCpdSync', token: TOKEN, courseId: COURSE_A, fingerprint: FP_A });
  assertFreshRequired(h);
  assert.match(h.output(), /9 ditambah, 8 dikemas kini/);
  assertPrivate(h, []);
});
test('course switch invalidates preview and rejects use of its old fingerprint', async () => {
  const h = harness();
  await h.ready(true);
  h.context.cpdChangeCourse(COURSE_B);
  assertFreshRequired(h);
  await h.context.cpdExecute();
  assert.equal(executeCalls(h).length, 0);
  // Even an inconsistent in-memory preview must not execute against another selected course.
  h.page().preview = { courseId: COURSE_A, fingerprint: FP_A, counts: counts(), rows: [row()] };
  Object.assign(h.page(), { canExecute: true, confirmed: true, phase: 'preview' });
  assert.equal(h.context.cpdCanExecute(), false);
});
test('new preview immediately clears prior confirmation and uses only its new fingerprint', async () => {
  const pending = deferred(); let calls = 0;
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? (++calls === 1 ? preview() : pending.promise) : { success: true, counts: counts() } });
  await h.ready(true);
  const request = h.context.cpdPreview();
  assertFreshRequired(h);
  await h.context.cpdExecute();
  assert.equal(executeCalls(h).length, 0);
  pending.resolve(preview({ fingerprint: FP_B }));
  await request;
  assert.equal(h.nodes['cpd-confirm'].checked, false);
  h.context.cpdSetConfirmed(true);
  await h.context.cpdExecute();
  assert.equal(executeCalls(h)[0].body.fingerprint, FP_B);
});
for (const scenario of ['canExecute false', 'errors', 'no changes']) {
  test('execution is blocked for ' + scenario + ' even if confirmation handler is called', async () => {
    const result = preview({
      canExecute: scenario !== 'canExecute false',
      counts: counts(scenario === 'errors' ? { errors: 1 } : scenario === 'no changes' ? { inserted: 0, updated: 0 } : {})
    });
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : result });
    await h.ready(true);
    await h.context.cpdExecute();
    assert.equal(executeCalls(h).length, 0);
    assert.equal(h.nodes['cpd-execute'].disabled, true);
    if (scenario === 'no changes') assert.match(h.output(), /Tiada perubahan CPD yang perlu disegerakkan/);
  });
}
test('late Course A preview cannot replace the current Course B preview', async () => {
  const a = deferred();
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.courseId === COURSE_A ? a.promise : preview({ fingerprint: FP_B }) });
  await h.open();
  h.context.cpdChangeCourse(COURSE_A);
  const pending = h.context.cpdPreview();
  h.context.cpdChangeCourse(COURSE_B);
  await h.context.cpdPreview();
  a.resolve(preview());
  await pending;
  assert.equal(h.page().courseId, COURSE_B);
  assert.equal(h.page().preview.courseId, COURSE_B);
  assert.equal(h.page().preview.fingerprint, FP_B);
});
test('newer preview of the same course wins over a late older response', async () => {
  const old = deferred(); let reads = 0;
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    ++reads === 1 ? old.promise : preview({ fingerprint: FP_B }) });
  await h.open();
  h.context.cpdChangeCourse(COURSE_A);
  const earlier = h.context.cpdPreview();
  await h.context.cpdPreview();
  old.resolve(preview());
  await earlier;
  assert.equal(h.page().preview.fingerprint, FP_B);
});
test('execute synchronously blocks double click, repeated confirmation, course changes and new preview', async () => {
  const pending = deferred();
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? preview() : pending.promise });
  await h.ready(true);
  const first = h.context.cpdExecute();
  assert.equal(h.nodes['cpd-execute'].disabled, true);
  assert.equal(h.nodes['cpd-confirm'].disabled, true);
  assert.equal(h.nodes['cpd-course'].disabled, true);
  assert.equal(h.nodes['cpd-preview'].disabled, true);
  const second = h.context.cpdExecute();
  h.context.cpdSetConfirmed(false);
  assert.equal(h.page().confirmed, true);
  h.context.cpdChangeCourse(COURSE_B);
  assert.equal(h.page().courseId, COURSE_A);
  await h.context.cpdPreview();
  await h.context.cpdLoadCourses();
  assert.equal(h.calls.length, 3);
  assert.equal(executeCalls(h).length, 1);
  pending.resolve({ success: true, counts: counts() });
  await Promise.all([first, second]);
  assertFreshRequired(h);
});
for (const mode of ['navigation', 'direct hash navigation', 'logout', 'session expiry']) {
  test(mode + ' immediately discards confirmation and ignores pending preview response', async () => {
    const pending = deferred(); let reads = 0;
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
      body.action === 'previewCpdSync' ? (++reads === 1 ? preview() : pending.promise) : { success: true } });
    await h.ready(true);
    const oldPage = h.page();
    const request = h.context.cpdPreview();
    if (mode === 'navigation') h.context.goTo('admin');
    if (mode === 'direct hash navigation') { h.location.hash = '#admin'; h.context.router(); }
    if (mode === 'logout') h.context.doLogout();
    if (mode === 'session expiry') h.context.handleExpiredSession();
    assert.equal(h.page(), null);
    assert.equal(oldPage.preview, null);
    assert.equal(oldPage.confirmed, false);
    pending.resolve(preview({ fingerprint: FP_B }));
    await request;
    await settle();
    assert.equal(h.page(), null);
    assert.equal(h.sessionStorage.getItem('spdk_pending_attendance'), '{"shortCode":"ABC234","via":"qr"}');
  });
}
const errorMessages = {
  CPD_CONFIG_INVALID: 'Tetapan CPD tidak sah', CPD_CONFIG_CONFLICT: 'Tetapan CPD telah berubah',
  CPD_CONFIG_NUMBER_LOCKED: 'No. CPD telah digunakan', CPD_MIXED_SOURCE_MODE: 'konflik antara sumber CPD lama',
  CPD_MANAGED_SOURCE_NOT_READY: 'Maklumat dalaman untuk menyediakan calon CPD belum lengkap',
  CPD_INVALID_PAYLOAD: 'Permintaan CPD tidak sah', CPD_INVALID_COURSE: 'CourseID tidak sah',
  CPD_FINGERPRINT_REQUIRED: 'Pratonton CPD yang sah diperlukan', CPD_AUTH_REQUIRED: 'Sesi',
  CPD_FORBIDDEN: 'Akses ditolak', CPD_COURSE_NOT_FOUND: 'Kursus tidak dijumpai',
  CPD_NO_ACTIVE_SOURCE: 'Tiada sumber CPD aktif', CPD_SOURCE_CHANGED: 'Sila buat pratonton baharu',
  CPD_LOCK_TIMEOUT: 'Penyegerakan sedang digunakan', CPD_VALIDATION_FAILED: 'Semakan CPD gagal',
  CPD_HEADER_INVALID: 'Struktur data CPD tidak sah', CPD_INVALID_VALUE: 'Jenis nilai data CPD tidak sah',
  CPD_PARTIAL_WRITE: 'Sebahagian perubahan mungkin telah disimpan', CPD_INTERNAL_ERROR: 'Ralat sistem semasa penyegerakan CPD'
};
for (const [code, message] of Object.entries(errorMessages)) {
  test('execute maps ' + code + ' locally and clears confirmation', async () => {
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
      body.action === 'previewCpdSync' ? preview() : { success: false, code, message: 'RAW PRIVATE ERROR 900101101234' } });
    await h.ready(true);
    await h.context.cpdExecute();
    await settle();
    if (code === 'CPD_AUTH_REQUIRED') {
      assert.equal(h.page(), null);
      assert.equal(h.location.hash, '#login');
    } else {
      assertFreshRequired(h);
      assert.ok(h.output().includes(message));
      if (code === 'CPD_FORBIDDEN') {
        assert.equal(h.nodes['cpd-course'].disabled, true);
        await h.context.cpdPreview();
        await h.context.cpdLoadCourses();
        assert.equal(h.calls.length, 3);
      }
    }
    assertPrivate(h, ['RAW PRIVATE ERROR', '900101101234']);
    assert.equal(executeCalls(h).length, 1);
  });
}
test('no active source has an explicit safe preview state', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    { success: false, code: 'CPD_NO_ACTIVE_SOURCE', message: 'private-source-url' } });
  await h.ready();
  assertFreshRequired(h);
  assert.match(h.output(), /Tiada sumber CPD aktif untuk kursus ini/);
  assertPrivate(h, ['private-source-url']);
});
for (const failure of ['partial write', 'transport failure', 'timeout', 'malformed', 'unknown code']) {
  test(failure + ' never retries execute automatically and fresh unchanged preview is normal', async () => {
    const pending = deferred(); let previews = 0;
    const h = harness({ fetchImpl: body => {
      if (body.action === 'getSenaraiKursus') return courseList();
      if (body.action === 'previewCpdSync') return ++previews === 1 ? preview() :
        preview({ fingerprint: FP_B, counts: counts({ inserted: 0, updated: 0, unchanged: 4 }), rows: [row({ status: 'unchanged' })] });
      if (failure === 'partial write') return { success: false, code: 'CPD_PARTIAL_WRITE', message: 'secret' };
      if (failure === 'transport failure') throw new Error('RAW NETWORK 900101101234');
      if (failure === 'timeout') return pending.promise;
      if (failure === 'unknown code') return { success: false, code: 'PRIVATE_UNKNOWN', message: 'secret' };
      return { success: true, counts: { inserted: 'secret' } };
    } });
    await h.ready(true);
    const request = h.context.cpdExecute();
    if (failure === 'timeout') h.expireTimer();
    await request;
    await settle();
    assertFreshRequired(h);
    assert.equal(executeCalls(h).length, 1);
    assert.match(h.output(), /Keputusan Penyegerakan Tidak Pasti/);
    assert.match(h.output(), /Buat Pratonton Baharu/);
    assert.doesNotMatch(h.output(), /Keputusan yang disahkan|RAW NETWORK|secret|PRIVATE_UNKNOWN/);
    await h.context.cpdPreview();
    assert.equal(h.page().preview.counts.unchanged, 4);
    assert.match(h.output(), /Tiada perubahan CPD yang perlu disegerakkan/);
    h.context.cpdSetConfirmed(true);
    await h.context.cpdExecute();
    assert.equal(executeCalls(h).length, 1);
    if (failure === 'timeout') { pending.resolve({ success: true, counts: counts() }); await settle(); }
    assert.equal(h.page().preview.fingerprint, FP_B);
  });
}
test('central auth:false flow clears CPD state and preserves pending attendance', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? preview() : { success: false, auth: false, message: 'RAW AUTH SECRET' } });
  await h.ready(true);
  await h.context.cpdExecute();
  await settle();
  assert.equal(h.page(), null);
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.equal(h.location.hash, '#login');
  assert.ok(h.sessionStorage.getItem('spdk_pending_attendance'));
  assertPrivate(h, ['RAW AUTH SECRET']);
});
test('malformed previews cannot supply a confirmation payload or raw errors', async () => {
  const invalid = [null, {}, { success: false, message: 'RAW SECRET' }, preview({ fingerprint: 'bad' }),
    preview({ canExecute: 'true' }), preview({ counts: counts({ errors: -1 }) }),
    preview({ rows: [row({ source: 'secret' })] }), preview({ rows: [row({ status: '__proto__' })] })];
  for (const result of invalid) {
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() : result });
    await h.ready();
    assertFreshRequired(h);
    assert.match(h.output(), /Ralat sistem semasa penyegerakan CPD/);
    assertPrivate(h, ['RAW SECRET']);
  }
});
test('navigation during execute does not allow a second run after returning', async () => {
  const pending = deferred();
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? preview() : pending.promise });
  await h.ready(true);
  const request = h.context.cpdExecute();
  h.context.goTo('admin');
  assert.equal(h.page(), null);
  h.location.hash = '#admin-cpd';
  await settle();
  assert.equal(h.nodes['cpd-preview'].disabled, true);
  await h.context.cpdPreview();
  assert.equal(executeCalls(h).length, 1);
  pending.resolve({ success: true, counts: counts() });
  await request;
  assertFreshRequired(h);
  assert.match(h.output(), /Penyegerakan selesai/);
});
for (const outcome of ['success', 'partial write']) {
  test('returning during execute preserves the slower course load after ' + outcome, async () => {
    const execution = deferred(), courses = deferred();
    let courseReads = 0;
    const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ?
      (++courseReads === 1 ? courseList() : courses.promise) :
      body.action === 'previewCpdSync' ? preview() : execution.promise });
    await h.ready(true);
    const request = h.context.cpdExecute();
    h.context.goTo('admin');
    await settle();
    h.location.hash = '#admin-cpd';
    await settle();
    assert.equal(h.page().phase, 'courses');
    execution.resolve(outcome === 'success' ? { success: true, counts: counts() } :
      { success: false, code: 'CPD_PARTIAL_WRITE' });
    await request;
    assertFreshRequired(h);
    assert.match(h.output(), /Memuatkan senarai kursus/);
    assert.equal(h.nodes['cpd-preview'].disabled, true);
    courses.resolve(courseList());
    await settle();
    assert.equal(h.page().phase, 'ready');
    assert.equal(h.page().courseId, COURSE_A);
    assert.equal(h.page().courses.length, 2);
    assert.ok(h.output().includes('<option value="' + COURSE_A + '" selected>'));
    assert.match(h.output(), outcome === 'success' ? /Penyegerakan selesai/ : /Sebahagian perubahan mungkin telah disimpan/);
    await h.context.cpdPreview();
    h.context.cpdSetConfirmed(true);
    assert.match(h.output(), /Kursus: <strong>Kursus Alpha<\/strong>/);
    assert.equal(h.context.cpdCanExecute(), true);
    assert.equal(executeCalls(h).length, 1);
  });
}
test('unresolved selected course cannot execute and rendering clears its confirmation', async () => {
  for (const courses of [[], [{ courseId: COURSE_B, namaKursus: 'Kursus Beta' }],
    [{ courseId: COURSE_A, namaKursus: '   ' }]]) {
    const h = harness();
    await h.ready(true);
    h.page().courses = courses;
    assert.equal(h.context.cpdCanExecute(), false);
    await h.context.cpdExecute();
    assert.equal(executeCalls(h).length, 0);
    h.context.cpdRender();
    assertFreshRequired(h);
    assert.equal(h.page().courseId, '');
    assert.doesNotMatch(h.output(), /2\. Sahkan Penyegerakan|Kursus: <strong><\/strong>/);
    await h.context.cpdPreview();
    assert.equal(h.calls.filter(call => call.body.action === 'previewCpdSync').length, 1);
  }
});
test('returning course load that no longer contains the running course clears its selection', async () => {
  const execution = deferred(), courses = deferred();
  let courseReads = 0;
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ?
    (++courseReads === 1 ? courseList() : courses.promise) :
    body.action === 'previewCpdSync' ? preview() : execution.promise });
  await h.ready(true);
  const request = h.context.cpdExecute();
  h.context.goTo('admin');
  await settle();
  h.location.hash = '#admin-cpd';
  await settle();
  execution.resolve({ success: false, code: 'CPD_PARTIAL_WRITE' });
  await request;
  courses.resolve({ success: true, kursus: [courseList().kursus[1]] });
  await settle();
  assert.equal(h.page().courseId, '');
  assert.equal(h.page().courses.length, 1);
  assertFreshRequired(h);
  assert.equal(h.nodes['cpd-preview'].disabled, true);
  assert.match(h.output(), /Sebahagian perubahan mungkin telah disimpan/);
});
test('old-token auth failure cannot log out a replacement session or discard its preview', async () => {
  const old = deferred();
  let previewReads = 0;
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? (++previewReads === 1 ? old.promise : preview({ fingerprint: FP_B })) : { success: true } });
  await h.open();
  h.context.cpdChangeCourse(COURSE_A);
  const request = h.context.cpdPreview();
  await h.context.doLogout();
  await settle();
  h.context.saveAuth('replacement-token', 'admin', 'Replacement');
  h.location.hash = '#admin-cpd';
  await settle();
  h.context.cpdChangeCourse(COURSE_B);
  await h.context.cpdPreview();
  h.context.cpdSetConfirmed(true);
  old.resolve({ success: false, auth: false, code: 'CPD_AUTH_REQUIRED', message: 'RAW OLD AUTH' });
  await request;
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), 'replacement-token');
  assert.equal(h.location.hash, '#admin-cpd');
  assert.equal(h.page().preview.fingerprint, FP_B);
  assert.equal(h.context.cpdCanExecute(), true);
  assertPrivate(h, ['RAW OLD AUTH']);
});
test('current-token preview auth failure still expires the active session', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    { success: false, auth: false, code: 'CPD_AUTH_REQUIRED', message: 'RAW CURRENT AUTH' } });
  await h.ready();
  await settle();
  assert.equal(h.localStorage.getItem('spdk_token'), null);
  assert.equal(h.page(), null);
  assert.equal(h.location.hash, '#login');
  assert.ok(h.sessionStorage.getItem('spdk_pending_attendance'));
  assertPrivate(h, ['RAW CURRENT AUTH']);
});
test('session-scoped API handling leaves successful responses and payloads unchanged', async () => {
  const result = { success: true, kursus: courseList().kursus };
  const h = harness({ fetchImpl: () => result });
  assert.deepEqual(plain(await h.context.api('getSenaraiKursus')), result);
  assert.deepEqual(h.calls[0].body, { action: 'getSenaraiKursus', token: TOKEN });
  assert.equal(h.localStorage.getItem('spdk_token'), TOKEN);
  assert.equal(h.location.hash, '#admin-cpd');
});
function renderedEvent(h, id, attribute, target = {}) {
  const tag = h.output().match(new RegExp('<[^>]+\\bid="' + id + '"[^>]*>'));
  assert.ok(tag, 'Rendered control ' + id + ' must exist');
  const handler = tag[0].match(new RegExp('\\b' + attribute + '="([^"]+)"'));
  assert.ok(handler, id + ' must retain its ' + attribute + ' wiring');
  h.context.__eventTarget = target;
  try { vm.runInContext('(function(){' + handler[1] + '}).call(__eventTarget)', h.context); }
  finally { delete h.context.__eventTarget; }
}
test('rendered checkbox change invokes the real confirmation handler', async () => {
  const h = harness();
  await h.ready();
  assert.equal(h.nodes['cpd-execute'].disabled, true);
  renderedEvent(h, 'cpd-confirm', 'onchange', { checked: true });
  assert.equal(h.page().confirmed, true);
  assert.equal(h.nodes['cpd-execute'].disabled, false);
  renderedEvent(h, 'cpd-confirm', 'onchange', { checked: false });
  assert.equal(h.page().confirmed, false);
  assert.equal(h.nodes['cpd-execute'].disabled, true);
});
test('rendered execute click invokes the real execute handler with the confirmed payload', async () => {
  const h = harness();
  await h.ready(true);
  renderedEvent(h, 'cpd-execute', 'onclick');
  await settle();
  assert.deepEqual(executeCalls(h).map(call => call.body), [
    { action: 'executeCpdSync', token: TOKEN, courseId: COURSE_A, fingerprint: FP_A }
  ]);
  assert.match(h.output(), /Penyegerakan selesai/);
  assertFreshRequired(h);
});
test('CPD grid contains its wide table with a zero-minimum column', () => {
  const rule = html.match(/\.cpd-stack\s*\{([^}]+)\}/);
  assert.ok(rule, 'CPD grid rule must exist');
  assert.match(rule[1], /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/);
});
test('mobile and accessibility contracts retain scrollable table, labels and persistent warning', async () => {
  const h = harness({ fetchImpl: body => body.action === 'getSenaraiKursus' ? courseList() :
    body.action === 'previewCpdSync' ? preview() : { success: false, code: 'CPD_PARTIAL_WRITE' } });
  await h.ready(true);
  assert.match(h.output(), /<label[^>]*for="cpd-course"/);
  assert.match(h.output(), /<label[^>]*for="cpd-confirm"/);
  assert.match(h.output(), /id="cpd-confirm" type="checkbox"/);
  assert.match(h.output(), /class="tw" tabindex="0" role="region" aria-label=/);
  assert.match(h.output(), /<th scope="col">No\. KP Bertopeng/);
  assert.match(html, /\.tw\{overflow-x:auto/);
  assert.match(html, /\.cpd-stack \.sg\{[^}]*repeat\(auto-fit,minmax\(140px,1fr\)\)/);
  assert.match(html, /\.cpd-confirm input\{[^}]*width:20px/);
  await h.context.cpdExecute();
  assert.match(h.output(), /id="cpd-result" aria-live="polite"/);
  assert.match(h.output(), /role="alert"/);
  assert.match(h.output(), /Sebahagian perubahan mungkin telah disimpan/);
});
test('PWA versions stay synchronized for the CPD release', () => {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
  const worker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(html.includes("const APP_VERSION='" + version + "'"));
  assert.ok(worker.includes("spdk-cache-v" + version + "'"));
});

test('course selection displays legacy, disabled and managed award summaries', async()=>{
  const configs=[
    {config:{mode:'legacy',peserta:null,penceramah:null,revision:0},text:/Sumber CPD sedia ada/},
    {config:{mode:'disabled',peserta:null,penceramah:null,revision:2},text:/CPD dinyahaktifkan/},
    {config:{mode:'managed',peserta:{noCpd:'DVSCPD-2026-123',points:4},penceramah:null,revision:3},text:/DVSCPD-2026-123/},
    {config:{mode:'managed',peserta:null,penceramah:{noCpd:'VETCPD-2026-456',points:2},revision:4},text:/VETCPD-2026-456/},
    {config:{mode:'managed',peserta:{noCpd:'DVSCPD-2026-123',points:4},penceramah:{noCpd:'VETCPD-2026-456',points:2},revision:5},text:/Mata CPD: 2/}
  ];
  for(const item of configs){const h=harness({fetchImpl:()=>({success:true,kursus:[{courseId:COURSE_A,namaKursus:'Kursus',cpdConfig:item.config}]})});await h.open();h.context.cpdChangeCourse(COURSE_A);assert.match(h.output(),item.text);if(item.config.mode==='managed'&&(!item.config.peserta||!item.config.penceramah))assert.match(h.output(),/Tidak dikonfigurasi/);}
});
for(const readiness of ['ready','disabled','no_candidates'])test('preview renders readiness '+readiness+' and enforces execute gate',async()=>{
  const cfg={mode:'managed',peserta:{noCpd:'DVSCPD-2026-123',points:4},penceramah:null,revision:3};
  const h=harness({fetchImpl:body=>body.action==='getSenaraiKursus'?{success:true,kursus:[{courseId:COURSE_A,namaKursus:'Kursus',cpdConfig:cfg}]}:preview({readiness,cpdConfig:cfg})});
  await h.ready(true);assert.match(h.output(),new RegExp(readiness==='ready'?'Sedia untuk pratonton':readiness==='disabled'?'dinyahaktifkan':'Tiada calon CPD'));
  assert.match(h.output(),/Takrif anugerah semasa/);assert.match(h.output(),/DVSCPD-2026-123/);assert.match(h.output(),/No\. KP Bertopeng/);
  await h.context.cpdExecute();assert.equal(executeCalls(h).length,readiness==='ready'?1:0);
});
