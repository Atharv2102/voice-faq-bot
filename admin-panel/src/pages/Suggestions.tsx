import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import type { Suggestion } from '../types';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

function SuggestionCard({ s, onApprove, onReject }: { s: Suggestion; onApprove?: () => void; onReject?: (reason: string) => void }) {
  const [rejectModal, setRejectModal] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="card mb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-semibold text-sm">{s.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.type === 'update' ? 'bg-blue-50 text-blue-700' : s.type === 'add' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-muted'}`}>{s.type}</span>
            <span className={s.status === 'pending' ? 'badge-pending' : s.status === 'approved' ? 'badge-approved' : 'badge-rejected'}>{s.status}</span>
          </div>

          <p className="text-xs text-muted mb-2">
            From <span className="font-medium text-ink">{s.submitted_by.name ?? 'Unknown'}</span>
            {s.submitted_by.email ? ` (${s.submitted_by.email})` : ''}
            {' · '}{new Date(s.created_at).toLocaleString('en-IN')}
          </p>

          {s.target_question_snippet && (
            <p className="text-sm mb-1"><span className="text-muted">FAQ:</span> "{s.target_question_snippet}"</p>
          )}
          {s.current_answer && (
            <div className="text-sm mb-1">
              <span className="text-muted">Current: </span>
              <span className="text-ink">"{s.current_answer}"</span>
            </div>
          )}
          {s.proposed_answer && (
            <div className="text-sm mb-1">
              <span className="text-muted">Proposed: </span>
              <span className="font-medium text-teal">"{s.proposed_answer}"</span>
            </div>
          )}
          {s.proposed_question && (
            <div className="text-sm mb-1">
              <span className="text-muted">New question: </span>
              <span className="font-medium">"{s.proposed_question}"</span>
            </div>
          )}
          {s.reviewed_by && (
            <p className="text-xs text-muted mt-2">
              Reviewed by {s.reviewed_by} · {s.reviewed_at ? new Date(s.reviewed_at).toLocaleString('en-IN') : '—'}
              {s.review_reason ? ` — "${s.review_reason}"` : ''}
            </p>
          )}
        </div>

        {s.status === 'pending' && onApprove && onReject && (
          <div className="flex flex-col gap-2 shrink-0">
            <button className="btn-primary text-xs py-1.5" onClick={onApprove}>Approve</button>
            <button className="btn-danger text-xs py-1.5" onClick={() => setRejectModal(true)}>Reject</button>
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded border border-border w-full max-w-sm shadow-lg p-5">
            <h3 className="font-display text-base font-semibold mb-3">Reject suggestion {s.id}</h3>
            <label className="label">Reason <span className="text-muted font-normal">(optional)</span></label>
            <textarea className="input min-h-[70px] resize-none mb-4" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Information is still accurate." />
            <div className="flex gap-3">
              <button className="btn-danger" onClick={() => { onReject(reason); setRejectModal(false); }}>Confirm reject</button>
              <button className="btn-ghost" onClick={() => setRejectModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Suggestions() {
  const [tab, setTab] = useState<Tab>('pending');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchSuggestions = useCallback(() => {
    setLoading(true);
    const status = tab === 'all' ? undefined : tab;
    api.get('/suggestions', { params: { status, limit: 50 } })
      .then(({ data }) => { setSuggestions(data.suggestions); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  useEffect(() => {
    api.get('/suggestions/count?status=pending').then(r => setPendingCount(r.data.count)).catch(() => {});
  }, [suggestions]);

  async function approve(id: string) {
    try { await api.post(`/suggestions/${id}/approve`); toast.success('Suggestion approved.'); fetchSuggestions(); }
    catch (err: any) { toast.error(err.response?.data?.error ?? 'Approval failed.'); }
  }

  async function reject(id: string, reason: string) {
    try { await api.post(`/suggestions/${id}/reject`, { reason }); toast.success('Suggestion rejected.'); fetchSuggestions(); }
    catch (err: any) { toast.error(err.response?.data?.error ?? 'Rejection failed.'); }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending',  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <div>
      <h1 className="page-title">Suggestions</h1>
      <p className="page-sub">User-submitted FAQ change requests</p>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key ? 'border-teal text-teal' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && !suggestions.length && <p className="text-muted text-sm">No suggestions in this category.</p>}
      {!loading && suggestions.map(s => (
        <SuggestionCard
          key={s.id}
          s={s}
          onApprove={s.status === 'pending' ? () => approve(s.id) : undefined}
          onReject={s.status === 'pending' ? (reason) => reject(s.id, reason) : undefined}
        />
      ))}
    </div>
  );
}
