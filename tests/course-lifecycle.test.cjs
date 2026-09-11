const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function harness(payload={}){
  const els=Object.fromEntries(['app','dc','kuc','kc','tc','lo'].map(k=>[k,{innerHTML:'',style:{},appendChild(){}}]));
  const c={console,URLSearchParams,AbortController,queueMicrotask,setTimeout,clearTimeout,navigator:{},
    localStorage:{getItem:k=>({spdk_token:'local',spdk_role:'admin',spdk_nama:'Ujian'})[k],setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    window:{location:{hash:'#admin',search:'',pathname:'/'},history:{replaceState(){}},addEventListener(){}},
    document:{getElementById:k=>els[k],createElement:()=>({remove(){}}),body:{appendChild(){}}},
    fetch:async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({success:true,...payload})})};
  vm.createContext(c);vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);
  return {c,els};
}
const ended={courseId:'C',namaKursus:'Kursus Setempat',status:'aktif',statusAsal:'aktif',statusLifecycle:'tamat',statusDisplay:'Tamat',hadPeserta:1,jumlahPeserta:1,statusKuota:'penuh'};
for(const [key,label] of Object.entries({akan_datang:'Akan Datang',aktif:'Aktif',tamat:'Tamat',dibatal:'Dibatalkan',perlu_semakan:'Perlu Semakan'}))test('course badge '+label,()=>{
  const {c}=harness();assert.match(c.courseLifecycleBadge({...ended,statusLifecycle:key}),new RegExp('>'+label+'<'));assert.doesNotMatch(c.courseLifecycleBadge({...ended,statusLifecycle:key}),/Penuh/);
  assert.match(c.courseQuotaBadge(ended),/>Penuh</);
});
test('Urus Kursus shows derived Tamat and separate quota while retaining administrative edit',async()=>{
  const {c,els}=harness({kursus:[ended]});await c.loadKursus();const out=els.kuc.innerHTML;
  assert.match(out,/>Tamat</);assert.match(out,/>Penuh</);assert.match(out,/Edit/);assert.match(out,/batalKursusAdmin/);
});
test('dashboard uses lifecycle metrics instead of stored active count',async()=>{
  const {c,els}=harness({statKursus:99,statTamat:98,statLifecycle:{aktif:1,tamat:2,akan_datang:3,dibatal:4,perlu_semakan:5}});
  await c.loadDashAdmin();assert.doesNotMatch(els.dc.innerHTML,/>99<|>98</);assert.match(els.dc.innerHTML,/Akan Datang: 3/);assert.match(els.dc.innerHTML,/Perlu Semakan: 5/);
});
test('participant keeps registration Menunggu alongside course Tamat',async()=>{
  const {c,els}=harness({pendaftaran:[{...ended,status:'menunggu'}],statDaftar:1});await c.loadDashPeserta();
  assert.match(els.dc.innerHTML,/>Menunggu</);assert.match(els.dc.innerHTML,/>Tamat</);
});
test('report filters lifecycle independently from full quota',()=>{
  const {c}=harness(),rows=[ended,{...ended,courseId:'F',statusLifecycle:'akan_datang',statusKuota:''}];
  assert.equal(c.laporanTapisKursus(rows,{status:'tamat',kuota:'penuh'}).length,1);
  assert.equal(c.laporanTapisKursus(rows,{status:'akan_datang',kuota:'penuh'}).length,0);
  const out=c.laporanKursusRowsHtml([ended]);assert.match(out,/>Tamat</);assert.match(out,/>Penuh</);
});
test('old backend payload continues rendering without frontend date derivation',()=>{
  const {c}=harness();assert.match(c.courseLifecycleBadge({status:'aktif'}),/>Aktif</);
  assert.equal(c.laporanTapisKursus([{statusEfektif:'tamat'}],{status:'tamat'}).length,1);
});
test('catalog registration policy ignores additive lifecycle state',()=>{
  const {c}=harness();const course={...ended,tarikhMulaInput:'2099-09-10',tarikhTamatInput:'2099-09-10',tarikhMulaDaftarInput:'2020-01-01',tarikhTutupDaftarInput:'2099-09-09',hadPeserta:null,statusKuota:'',statusDaftar:null};
  assert.deepEqual(c.getKatalogRegistrationState(course),c.getKatalogRegistrationState({...course,statusLifecycle:'akan_datang'}));
});
