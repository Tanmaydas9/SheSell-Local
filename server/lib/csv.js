/* RFC 4180-style CSV: parse (quoted fields, "" escapes, CRLF) and write. */
'use strict';

function parse(text) {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // keep spreadsheet apps from running formulas
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const write = (header, rows) => [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

module.exports = { parse, write };
