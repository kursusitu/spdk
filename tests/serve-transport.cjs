// Local browser fixture: synthetic data only; CSP blocks every external connection.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const setup=`<script>
localStorage.setItem('spdk_token','local-fixture');localStorage.setItem('spdk_role','admin');localStorage.setItem('spdk_nama','Ujian Setempat');
let fixtureMode='fail',fixtureCount=0;
window.fetch=async(url,req={})=>{
  const action=req.body?JSON.parse(req.body).action:'';
  if(action==='renewSession')return new Response(JSON.stringify({success:true}),{headers:{'Content-Type':'application/json'}});
  if(action){fixtureCount++;document.getElementById('fixture-count').textContent='Percubaan: '+fixtureCount;
    if(fixtureMode==='fail'||(fixtureMode==='recover'&&fixtureCount===1))return new Response('<html>404</html>',{status:404,headers:{'Content-Type':'text/html'}});
  }
  return new Response(JSON.stringify({success:true,kursus:[{courseId:'LOCAL',namaKursus:'Kursus Ujian Setempat',status:'aktif',statusAsal:'aktif',tarikhMulaInput:'2026-09-10',tarikhTamatInput:'2026-09-11',hadPeserta:null}],pendaftaran:[],statKursus:1,statPeserta:2,statEcert:0,statTamat:0}),{headers:{'Content-Type':'application/json'}});
};
function fixture(mode,page){fixtureMode=mode;fixtureCount=0;if(location.hash==='#'+page){router()}else location.hash='#'+page}
</script>`;
const controls=`<div style="position:relative;z-index:99999;background:#fff;padding:8px;border:2px solid blue">LOCAL MOCK ONLY
<button onclick="fixture('fail','admin')">Dashboard gagal</button><button onclick="fixture('recover','admin')">Dashboard pulih</button>
<button onclick="fixture('fail','admin-kursus')">Kursus gagal</button><button onclick="fixture('recover','admin-kursus')">Kursus pulih</button><span id="fixture-count"></span></div>`;
http.createServer((req,res)=>{
  if(req.url.startsWith('/sw.js')){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self' data:; worker-src 'none'"});
  res.end(html.replace('<head>','<head>'+setup).replace(/<body([^>]*)>/,'<body$1>'+controls));
}).listen(8766,'127.0.0.1',()=>console.log('Mock PWA: http://127.0.0.1:8766/#admin'));
