import ExcelJS from 'exceljs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '../../data');

const AUDIT_FILE = join(DATA, 'audit-log.xlsx');
const QUERY_FILE = join(DATA, 'query-log.xlsx');

const AUDIT_HEADERS = [
  'timestamp', 'actor_name', 'actor_email', 'action', 'source',
  'faq_id', 'question_snippet', 'before_answer', 'after_answer', 'notes',
];
const QUERY_HEADERS = [
  'timestamp', 'user_email', 'user_name', 'query',
  'matched_faq_id', 'confidence', 'answered',
];

async function ensureFile(path, sheetName, headers) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
    if (!wb.getWorksheet(sheetName)) {
      const ws = wb.addWorksheet(sheetName);
      ws.addRow(headers);
      await wb.xlsx.writeFile(path);
    }
  } catch {
    wb.addWorksheet(sheetName).addRow(headers);
    await wb.xlsx.writeFile(path);
  }
  return wb;
}

async function appendRow(path, sheetName, headers, values) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(path); } catch { /* file may not exist yet */ }
  let ws = wb.getWorksheet(sheetName);
  if (!ws) { ws = wb.addWorksheet(sheetName); ws.addRow(headers); }
  ws.addRow(values);
  await wb.xlsx.writeFile(path);
}

async function readRows(path, sheetName, headers) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(path); } catch { return []; }
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row, i) => {
    if (i === 1) return; // skip header
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row.getCell(idx + 1).value ?? null; });
    rows.push(obj);
  });
  return rows;
}

export async function appendAudit({ actor_name, actor_email, action, source, faq_id, question_snippet, before_answer, after_answer, notes = '' }) {
  await appendRow(AUDIT_FILE, 'AuditLog', AUDIT_HEADERS, [
    new Date().toISOString(), actor_name, actor_email, action, source,
    faq_id ?? '', question_snippet ?? '', before_answer ?? '', after_answer ?? '', notes,
  ]);
}

export async function appendQueryLog({ user_email, user_name, query, matched_faq_id, confidence, answered }) {
  await appendRow(QUERY_FILE, 'QueryLog', QUERY_HEADERS, [
    new Date().toISOString(), user_email ?? '', user_name ?? '', query,
    matched_faq_id ?? '', confidence ?? '', answered ? 'yes' : 'no',
  ]);
}

export async function readAuditLog({ from, to, actor, action, source, faqId, limit = 100 } = {}) {
  let rows = await readRows(AUDIT_FILE, 'AuditLog', AUDIT_HEADERS);
  if (from) rows = rows.filter(r => r.timestamp >= from);
  if (to) rows = rows.filter(r => r.timestamp <= to);
  if (actor) rows = rows.filter(r => String(r.actor_email).toLowerCase().includes(actor.toLowerCase()));
  if (action) rows = rows.filter(r => r.action === action);
  if (source) rows = rows.filter(r => r.source === source);
  if (faqId) rows = rows.filter(r => r.faq_id === faqId);
  return rows.reverse().slice(0, limit);
}

export async function readQueryLog({ answered, from, to, limit = 100 } = {}) {
  let rows = await readRows(QUERY_FILE, 'QueryLog', QUERY_HEADERS);
  if (answered !== undefined) rows = rows.filter(r => r.answered === (answered ? 'yes' : 'no'));
  if (from) rows = rows.filter(r => r.timestamp >= from);
  if (to) rows = rows.filter(r => r.timestamp <= to);
  return rows.reverse().slice(0, limit);
}

export async function exportAuditLog() { return AUDIT_FILE; }

// Pre-create files on startup
ensureFile(AUDIT_FILE, 'AuditLog', AUDIT_HEADERS).catch(console.error);
ensureFile(QUERY_FILE, 'QueryLog', QUERY_HEADERS).catch(console.error);
