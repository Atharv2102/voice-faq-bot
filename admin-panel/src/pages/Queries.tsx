import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { QueryEntry } from '../types';

export default function Queries() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [answered, setAnswered] = useState<'' | 'true' | 'false'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function fetch() {
    setLoading(true);
    api.get('/query-log', { params: { answered: answered || undefined, from: from || undefined, to: to || undefined, limit: 100 } })
      .then(({ data }) => setLogs(data.logs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <h1 className="page-title">Query Log</h1>
      <p className="page-sub">What users are asking. Use "Add as FAQ" to fill gaps.</p>

      <div className="flex flex-wrap gap-3 mb-5">
        <select className="input w-44" value={answered} onChange={e => setAnswered(e.target.value as any)}>
          <option value="">All queries</option>
          <option value="true">Answered</option>
          <option value="false">Unanswered</option>
        </select>
        <input className="input w-40" type="date" value={from} onChange={e => setFrom(e.target.value)} title="From" />
        <input className="input w-40" type="date" value={to} onChange={e => setTo(e.target.value)} title="To" />
        <button className="btn-primary" onClick={fetch}>Apply</button>
      </div>

      <div className="border border-border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="th">Timestamp</th>
            <th className="th">User</th>
            <th className="th">Query</th>
            <th className="th">Matched FAQ</th>
            <th className="th">Confidence</th>
            <th className="th">Answered</th>
            <th className="th w-24"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="td text-muted text-center py-8">Loading…</td></tr>}
            {!loading && !logs.length && <tr><td colSpan={7} className="td text-muted text-center py-8">No queries found.</td></tr>}
            {!loading && logs.map((q, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="td text-xs text-muted whitespace-nowrap">{new Date(q.timestamp).toLocaleString('en-IN')}</td>
                <td className="td text-xs text-muted">{q.user_name || q.user_email || '—'}</td>
                <td className="td max-w-xs"><span className="font-medium">"{q.query}"</span></td>
                <td className="td text-xs text-muted">{q.matched_faq_id || '—'}</td>
                <td className="td text-xs">{q.confidence ? `${Math.round(Number(q.confidence) * 100)}%` : '—'}</td>
                <td className="td">
                  <span className={q.answered === 'yes' ? 'badge-approved' : 'badge-rejected'}>{q.answered}</span>
                </td>
                <td className="td">
                  {q.answered === 'no' && (
                    <button
                      className="text-xs text-teal hover:underline"
                      onClick={() => navigate(`/questions?prefill=${encodeURIComponent(q.query)}`)}
                    >
                      Add as FAQ
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
