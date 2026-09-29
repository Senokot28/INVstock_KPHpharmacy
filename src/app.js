(() => {
  'use strict';
  const C = CountCore, $ = id => document.getElementById(id);
  const fmt = (n, digits = 0) => n === null || !Number.isFinite(n) ? '—' : n.toLocaleString('th-TH', { maximumFractionDigits: digits });
  const pct = n => n === null ? '—' : fmt(n, 1) + '%';
  const signed = n => n === null ? '—' : (n > 0 ? '+' : '') + fmt(n, 2);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const color = n => n === null || C.equal(n, 0) ? '' : n < 0 ? 'negative' : 'positive';
  const initial = JSON.parse($('initial-data').textContent);
  let datasets = {}, prices = {}, rows = [], tab = 'overview', visible = [], priceSource = '';
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
  function resetFilters() { ['dept','group','type','ven','search','status'].forEach(id => $(id).value = ''); $('sort').value = 'difference'; $('tolerance').value = '0'; $('both-diff').checked = false; }
  function options(id, values) {
    const el = $(id), previous = el.value;
    while (el.options.length > 1) el.remove(1);
    [...new Set(values)].sort((a,b) => a.localeCompare(b,'th')).forEach(v => el.add(new Option(v, v)));
    if ([...el.options].some(o => o.value === previous)) el.value = previous;
  }
  function refresh() {
    rows = C.enrich(Object.values(datasets).flat(), prices);
    options('group', rows.map(r => r.group)); options('type', rows.flatMap(r => r.types)); options('ven', rows.map(r => r.ven));
    $('empty').hidden = !!rows.length; $('dashboard').hidden = !rows.length; $('export').disabled = !rows.length;
    $('source-summary').textContent = rows.length ? `${Object.keys(datasets).length} แผนก · ${rows.length} รายการ` : 'เลือกไฟล์ใบนับเพื่อเริ่มวิเคราะห์';
    render();
  }
  function filtered(ignoreDept = false) {
    return rows.filter(r => (ignoreDept || !$('dept').value || r.dept === $('dept').value) && (!$('group').value || r.group === $('group').value) && (!$('type').value || r.types.includes($('type').value)) && (!$('ven').value || r.ven === $('ven').value));
  }
  function detailRows(list) {
    const query = $('search').value.toLocaleLowerCase().trim(), status = $('status').value, tolerance = +$('tolerance').value;
    return list.filter(r => (!query || `${r.name} ${r.code} ${r.location}`.toLocaleLowerCase().includes(query)) &&
      (!status || ({ diff:r.counted && !C.equal(r.diff,0), fail:r.counted && !C.pass(r,tolerance), pending:!r.counted,
        mismatch:!C.equal(r.system,r.lots), controlled:r.controlled, issues:r.issues.length > 0 })[status]))
      .sort((a,b) => {
        if ($('sort').value === 'name') return a.name.localeCompare(b.name,'th');
        if ($('sort').value === 'location') return a.location.localeCompare(b.location,'th',{numeric:true}) || a.name.localeCompare(b.name);
        const metric = r => !r.counted || ($('sort').value === 'value' && r.price === null) ? -1 : Math.abs(r.diff * ($('sort').value === 'value' ? r.price : 1));
        return metric(b)-metric(a) || a.name.localeCompare(b.name);
      });
  }
  function kpi(label, value, sub, cls = '') { return `<article class="kpi ${cls}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><small>${sub}</small></article>`; }
  function render() {
    const list = filtered(tab === 'compare').filter(r => tab !== 'compare' || r.dept !== 'PHA02'), tolerance = +$('tolerance').value, s = C.stats(list, tolerance);
    $('dept').disabled = tab === 'compare';
    $('scope').textContent = `${tab === 'compare' ? 'ขอบเขต: PHA01 + PHA04' : 'ขอบเขตตามตัวกรอง'} · ${fmt(list.length)} รายการยา–แผนก · เกณฑ์ ${tolerance ? '±2%' : 'ตรงทุกหน่วย'}`;
    $('kpis').innerHTML = kpi('รายการที่นับแล้ว',fmt(s.counted),`จาก ${fmt(s.total)} รายการ · ยังไม่นับ ${s.pending}`) +
      kpi('ความถูกต้องของรายการ',pct(s.accuracy),`ผ่านเกณฑ์ ${s.good} / ${s.counted} รายการ`) +
      kpi('มูลค่าผลต่างขาด · บาท',fmt(s.shortage,2),'ผลต่างติดลบ × ราคาอ้างอิง','red') +
      kpi('มูลค่าผลต่างเกิน · บาท',fmt(s.surplus,2),'ผลต่างบวก × ราคาอ้างอิง','green') +
      kpi('มูลค่าผลต่างสัมบูรณ์',pct(s.valuePercent),`รวมขาด + เกิน ${fmt(s.absolute,2)} บาท`);
    $('coverage').textContent = `ราคาครอบคลุม ${s.priced}/${s.counted} รายการที่นับแล้ว${s.priced < s.counted ? ' — ยอดเงินเป็นยอดบางส่วน ไม่รวมรายการที่ไม่มีราคา' : ''} · ${priceSource || 'ยังไม่ได้เลือกไฟล์ราคา'} · ไม่รวมรายการยังไม่นับในมูลค่า`;
    $('accuracy').innerHTML = Object.entries(C.DEPTS).filter(([d]) => datasets[d]).map(([d,label]) => {
      const a = C.stats(list.filter(r => r.dept === d), tolerance);
      return `<div class="accuracy-row"><div class="bar-label"><span>${label}</span><strong>${pct(a.accuracy)}</strong></div><div class="track" role="img" aria-label="${label} ถูกต้อง ${pct(a.accuracy)}"><span style="width:${a.accuracy || 0}%"></span></div><small>ผ่าน ${a.good} จาก ${a.counted} รายการที่นับแล้ว · ยังไม่นับ ${a.pending}</small></div>`;
    }).join('');
    const value = $('rank').value === 'value', ranked = list.filter(r => r.counted && !C.equal(r.diff,0) && (!value || r.price !== null))
      .sort((a,b) => Math.abs(b.diff*(value?b.price:1))-Math.abs(a.diff*(value?a.price:1))).slice(0,10);
    const max = Math.max(...ranked.map(r => Math.abs(r.diff*(value?r.price:1))),1);
    $('ranking').innerHTML = `<p class="legend"><span class="negative">● ขาด</span> &nbsp; <span class="positive">● เกิน</span> · ${value ? 'แสดงเฉพาะรายการมีราคา' : 'จำนวนหน่วยต่างชนิดเปรียบเทียบมูลค่ากันไม่ได้'}</p>` + (ranked.length ? ranked.map((r,i) => {
      const n = r.diff * (value ? r.price : 1);
      return `<div class="rank-row"><span class="rank-index">${String(i+1).padStart(2,'0')}</span><div><span class="rank-name" title="${esc(r.name)}">${esc(r.name)} <span class="muted">· ${r.dept}</span></span><div class="rank-track"><span class="${color(n)}" style="width:${Math.abs(n)/max*100}%"></span></div></div><span class="rank-value ${color(n)}">${signed(n)}${value?'':`<small> ${esc(r.unit)}</small>`}</span></div>`;
    }).join('') : '<p class="empty-result">ไม่มีรายการผลต่างที่แสดงได้ตามตัวกรองนี้</p>');
    const groups = [...new Set(rows.map(r => r.group))].sort();
    $('heatmap').innerHTML = `<table><thead><tr><th>หน่วยจ่ายยา</th>${groups.map(g=>`<th class="heat">${esc(g)}</th>`).join('')}</tr></thead><tbody>${Object.keys(datasets).map(d=>`<tr><td>${d}</td>${groups.map(g=>{
      const a=C.stats(list.filter(r=>r.dept===d&&r.group===g),tolerance);
      return `<td class="heat" style="background:${a.accuracy===null?'#fafbfb':`hsl(${a.accuracy*1.5} 30% 92%)`}"><strong>${pct(a.accuracy)}</strong><small>${a.good}/${a.counted} รายการ</small></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
    const mismatch = list.filter(r=>!C.equal(r.system,r.lots)), sameLots=mismatch.filter(r=>r.counted&&C.equal(r.actual,r.lots)).length;
    const review = (name,value,sub)=>`<div class="review-item"><div>${name}<small>${sub}</small></div><strong>${value}</strong></div>`;
    $('review').innerHTML = review('ยอดระบบกับรายล็อตไม่ตรงกัน',s.mismatch,`ยอดนับตรงรายล็อต ${sameLots} รายการ จากรายการที่ยอดสองตารางต่างกัน`) +
      review('ยาควบคุมที่ผลต่างไม่เป็นศูนย์',list.filter(r=>r.controlled&&r.counted&&!C.equal(r.diff,0)).length,'Fentanyl / Morphine / Midazolam ตามข้อกำหนดโครงการ') +
      review('สูตรเดิม / ข้อมูลต้องทบทวน',s.issues,'ใช้ยอดคำนวณใหม่; ดูรายละเอียดที่แท็บรายการยา') + review('รายการยังไม่นับ',s.pending,'ไม่นำไปคำนวณความถูกต้อง');
    visible = detailRows(list);
    $('row-count').textContent = `${visible.length} รายการ`;
    $('detail-table').innerHTML = visible.length ? `<table><thead><tr><th>แผนก / LO</th><th>รายการยา</th><th>ประเภท / VEN</th><th class="num">ระบบ</th><th class="num">รายล็อต</th><th class="num">นับจริง</th><th class="num">ผลต่าง</th><th class="num">ผลต่าง (บาท)</th><th>สถานะ</th></tr></thead><tbody>${visible.map(r=>`<tr><td>${r.dept}<small>${esc(r.location)||'—'}</small></td><td class="drug-cell">${esc(r.name)}<small>${esc(r.code)} · ${esc(r.unit)} · ${fmt(r.pack)} หน่วย/pack</small>${r.note?`<small>${esc(r.note)}</small>`:''}${r.issues.map(x=>`<small class="issue-note">${esc(x)}</small>`).join('')}</td><td>${esc(r.types.join(' + '))}<small>VEN: ${esc(r.ven)}${r.controlled?' · ยาควบคุมที่กำหนด':''}</small></td><td class="num">${fmt(r.system,2)}</td><td class="num">${fmt(r.lots,2)}</td><td class="num">${fmt(r.actual,2)}</td><td class="num ${color(r.diff)}">${signed(r.diff)}</td><td class="num ${color(r.diff)}">${r.counted&&r.price!==null?signed(r.diff*r.price):'—'}</td><td>${!r.counted?'<span class="badge pending">ยังไม่นับ</span>':C.pass(r,tolerance)?'<span class="badge positive">ผ่านเกณฑ์</span>':'<span class="badge negative">ต้องตรวจสอบ</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-result">ไม่พบรายการตามเงื่อนไขนี้</p>';
    renderCompare();
  }
  function compareRows() {
    const pairs = new Map();
    for (const r of filtered(true).filter(r=>r.dept==='PHA01'||r.dept==='PHA04')) {
      if (!pairs.has(r.code)) pairs.set(r.code, {code:r.code,name:r.name,unit:r.unit});
      pairs.get(r.code)[r.dept]=r;
    }
    return [...pairs.values()].filter(p=>!$('both-diff').checked||[p.PHA01,p.PHA04].every(r=>r?.counted&&!C.equal(r.diff,0))).sort((a,b)=>a.name.localeCompare(b.name));
  }
  function renderCompare() {
    const pairs=compareRows();
    const cells=r=>r?`<td class="num compare-divider">${fmt(r.system,2)}</td><td class="num">${fmt(r.actual,2)}</td><td class="num ${color(r.diff)}">${signed(r.diff)}${!r.counted?'<small>ยังไม่นับ</small>':''}</td>`:'<td class="compare-divider" colspan="3">ไม่มีข้อมูลแผนกนี้</td>';
    $('compare-table').innerHTML=pairs.length?`<table><thead><tr><th rowspan="2">รายการยา (${pairs.length})</th><th colspan="3" class="heat compare-divider">ห้องยาใน · PHA01</th><th colspan="3" class="heat compare-divider">ห้องยานอก · PHA04</th></tr><tr>${[1,2].map(()=>'<th class="num compare-divider">ระบบ</th><th class="num">นับจริง</th><th class="num">ผลต่าง</th>').join('')}</tr></thead><tbody>${pairs.map(p=>`<tr><td class="drug-cell">${esc(p.name)}<small>${esc(p.code)} · ${esc(p.unit)}</small></td>${cells(p.PHA01)}${cells(p.PHA04)}</tr>`).join('')}</tbody></table>`:'<p class="empty-result">ไม่มีข้อมูลเปรียบเทียบตามเงื่อนไขนี้</p>';
  }
  $('count-files').addEventListener('change',async e=>{
    try {
      const next={...datasets}, seen=new Set();
      for (const f of e.target.files) {
        const match=f.name.match(/^count_(PHA01|PHA02|PHA04)(?:[ _(-].*)?\.csv$/i);
        if(!match) throw new Error(`ชื่อไฟล์ ${f.name} ต้องระบุ count_PHA01, count_PHA02 หรือ count_PHA04`);
        const dept=match[1].toUpperCase(); if(seen.has(dept)) throw new Error(`เลือกไฟล์ ${dept} ซ้ำในครั้งเดียว`); seen.add(dept);
        next[dept]=C.counts(await f.text(),dept);
      }
      datasets=next; refresh(); message('อ่านใบนับเรียบร้อย ข้อมูลแผนกที่เลือกแทนชุดเดิมเฉพาะในหน้านี้');
    } catch(err) { message(err.message,true); }
    finally { e.target.value=''; }
  });
  $('master-file').addEventListener('change',async e=>{
    try { const f=e.target.files[0]; if(!f)return; const next=C.master(await f.text()); prices=next; priceSource=`ราคาอ้างอิงจาก ${f.name}`; refresh(); message('อ่านราคาและ VEN เรียบร้อย'); }
    catch(err){message(err.message,true);} finally {e.target.value='';}
  });
  $('clear').addEventListener('click',()=>{datasets={};prices={};priceSource='';resetFilters();refresh();$('imports').open=true;message('ล้างข้อมูลในหน้านี้แล้ว ไฟล์ต้นฉบับยังอยู่ตามเดิม');});
  $('reset').addEventListener('click',()=>{resetFilters();render();});
  ['dept','group','type','ven','tolerance','rank','status','sort','both-diff'].forEach(id=>$(id).addEventListener('change',render));
  $('search').addEventListener('input',render);
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
    tab=button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==tab); render();
  }));
  $('print').addEventListener('click',()=>window.print());
  $('export').addEventListener('click',()=>{
    const table=tab==='compare'?[['CODE','DRUG_NAME','หน่วย','PHA01 ระบบ','PHA01 นับจริง','PHA01 ผลต่าง','PHA04 ระบบ','PHA04 นับจริง','PHA04 ผลต่าง'],...compareRows().map(p=>[p.code,p.name,p.unit,...['PHA01','PHA04'].flatMap(d=>[p[d]?.system,p[d]?.actual,p[d]?.diff])])]:
      [['แผนก','CODE','DRUG_NAME','LO','หน่วย','กลุ่มยา','type','VEN','ระบบ','รายล็อต','นับจริง','ผลต่าง','ราคาต่อหน่วย','ผลต่างบาท','สถานะ','หมายเหตุ','ตรวจสอบ'],...(tab==='details'?visible:filtered()).map(r=>[r.dept,r.code,r.name,r.location,r.unit,r.group,r.types.join('+'),r.ven,r.system,r.lots,r.actual,r.diff,r.price,r.counted&&r.price!==null?r.diff*r.price:null,!r.counted?'ยังไม่นับ':C.pass(r,+$('tolerance').value)?'ผ่านเกณฑ์':'ต้องตรวจสอบ',r.note,r.issues.join('; ')])];
    const encode=v=>{let t=String(v??'');if(typeof v==='string'&&/^[\s]*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
    const blob=new Blob(['\uFEFF'+table.map(row=>row.map(encode).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=`count_${tab}_export.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  try {
    for(const [dept,text] of Object.entries(initial.counts||{})) datasets[dept]=C.counts(text,dept);
    if(initial.master){prices=C.master(initial.master);priceSource=initial.priceSource||'ราคาอ้างอิงจาก Random Year.csv';}
    refresh(); if(rows.length){$('imports').open=false;message('แสดงผลนับที่ฝังไว้ใน Dashboard สามารถเลือกไฟล์ใหม่เพื่อดูข้อมูลอื่นได้');}
  } catch(err){message(`อ่านข้อมูลเริ่มต้นไม่ได้: ${err.message}`,true);}
})();
