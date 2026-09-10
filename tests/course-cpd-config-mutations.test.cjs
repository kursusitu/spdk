const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const production=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const support=['course-cpd-config.test.cjs','cpd-admin-page.test.cjs','reporting-page.test.cjs'];

function mutate(name,transform,file,target){
  test('behavioral mutation detected: '+name,()=>{
    const mutated=transform(production);
    assert.notEqual(mutated,production,'mutation site missing');
    const inline=mutated.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inline,'mutated inline script missing');
    assert.doesNotThrow(()=>new vm.Script(inline[1]),'mutant must remain syntactically valid');
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'spdk-phase-b-mutant-'));
    try{
      fs.mkdirSync(path.join(temp,'tests'));
      fs.copyFileSync(path.join(ROOT,'sw.js'),path.join(temp,'sw.js'));
      fs.copyFileSync(path.join(ROOT,'version.json'),path.join(temp,'version.json'));
      for(const item of support)fs.copyFileSync(path.join(ROOT,'tests',item),path.join(temp,'tests',item));
      const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
      function run(source){
        fs.writeFileSync(path.join(temp,'index.html'),source);
        return spawnSync(process.execPath,['--test','--test-name-pattern',target.source,path.join('tests',file)],{cwd:temp,encoding:'utf8',timeout:30000,env:childEnv});
      }
      const baseline=run(production);
      assert.equal(baseline.status,0,'targeted behavioral test must pass against production');
      const result=run(mutated);
      assert.notEqual(result.status,0,'mutant survived its targeted behavioral regression test');
    }finally{fs.rmSync(temp,{recursive:true,force:true});}
  });
}
const once=(from,to)=>source=>source.replace(from,to);
const all=(from,to)=>source=>source.replaceAll(from,to);

