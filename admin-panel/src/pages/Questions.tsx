import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import type { FAQ } from '../types';

const CATEGORIES = ['General', 'Policy', 'Support', 'Shipping', 'Payment', 'Orders', 'Account'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded border border-border w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Questions() {
  const [params] = useSearchParams();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<null | 'add' | FAQ>(null);
  const [form, setForm] = useState({ question: '', answer: '', category: 'General', alternates: '' });
  const [saving, setSaving] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fill from query param (from dashboard "Add FAQ" shortcut)
  useEffect(() => {
    const prefill = params.get('prefill');
    if (prefill) setForm(f => ({ ...f, question: prefill }));
  }, [params]);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const fetchFaqs = useCallback(() => {
    setLoading(true);
    api.get('/questions', { params: { page, limit: 20, search: debouncedSearch || undefined } })
      .then(({ data }) => { setFaqs(data.questions); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  function openEdit(faq: FAQ) {
    setModal(faq);
    setForm({ question: faq.question, answer: faq.answer, category: faq.category, alternates: faq.alternates.join(', ') });
    api.post(`/lock/${faq.id}`).catch(() => {});
    heartbeatRef.current = setInterval(() => api.post(`/lock/${faq.id}/refresh`).catch(() => {}), 2 * 60 * 1000);
  }

  function closeModal() {
    if (typeof modal === 'object' && modal !== null) {
      api.delete(`/lock/${(modal as FAQ).id}`).catch(() => {});
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    }
    setModal(null);
    setForm({ question: '', answer: '', category: 'General', alternates: '' });
  }

  async function saveForm() {
    setSaving(true);
    const payload = { question: form.question, answer: form.answer, category: form.category, alternates: form.alternates.split(',').map(s => s.trim()).filter(Boolean) };
    try {
      if (modal === 'add') { await api.post('/questions', payload); toast.success('FAQ added.'); }
      else { await api.put(`/questions/${(modal as FAQ).id}`, payload); toast.success('FAQ updated.'); }
      closeModal(); fetchFaqs();
    } catch (err: any) { toast.error(err.response?.data?.error ?? 'Save failed.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(faq: FAQ) {
    try {
      await api.put(`/questions/${faq.id}`, { active: !faq.active });
      toast.success(faq.active ? 'FAQ disabled.' : 'FAQ enabled.');
      fetchFaqs();
    } catch (err: any) { toast.error(err.response?.data?.error ?? 'Failed.'); }
  }

  async function deleteFaq(faq: FAQ) {
    if (!confirm(`Delete "${faq.question}"? This cannot be undone.`)) return;
    try { await api.delete(`/questions/${faq.id}?hard=true`); toast.success('FAQ deleted.'); fetchFaqs(); }
    catch (err: any) { toast.error(err.response?.data?.error ?? 'Delete failed.'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="page-title">FAQs</h1>
        <button className="btn-primary" onClick={() => { setModal('add'); setForm({ question: '', answer: '', category: 'General', alternates: '' }); }}>+ Add FAQ</button>
      </div>
      <p className="page-sub">{total} total entries</p>

      <div className="flex gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Search questions…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="th">Question</th>
            <th className="th">Category</th>
            <th className="th">Status</th>
            <th className="th">Updated by</th>
            <th className="th">Updated</th>
            <th className="th w-24"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="td text-center text-muted py-8">Loading…</td></tr>}
            {!loading && !faqs.length && <tr><td colSpan={6} className="td text-center text-muted py-8">No FAQs found.</td></tr>}
            {!loading && faqs.map(faq => (
              <tr key={faq.id} className="hover:bg-gray-50 transition-colors">
                <td className="td max-w-xs">
                  {faq.lock && faq.lock.userEmail && (
                    <span className="text-xs text-amber mr-1" title={`Locked by ${faq.lock.userEmail}`}>🔒</span>
                  )}
                  <span className="font-medium">{faq.question}</span>
                </td>
                <td className="td text-muted">{faq.category}</td>
                <td className="td"><span className={faq.active ? 'badge-active' : 'badge-disabled'}>{faq.active ? 'active' : 'disabled'}</span></td>
                <td className="td text-muted text-xs">{faq.updated_by}</td>
                <td className="td text-muted text-xs whitespace-nowrap">{new Date(faq.updated_at).toLocaleDateString('en-IN')}</td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="text-xs text-teal hover:underline" onClick={() => openEdit(faq)}>Edit</button>
                    <button className="text-xs text-muted hover:text-ink" onClick={() => toggleActive(faq)}>{faq.active ? 'Disable' : 'Enable'}</button>
                    <button className="text-xs text-red hover:underline" onClick={() => deleteFaq(faq)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          <button className="btn-ghost py-1.5 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-muted">Page {page} of {pages}</span>
          <button className="btn-ghost py-1.5 text-xs" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add FAQ' : 'Edit FAQ'} onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Question</label>
              <input className="input" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="What are the office hours?" />
            </div>
            <div>
              <label className="label">Answer</label>
              <textarea className="input min-h-[80px] resize-y" value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} placeholder="Monday to Saturday, 9 AM to 9 PM." />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Alternate phrasings <span className="text-muted font-normal">(comma-separated)</span></label>
              <input className="input" value={form.alternates} onChange={e => setForm(f => ({ ...f, alternates: e.target.value }))} placeholder="when are you open, office timings" />
            </div>
            <div className="flex gap-3 pt-1">
              <button className="btn-primary" onClick={saveForm} disabled={saving || !form.question || !form.answer}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn-ghost" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
