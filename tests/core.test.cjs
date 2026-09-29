const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const headers = ['CODE','DRUG_NAME','จำนวน/pack','C ย่อย)','SUBSTOCK (หน่วยย่อย)','นับได้ (pack)','นับ เศษ','นับได้รวม (หน่วยย่อย)','ผลต่าง นับ','type'];
const fixture = (values={}) => headers.join(',')+'\n'+headers.map(h=>({CODE:'11TEST',DRUG_NAME:'Test', 'จำนวน/pack':10, 'C ย่อย)':100,'SUBSTOCK (หน่วยย่อย)':100,'นับได้ (pack)':10,'นับ เศษ':'','นับได้รวม (หน่วยย่อย)':100,'ผลต่าง นับ':0,type:'Vital+Original',...values}[h])).join(',');
test('CSV handles BOM, quotes, commas and multiline notes',()=>{
  assert.deepEqual(C.csv('\uFEFFCODE,note\r\nX,"a,b\n""quoted"""\r\n'),[{CODE:'X',note:'a,b\n"quoted"'}]);
  assert.throws(()=>C.csv('a,b\n"unfinished,b'));
  assert.throws(()=>C.csv('a,b\n1,2,3'));
});
test('pending counts stay null, explicit zero is counted',()=>{
  const pending=C.counts(fixture({'นับได้รวม (หน่วยย่อย)':'','ผลต่าง นับ':'','นับได้ (pack)':''}),'PHA01')[0];
  assert.equal(pending.actual,null); assert.equal(pending.diff,null); assert.equal(C.stats([pending]).accuracy,null);
  const zero=C.counts(fixture({'นับได้รวม (หน่วยย่อย)':0,'นับได้ (pack)':'','ผลต่าง นับ':-100}),'PHA01')[0];
  assert.equal(zero.actual,0); assert.equal(zero.diff,-100);
});
test('recomputes stale saved totals and splits compound types',()=>{
  const r=C.counts(fixture({'นับได้ (pack)':9,'นับ เศษ':2}),'PHA01')[0];
  assert.equal(r.actual,92); assert.equal(r.diff,-8); assert.equal(r.issues.length,2);
  assert.deepEqual(r.types,['Vital','Original']);
});
test('tolerance zero baseline and controlled items remain strict',()=>{
  const r={counted:true,system:100,diff:2,controlled:false};
  assert.equal(C.pass(r,2),true); assert.equal(C.pass({...r,diff:2.01},2),false);
  assert.equal(C.pass({...r,controlled:true},2),false);
  assert.equal(C.pass({...r,system:0,diff:1},2),false);
  assert.equal(C.pass({...r,system:0,diff:0},2),true);
});
test('unknown prices excluded, shortages and surpluses not netted',()=>{
  const row={counted:true,system:100,lots:100,issues:[],price:2};
  const s=C.stats([{...row,diff:-10},{...row,diff:20},{...row,diff:-999,price:null},{...row,counted:false,diff:null}]);
  assert.equal(s.shortage,20);assert.equal(s.surplus,40);assert.equal(s.absolute,60);assert.equal(s.valuePercent,15);
  assert.equal(s.counted,3);assert.equal(s.priced,2);assert.equal(s.pending,1);
});
test('rejects duplicate codes and invalid numeric inputs',()=>{
  const text=fixture(); assert.throws(()=>C.counts(text+'\n'+text.split('\n')[1],'PHA01'));
  assert.throws(()=>C.counts(fixture({'จำนวน/pack':0}),'PHA01'));
  assert.throws(()=>C.counts(fixture({'นับ เศษ':'not a number'}),'PHA01'));
  assert.throws(()=>C.counts(fixture({'นับ เศษ':-1}),'PHA01'));
});
test('master divides pack price and never uses ABC',()=>{
  const prices=C.master('WORKING_CODE,VEN,ราคา/บรรจุ(STD_PRICE3),PACK_RATIO,ABC\n11TEST,V,1000,100,A\n11NONE,,0,10,B');
  assert.deepEqual(prices['11TEST'],{price:10,ven:'V'});assert.deepEqual(prices['11NONE'],{price:0,ven:'ไม่ระบุ'});
});
test('embedded actual snapshot agrees with independently checked CSV totals',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const data=JSON.parse(html.match(/<script id="initial-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  // Latest CSV has 100 completed rows in PHA04; CLAUDE.md's 99 is an older summary.
  for(const [dept,expected] of Object.entries({PHA01:[100,41,5],PHA02:[100,55,4],PHA04:[100,51,2]})) {
    const rows=C.counts(data.counts[dept],dept),s=C.stats(rows);
    assert.equal(rows.length,100);assert.equal(s.counted,expected[0]);assert.equal(s.counted-s.good,expected[1]);assert.equal(s.mismatch,expected[2]);
    assert.equal(s.issues,0);
  }
});
