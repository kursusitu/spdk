const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function response(status=200,data={success:true},type='application/json',malformed=false){
  return {status,ok:status>=200&&status<300,headers:{get:()=>type},json:async()=>{
    assert.match(type,/json/,'HTML must never be parsed');
    if(malformed)throw new SyntaxError('secret user_content_key');return data;
  }};
}
function harness(fetcher){
  const values=new Map([['spdk_token','original'],['spdk_role','admin'],['spdk_nama','Admin']]);
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const elements=Object.fromEntries(['app','dc','kuc','tc','lo'].map(k=>[k,{innerHTML:'',style:{},appendChild(){}}]));
  const delays=[],calls=[],notices=[],retryViews=[];
  const context={console,URLSearchParams,AbortController,queueMicrotask,
    localStorage:storage,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},navigator:{},
    window:{location:{hash:'#admin',search:'',pathname:'/spdk/'},history:{replaceState(){}},addEventListener(){}},
    document:{getElementById:k=>elements[k],createElement:()=>({remove(){}}),body:{appendChild(){}}},
    setTimeout:(fn,ms)=>{delays.push(ms);if(ms===500||ms===1500)retryViews.push(elements.dc.innerHTML+elements.kuc.innerHTML);return setTimeout(fn,ms===500||ms===1500?0:ms)},clearTimeout,
    fetch:async(url,req)=>{calls.push({url,body:req.body});return fetcher(calls.length,req)},confirm:()=>true};
  vm.createContext(context);vm.runInContext(script,context);
  context.toast=m=>notices.push(m);
  return {context,calls,delays,notices,retryViews,elements,values,run:s=>vm.runInContext(s,context)};
}
test('200 JSON and JSON media type suffix preserve successful response',async()=>{
  const h=harness(()=>response(200,{success:true,value:7},'application/problem+json; charset=utf-8'));
  assert.equal((await h.context.api('getProfil')).value,7);assert.equal(h.calls.length,1);
});
for(const [label,fail,code] of [
  ['404 HTML',()=>response(404,{},'text/html'),'HTTP_404'],
  ['network',()=>{throw new TypeError('secret password')},'NETWORK'],
  ['500',()=>response(500,{},'text/html'),'HTTP_ERROR'],
  ['non JSON 200',()=>response(200,{},'text/html'),'NON_JSON'],
  ['malformed JSON',()=>response(200,{},'application/json',true),'MALFORMED_JSON']
]){
  test(label+' recovers using original endpoint/body and 500ms backoff',async()=>{
    const h=harness(n=>n===1?fail():response());await h.context.api('getProfil');
    assert.equal(h.calls.length,2);assert.equal(h.calls[0].body,h.calls[1].body);
    assert.equal(h.calls[0].url,h.calls[1].url);assert.match(h.calls[1].url,/\/exec$/);
    assert.deepEqual(h.delays,[500]);assert.deepEqual(h.notices,['Menyambung semula...']);
  });
  test(label+' stops after three attempts with sanitized structured error',async()=>{
    const h=harness(fail);await assert.rejects(h.context.api('getProfil'),e=>{
      assert.equal(e.name,'TransportError');assert.equal(e.code,code);assert.equal(e.action,'getProfil');
      assert.equal(e.attempt,3);assert.equal(e.retryable,true);assert.doesNotMatch(JSON.stringify(e)+e.message,/secret|original|user_content_key/);return true;
    });assert.equal(h.calls.length,3);assert.deepEqual(h.delays,[500,1500]);assert.equal(h.values.get('spdk_token'),'original');
  });
}
for(const [label,data] of [['business',{success:false,message:'Validasi gagal'}],['permission',{success:false,message:'Akses ditolak.'}]]){
  test(label+' failure is returned without retry',async()=>{const h=harness(()=>response(200,data));assert.equal((await h.context.api('getProfil')).success,false);assert.equal(h.calls.length,1)});
}
test('401/403 are terminal HTTP errors',async()=>{for(const status of [401,403]){const h=harness(()=>response(status,{},'text/html'));await assert.rejects(h.context.api('getProfil'),e=>e.httpStatus===status&&!e.retryable);assert.equal(h.calls.length,1)}});
test('expired session invokes existing flow once',async()=>{
  const h=harness(()=>response(200,{success:false,auth:false}));await assert.rejects(h.context.api('getProfil'),e=>e.name==='AuthExpiredError');
  assert.equal(h.calls.length,1);assert.equal(h.values.has('spdk_token'),false);assert.equal(h.context.window.location.hash,'#login');
});
test('every denied action plus unknown action gets one attempt only',async()=>{
  const list=harness(()=>response()).run('Array.from(TRANSPORT_NO_RETRY_ACTIONS)');
  for(const action of [...list,'futureRead']){const h=harness(()=>response(404,{},'text/html'));await assert.rejects(h.context.api(action),e=>!e.retryable);assert.equal(h.calls.length,1,action)}
});
test('every allowlisted action retries; sets are disjoint',async()=>{
  const h=harness(()=>response());assert.equal(h.run('[...TRANSPORT_READ_ACTIONS].some(a=>TRANSPORT_NO_RETRY_ACTIONS.has(a))'),false);
  for(const action of h.run('Array.from(TRANSPORT_READ_ACTIONS)')){const x=harness(n=>n===1?response(404,{},'text/html'):response());await x.context.api(action);assert.equal(x.calls.length,2,action)}
});
test('AbortError and pre-aborted cancellation never retry',async()=>{
  const h=harness(()=>{const e=new Error();e.name='AbortError';throw e});await assert.rejects(h.context.api('getProfil'),e=>e.code==='ABORTED');assert.equal(h.calls.length,1);
  const controller=new AbortController();controller.abort();await assert.rejects(h.context.api('getProfil',{}, {signal:controller.signal}),e=>e.code==='ABORTED');assert.equal(h.calls.length,1);
});
test('timeout is structured and late response cannot expire session',async()=>{
  let finish;const h=harness(()=>new Promise(r=>finish=r));
  await assert.rejects(h.context.apiWithTimeout('getProfil',{},5),e=>e.code==='TIMEOUT');
  finish(response(200,{success:false,auth:false}));await new Promise(r=>setImmediate(r));
  assert.equal(h.values.get('spdk_token'),'original');assert.equal(h.calls.length,1);
});
test('cancel during backoff prevents another request',async()=>{
  const h=harness(()=>response(404,{},'text/html')),controller=new AbortController();
  await assert.rejects(h.context.api('getProfil',{}, {signal:controller.signal,onRetry:()=>controller.abort()}),e=>e.code==='ABORTED');assert.equal(h.calls.length,1);
});
test('token change during backoff blocks replay with replacement credentials',async()=>{
  const h=harness(()=>response(404,{},'text/html'));
  await assert.rejects(h.context.api('getProfil',{}, {onRetry:()=>h.run("S.token='replacement'")}),e=>e.code==='STALE_REQUEST');assert.equal(h.calls.length,1);
});
for(const loader of ['loadDashPeserta','loadDashAdmin','loadKursus']){
  const id=loader==='loadKursus'?'kuc':'dc';
  test(loader+' reconnects and renders successful data',async()=>{
    const h=harness(n=>n===1?response(404,{},'text/html'):response(200,{success:true,kursus:[],pendaftaran:[]}));
    const pending=h.context[loader]();await new Promise(r=>setImmediate(r));
    await pending;assert.match(h.retryViews[0],/Menyambung semula/);assert.equal(h.calls.length,2);assert.doesNotMatch(h.elements[id].innerHTML,/terganggu sementara/);
  });
  test(loader+' final failure offers retry and never claims empty data',async()=>{
    const h=harness(()=>response(404,{},'text/html'));await h.context[loader]();
    assert.match(h.elements[id].innerHTML,/Cuba Semula/);assert.match(h.elements[id].innerHTML,/terganggu sementara/);assert.doesNotMatch(h.elements[id].innerHTML,/Tiada kursus|Tiada pendaftaran/);
  });
  test(loader+' business failure is not an empty result',async()=>{const h=harness(()=>response(200,{success:false,message:'Akses ditolak.'}));await h.context[loader]();assert.match(h.elements[id].innerHTML,/Akses ditolak/);assert.equal(h.calls.length,1)});
  test(loader+' old session cannot overwrite replacement UI',async()=>{
    let finish;const h=harness(()=>new Promise(r=>finish=r));const pending=h.context[loader]();
    h.run("S.token='replacement'");h.elements[id].innerHTML='NEW SESSION';finish(response(200,{success:false,auth:false}));await pending;
    assert.equal(h.elements[id].innerHTML,'NEW SESSION');assert.equal(h.run('S.token'),'replacement');
  });
}
test('same-page newer load wins',async()=>{
  let finish;const h=harness(n=>n===1?new Promise(r=>finish=r):response(200,{success:true,kursus:[]}));
  const old=h.context.loadKursus();await h.context.loadKursus();h.elements.kuc.innerHTML='NEW LOAD';finish(response(200,{success:true,kursus:[]}));await old;assert.equal(h.elements.kuc.innerHTML,'NEW LOAD');
});
test('params cannot disguise a write as an allowlisted read',async()=>{
  const h=harness(()=>response());await h.context.api('getProfil',{action:'executeCpdSync'});assert.equal(JSON.parse(h.calls[0].body).action,'getProfil');
});
test('navigation away and back rejects old dashboard completion',async()=>{
  let finish;const h=harness(()=>new Promise(r=>finish=r));const old=h.context.loadDashAdmin();
  h.context.setView('another page');h.context.setView('returned page');h.elements.dc.innerHTML='CURRENT';
  finish(response());await old;assert.equal(h.elements.dc.innerHTML,'CURRENT');
});
test('timeout without AbortController suppresses late auth response',async()=>{
  let finish;const h=harness(()=>new Promise(r=>finish=r));h.context.AbortController=undefined;
  await assert.rejects(h.context.apiWithTimeout('getProfil',{},5),e=>e.code==='TIMEOUT');finish(response(200,{success:false,auth:false}));
  await new Promise(r=>setImmediate(r));assert.equal(h.values.get('spdk_token'),'original');
});
test('bootstrap HTTP/HTML failure retains token and manual retry without automatic renewal',async()=>{
  const h=harness(()=>response(404,{},'text/html'));await h.context.bootstrapAuth();
  assert.equal(h.calls.length,1);assert.equal(h.values.get('spdk_token'),'original');assert.match(h.elements.app.innerHTML,/Cuba Semula/);
});
test('late bootstrap cannot replace a newer view',async()=>{
  let finish;const h=harness(()=>new Promise(r=>finish=r));const pending=h.context.bootstrapAuth();
  h.context.setView('NEW VIEW');finish(response());await pending;assert.equal(h.elements.app.innerHTML,'NEW VIEW');
});