mutate('01 new course default disabled',once("const config=editMode?kuCourseConfig(k):{mode:'disabled'","const config=editMode?kuCourseConfig(k):{mode:'legacy'"),'course-cpd-config.test.cjs',/new course defaults to explicit disabled/);
mutate('02 legacy rendered distinctly',once("if(config.mode==='legacy')return '<section","if(config.mode==='disabled')return '<section"),'course-cpd-config.test.cjs',/legacy is rendered distinctly/);
mutate('03 participant half-filled rejected',once("if(!noCpd)return{error:'No. CPD '+label+' wajib diisi.'};",""),'course-cpd-config.test.cjs',/create blocks missing participant number/);
mutate('04 speaker half-filled rejected',once("if(!raw)return{error:'Mata CPD '+label+' wajib diisi.'};",""),'course-cpd-config.test.cjs',/create blocks missing speaker points/);
mutate('05 NoCPD uppercase normalization',once("trim().toUpperCase(),raw","trim(),raw"),'course-cpd-config.test.cjs',/create sends participant only/);
mutate('06 invalid points rejected',once("!Number.isFinite(points)||points<=0","false"),'course-cpd-config.test.cjs',/create blocks zero points/);
mutate('07 expected revision omitted',once("payload.expectedCpdRevision=kuCpdModal.revision",""),'course-cpd-config.test.cjs',/managed edit includes current expected revision/);
mutate('08 locked NoCPD editable',once("locked?' readonly aria-readonly=\"true\"'","false?' readonly aria-readonly=\"true\"'"),'course-cpd-config.test.cjs',/disabled and managed forms load exact state/);
mutate('09 conflict ignored',all("r&&r.code==='CPD_CONFIG_CONFLICT'","false"),'course-cpd-config.test.cjs',/configuration conflict invalidates the active modal/);
mutate('10 double submit allowed',once("if(!kuCpdModal||kuCpdModal.busy||","if(!kuCpdModal||"),'course-cpd-config.test.cjs',/double submit is blocked/);
mutate('11 completed course general action',once("apiWithTimeout('updateCourseCpdConfig'","apiWithTimeout('kemaskinikursus'"),'course-cpd-config.test.cjs',/completed course uses narrow action/);
mutate('12 peserta completed guard removed',once("if(!['admin','superadmin'].includes(S.role))return;","if(false)return;"),'course-cpd-config.test.cjs',/completed action is role\/status guarded/);
mutate('13 non-tamat completed guard removed',once("if(!k||status!=='tamat')return;","if(!k)return;"),'course-cpd-config.test.cjs',/completed action is role\/status guarded/);
mutate('14 raw backend error rendered',all("kuCpdError(r)","r.message"),'course-cpd-config.test.cjs',/course save handler never renders a raw backend error/);
mutate('15 managed summary cross-mapped',once("escHtml(item.noCpd)","escHtml(String(item.points))"),'cpd-admin-page.test.cjs',/course selection displays legacy, disabled and managed award summaries/);
mutate('16 disabled readiness permits execute',once("!['disabled','no_candidates'].includes(preview.readiness)","preview.readiness!=='no_candidates'"),'cpd-admin-page.test.cjs',/preview renders readiness disabled/);
mutate('17 no-candidates readiness permits execute',once("!['disabled','no_candidates'].includes(preview.readiness)","preview.readiness!=='disabled'"),'cpd-admin-page.test.cjs',/preview renders readiness no_candidates/);
mutate('18 award definition omitted',once("<div><strong>Takrif anugerah semasa</strong>'+cpdConfigSummaryHtml(awardConfig)+'</div>",""),'cpd-admin-page.test.cjs',/preview renders readiness ready/);
mutate('19 CPD-2 confirmation gate removed',once("&& page.confirmed && preview.counts.inserted", "&& preview.counts.inserted"),'cpd-admin-page.test.cjs',/confirmation starts unchecked and execute requires/);
mutate('20 stale fingerprint retained',once("page.preview = null;",""),'cpd-admin-page.test.cjs',/course switch invalidates preview/);
mutate('21 version and cache mismatch',once("const APP_VERSION='1.0.16'","const APP_VERSION='1.0.11'"),'reporting-page.test.cjs',/consistently versioned at 1\.0\.16/);
mutate('22 mobile containment removed',once("background:#f8fafc;overflow:hidden","background:#f8fafc"),'course-cpd-config.test.cjs',/CPD form remains bounded/);
mutate('23 post-response identity check removed',all("if(!kuCpdOperationCurrent(operation))return;",""),'course-cpd-config.test.cjs',/stale course success cannot remove or reload/);
mutate('24 stale final cleanup enabled',all("if(kuCpdOperationCurrent(operation)){loading(false)","if(true){loading(false)"),'course-cpd-config.test.cjs',/stale final cleanup cannot clear/);
mutate('25 post-response token validation removed',once("S.token===operation.token&&","true&&"),'course-cpd-config.test.cjs',/old-session course success cannot mutate/);
mutate('26 close invalidation defenses removed',source=>source
  .replace("if(state){state.activeOperation=0;state.closed=true;kuCpdModal=null;}","if(state){}")
  .replace("kuCpdModal===operation.state&&!operation.state.closed&&","true&&")
  .replace("$('mk')===operation.modal&&","true&&"),'course-cpd-config.test.cjs',/stale course success cannot remove or reload/);
mutate('27 current auth expiry leaves course modal open',once("cpdLeave();kuCloseCourseModal();","cpdLeave();"),'course-cpd-config.test.cjs',/current-token auth expiry closes and invalidates an ordinary course modal/);
mutate('28 stale auth failure closes replacement modal',source=>once("if(requestToken&&requestToken===S.token)handleExpiredSession();","if(requestToken)handleExpiredSession();")(once('S.token!==requestToken||','false||')(source)),'course-cpd-config.test.cjs',/actual old-token auth failure preserves replacement session and modal/);
mutate('29 create incorrectly depends on list generation',once("if(!kuCpdModal||kuCpdModal.busy||kuCpdModal.completed||\n      (editMode&&","if(!kuCpdModal||kuCpdModal.busy||kuCpdModal.completed||kuCpdModal.generation!==kuCoursesGeneration||\n      (editMode&&"),'course-cpd-config.test.cjs',/new managed course survives a completed course-list refresh/);
