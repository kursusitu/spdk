const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('contributor UI promises a PDF attachment and removes notification-only wording',()=>{
  assert.match(html,/Hantar eSijil PDF kepada/);
  assert.match(html,/Email contributor menyertakan PDF eSijil dan pautan pengesahan/);
  assert.doesNotMatch(html,/Pautan emel untuk pengesahan sahaja; serahkan PDF berasingan/);
});

test('contributor UI distinguishes legacy notification and pdf-v1 delivery',()=>{
  assert.match(html,/Notifikasi dihantar — PDF belum dihantar/);
  assert.match(html,/deliveryVersion==='pdf-v1'/);
  assert.match(html,/PDF Dihantar/);
  assert.match(html,/'Hantar PDF'/);
});
