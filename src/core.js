(function (root) {
  'use strict';
  const DEPTS = { PHA01: 'ห้องยาใน · PHA01', PHA02: 'PHA02', PHA04: 'ห้องยานอก · PHA04' };
  const GROUPS = { '11': 'ยากิน', '12': 'ยาฉีด', '13': 'ยาน้ำ', '14': 'ยาภายนอก' };
  const equal = (a, b) => Math.abs(a - b) < 1e-8;
  function csv(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], value = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else value += ch;
      } else if (ch === ',' || ch === '\r' || ch === '\n') {
        row.push(value.trim()); value = ''; closed = false;
        if (ch !== ',') {
          if (row.some(Boolean)) rows.push(row);
          row = [];
          if (ch === '\r' && text[i + 1] === '\n') i++;
        }
      } else if (ch === '"' && !value && !closed) quoted = true;
      else { if (closed && ch.trim()) throw new Error('CSV มีข้อความหลังเครื่องหมายปิดคำพูด'); value += ch; }
    }
    if (quoted) throw new Error('CSV มีเครื่องหมายคำพูดที่ปิดไม่ครบ');
    row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
    if (!rows.length) throw new Error('ไฟล์ไม่มีข้อมูล');
    const headers = rows.shift();
    if (new Set(headers).size !== headers.length) throw new Error('ชื่อคอลัมน์ซ้ำ');
    return rows.map((r, i) => {
      if (r.length !== headers.length) throw new Error(`แถว ${i + 2}: จำนวนคอลัมน์ไม่ครบ`);
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    });
  }
  function number(v, name, blank = null) {
    if (v == null || String(v).trim() === '') return blank;
    const cleaned = String(v).replace(/,/g, '').trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) throw new Error(`${name}: ตัวเลขไม่ถูกต้อง (${v})`);
    const n = Number(cleaned);
    if (!Number.isFinite(n)) throw new Error(`${name}: ตัวเลขเกินขอบเขต`);
    return n;
  }
  function required(rows, keys) {
    if (!rows.length) throw new Error('ไฟล์ไม่มีรายการ');
    for (const key of keys) if (!(key in rows[0])) throw new Error(`ไม่พบคอลัมน์ ${key}`);
  }
  function counts(text, dept) {
    if (!DEPTS[dept]) throw new Error('ไม่รู้จักแผนก');
    const rows = csv(text), seen = new Set();
    required(rows, ['CODE', 'DRUG_NAME', 'จำนวน/pack', 'C ย่อย)', 'SUBSTOCK (หน่วยย่อย)', 'นับได้ (pack)', 'นับ เศษ', 'นับได้รวม (หน่วยย่อย)', 'ผลต่าง นับ']);
    return rows.map((r, i) => {
      const code = r.CODE, where = `${dept} แถว ${i + 2}`;
      if (!code || seen.has(code)) throw new Error(`${where}: CODE ว่างหรือซ้ำ (${code})`);
      seen.add(code);
      const read = (key, blank = null) => number(r[key], `${where} ${key}`, blank);
      const pack = read('จำนวน/pack'), system = read('SUBSTOCK (หน่วยย่อย)'), lots = read('C ย่อย)');
      if (!(pack > 0) || system === null || lots === null) throw new Error(`${where}: ขนาดบรรจุหรือยอดระบบไม่สมบูรณ์`);
      const p = read('นับได้ (pack)', 0), remainder = read('นับ เศษ', 0);
      if (p < 0 || remainder < 0) throw new Error(`${where}: ยอดนับติดลบ`);
      const saved = read('นับได้รวม (หน่วยย่อย)'), savedDiff = read('ผลต่าง นับ');
      // O is the source's explicit completion marker; blank means uncounted, even with M/N input.
      const counted = saved !== null, actual = counted ? p * pack + remainder : null;
      const diff = counted ? actual - system : null;
      const issues = [];
      if (counted && !equal(saved, actual)) issues.push('ยอดรวมเดิมไม่ตรงกับ pack × ขนาดบรรจุ + เศษ');
      if (counted && (savedDiff === null || !equal(savedDiff, diff))) issues.push('ผลต่างเดิมไม่ตรงกับยอดคำนวณใหม่');
      if (!counted && (r['นับได้ (pack)'] || r['นับ เศษ'])) issues.push('มีข้อมูล pack/เศษ แต่ยังไม่มีสถานะนับเสร็จในคอลัมน์ O');
      return { dept, code, name: r.DRUG_NAME, unit: r['หน่วยย่อย'] || '', location: r.LO || '', pack, system, lots, actual, diff, counted,
        types: (r.type || 'อื่นๆ').split('+').map(x => x.trim()).filter(Boolean), group: GROUPS[code.slice(0, 2)] || 'อื่นๆ',
        note: r['หมายเหตุ'] || '', issues, controlled: /fentanyl|morphine|midazolam/i.test(r.DRUG_NAME), price: null, ven: 'ไม่ระบุ' };
    });
  }
  function master(text) {
    const rows = csv(text), result = {};
    required(rows, ['WORKING_CODE', 'VEN', 'ราคา/บรรจุ(STD_PRICE3)', 'PACK_RATIO']);
    for (const r of rows) {
      const code = r.WORKING_CODE;
      if (!code || result[code]) throw new Error(`รหัสยาในไฟล์ราคา ว่างหรือซ้ำ (${code})`);
      const price = number(r['ราคา/บรรจุ(STD_PRICE3)'], code), ratio = number(r.PACK_RATIO, code);
      if ((price !== null && price < 0) || (ratio !== null && ratio <= 0)) throw new Error(`ราคา/ขนาดบรรจุไม่ถูกต้อง (${code})`);
      result[code] = { price: price !== null && ratio > 0 ? price / ratio : null, ven: ['V', 'E', 'N'].includes(r.VEN) ? r.VEN : 'ไม่ระบุ' };
    }
    return result;
  }
  function enrich(rows, prices) { return rows.map(r => ({ ...r, ...(prices[r.code] || {price: null, ven: 'ไม่ระบุ'}) })); }
  function pass(r, tolerance = 0) {
    return r.counted && (equal(r.diff, 0) || (!r.controlled && Math.abs(r.diff) <= Math.abs(r.system) * tolerance / 100 + 1e-8));
  }
  function stats(rows, tolerance = 0) {
    const done = rows.filter(r => r.counted), priced = done.filter(r => r.price !== null);
    const good = done.filter(r => pass(r, tolerance)).length;
    const shortage = priced.reduce((s, r) => s + Math.max(0, -r.diff) * r.price, 0);
    const surplus = priced.reduce((s, r) => s + Math.max(0, r.diff) * r.price, 0);
    const base = priced.reduce((s, r) => s + Math.abs(r.system) * r.price, 0);
    return { total: rows.length, counted: done.length, pending: rows.length - done.length, good, accuracy: done.length ? good / done.length * 100 : null,
      shortage: priced.length ? shortage : null, surplus: priced.length ? surplus : null, absolute: priced.length ? shortage + surplus : null,
      valuePercent: priced.length && base > 0 ? (shortage + surplus) / base * 100 : null, priced: priced.length,
      mismatch: rows.filter(r => !equal(r.system, r.lots)).length, issues: rows.filter(r => r.issues.length).length };
  }
  const api = { DEPTS, GROUPS, equal, csv, counts, master, enrich, pass, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CountCore = api;
})(globalThis);
