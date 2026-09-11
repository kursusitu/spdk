// Local synthetic browser fixture. No production connection or mutation.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const courses=[
  ['A','Kursus Aktif Penuh','aktif','Aktif','aktif','penuh','2026-09-09','2026-09-09'],
  ['F','Kursus Akan Datang','akan_datang','Akan Datang','aktif','','2026-09-10','2026-09-10'],
  ['T','Kursus Tamat Semalam','tamat','Tamat','aktif','','2026-09-08','2026-09-08'],
  ['X','Kursus Dibatalkan','dibatal','Dibatalkan','dibatal','','2026-09-10','2026-09-10'],
  ['R','Kursus Tarikh Perlu Semakan','perlu_semakan','Perlu Semakan','aktif','','','']
].map(([courseId,namaKursus,statusLifecycle,statusDisplay,statusAsal,statusKuota,tarikhMulaInput,tarikhTamatInput])=>({
  courseId,namaKursus,statusLifecycle,statusDisplay,statusAsal,statusKuota,tarikhMulaInput,tarikhTamatInput,
  status:statusKuota||statusAsal,statusEfektif:statusKuota||statusAsal,masaMula:'08:00',masaTamat:'17:00',tempat:'ITU',
  hadPeserta:statusKuota?1:null,jumlahPeserta:1,bakiTempat:statusKuota?0:null,kuotaTanpaHad:!statusKuota,
  tarikhMulaDaftarInput:'2026-09-01',tarikhTutupDaftarInput:'2026-09-09',penerangan:'Data rekaan untuk semakan paparan',
  tarikhMula:tarikhMulaInput,tarikhTamat:tarikhTamatInput,cpdConfig:{mode:'legacy'},statusDaftar:null
}));
const summary={akan_datang:1,aktif:1,tamat:1,dibatal:1,perlu_semakan:1,jumlah:5};
const setup=`<script>
localStorage.setItem('spdk_token','local-lifecycle');localStorage.setItem('spdk_role','admin');localStorage.setItem('spdk_nama','Ujian Lifecycle');
const fixtureCourses=${JSON.stringify(courses)},fixtureSummary=${JSON.stringify(summary)};
window.fetch=async(url,req={})=>{
 const action=req.body?JSON.parse(req.body).action:'';
 const payloads={renewSession:{},getSenaraiKursus:{kursus:fixtureCourses},getSenaraiKursusAktif:{kursus:fixtureCourses.filter(c=>c.statusAsal==='aktif')},
 getDashboardAdmin:{statKursus:4,statTamat:0,statLifecycle:fixtureSummary,statMenunggu:1,statPeserta:2,statEcert:0,pendaftaranMenunggu:[],kursusTamat:[{namaKursus:'Kursus Tamat Semalam',tarikhKursus:'08/09/2026',tempat:'ITU'}]},
 getDashboardPeserta:{statDaftar:2,statLulus:1,statSijil:0,pendaftaran:[{namaKursus:'Kursus Aktif Penuh',tarikhKursus:'09/09/2026',status:'lulus',statusLifecycle:'aktif'},{namaKursus:'Kursus Tamat Semalam',tarikhKursus:'08/09/2026',status:'menunggu',statusLifecycle:'tamat'}]},
 getLaporan:{statLifecycle:fixtureSummary,statKursus:{aktif:4,tamat:0,dibatal:1,jumlah:5},statPeserta:{},statSijil:{},statKehadiran:{},laporanKursus:fixtureCourses,laporanPendaftaran:[],laporanKehadiran:[],laporanMaklumBalas:[],chartStatusPendaftaran:{},chartPendaftaranBulan:[]}};
 if(!Object.prototype.hasOwnProperty.call(payloads,action))throw Error('Fixture blocked action: '+action);
 return new Response(JSON.stringify({success:true,...payloads[action]}),{headers:{'Content-Type':'application/json'}});
};
function fixturePage(role,page){S.role=role;localStorage.setItem('spdk_role',role);if(location.hash==='#'+page)router();else location.hash='#'+page;}
</script>`;
const controls=`<div style="position:relative;z-index:99999;background:white;border:2px solid blue;padding:8px">LOCAL MOCK ONLY · Clock: 9 Sep 2026 16:59 Malaysia<br>
<button onclick="fixturePage('admin','admin')">Uji Dashboard Admin</button>
<button onclick="fixturePage('admin','admin-kursus')">Uji Urus Kursus</button>
<button onclick="fixturePage('peserta','dashboard')">Uji Dashboard Peserta</button>
<button onclick="fixturePage('peserta','katalog-kursus')">Uji Kad Katalog</button>
<button onclick="fixturePage('admin','laporan')">Uji Laporan</button></div>`;
http.createServer((req,res)=>{
 if(req.url.startsWith('/sw.js')){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; worker-src 'none'"});
 res.end(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace('<head>','<head>'+setup).replace(/<body([^>]*)>/,'<body$1>'+controls));
}).listen(8767,'127.0.0.1',()=>console.log('Local lifecycle fixture: http://127.0.0.1:8767/#admin'));
