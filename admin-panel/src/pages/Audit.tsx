import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { AuditEntry } from '../types';

const ACTIONS = ['add','update','delete','enable','disable','bulk_import','revert','suggestion_approved','suggestion_rejected'];
const SOURCES = ['voice','web','bulk','suggestion'];

export default function Audit() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', actor: '', action: '', source: '' });

  function fetch() {
    setLoading(true);
    api.get('/audit-log', { params: { ...filters, limit: 100 } })
      .then(({ data }) => setLogs(data.logs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetch(); }, []);

  function download() { window.open('/api/audit-log/export', '_blank'); }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="page-title">Audit Log</h1>
        <button className="btn-ghost text-sm" onClick={download}>↓ Download Excel</button>
      </div>
      <p className="page-sub">Full change history. Click a row to expand before/after.</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input className="input w-40" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} title="From" />
        <input className="input w-40" type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} title="To" />
        <input className="input w-44" placeholder="Actor email…" value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))} />
        <select className="input w-44" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="input w-36" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
          <option value="">All sources</option>
          {SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-primary" onClick={fetch}>Apply</button>
      </div>

      <div className="border border-border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="th">Timestamp</th>
            <th className="th">Actor</th>
            <th className="th">Action</th>
            <th className="th">Source</th>
            <th className="th">FAQ</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="td text-muted text-center py-8">Loading…</td></tr>}
            {!loading && !logs.length && <tr><td colSpan={5} className="td text-muted text-center py-8">No entries found.</td></tr>}
            {!loading && logs.map((e, i) => (
              <>
                <tr key={i} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setExpanded(expanded === i ? null : i)}>
                  <td className="td text-xs text-muted whitespace-nowrap">{new Date(e.timestamp).toLocaleString('en-IN')}</td>
                  <td className="td text-xs">{e.actor_email}</td>
                  <td className="td font-medium">{e.action}</td>
                  <td className="td">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${e.source === 'voice' ? 'bg-teal-light text-teal' : e.source === 'suggestion' ? 'bg-amber-light text-amber' : 'bg-gray-100 text-muted'}`}>{e.source}</span>
                  </td>
                  <td className="td text-muted text-xs max-w-xs truncate">{e.question_snippet || e.notes || '—'}</td>
                </tr>
                {expanded === i && (
                  <tr key={`${i}-x`}>
                    <td colSpan={5} className="px-4 py-4 bg-gray-50 border-b border-border">
                      <div className="grid grid-cols-2 gap-4">
                        {[['Before', e.before_answer], ['After', e.after_answer]].map(([label, val]) => (
                          <div key={label}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{label}</p>
                            <pre className="text-xs bg-white border border-border rounded p-3 whitespace-pre-wrap max-h-40 overflow-auto">{val || 'null'}</pre>
                          </div>
                        ))}
                      </div>
                      {e.notes && <p className="text-xs text-muted mt-2">Notes: {e.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
