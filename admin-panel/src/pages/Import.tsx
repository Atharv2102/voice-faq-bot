import { useState, useRef, DragEvent } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface Preview { question: string; answer: string; category: string; }

function parsePreview(file: File): Promise<Preview[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        if (file.name.endsWith('.json')) {
          const arr = Array.isArray(JSON.parse(text)) ? JSON.parse(text) : [JSON.parse(text)];
          resolve(arr.slice(0, 5).map((r: any) => ({ question: r.question || r.question_text || '', answer: r.answer || r.answer_text || '', category: r.category || 'General' })));
        } else {
          const lines = text.split('\n').filter(Boolean);
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          const qi = headers.indexOf('question') >= 0 ? headers.indexOf('question') : headers.indexOf('question_text');
          const ai = headers.indexOf('answer') >= 0 ? headers.indexOf('answer') : headers.indexOf('answer_text');
          const ci = headers.indexOf('category');
          resolve(lines.slice(1, 6).map(l => { const c = l.split(','); return { question: c[qi]?.trim() ?? '', answer: c[ai]?.trim() ?? '', category: ci >= 0 ? c[ci]?.trim() : 'General' }; }).filter(r => r.question));
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f); setResult(null);
    try { setPreview(await parsePreview(f)); }
    catch { setPreview(null); toast.error('Could not parse file for preview.'); }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function submit() {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      const { data } = await api.post('/bulk-import', form);
      setResult(data);
      toast.success(`Imported ${data.added} FAQs.`);
      setFile(null); setPreview(null);
    } catch (err: any) { toast.error(err.response?.data?.error ?? 'Import failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="page-title">Bulk Import</h1>
      <p className="page-sub">Upload CSV (<code className="text-xs bg-gray-100 px-1 rounded">question,answer,category,alternates</code>) or JSON array</p>

      {!file && (
        <div
          className={`border-2 border-dashed rounded cursor-pointer flex flex-col items-center py-14 transition-colors ${dragging ? 'border-teal bg-teal-light' : 'border-border hover:border-teal'}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <svg className="w-8 h-8 text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          <p className="text-sm font-medium">Drop a file here or click to browse</p>
          <p className="text-xs text-muted mt-1">CSV or JSON · max 10 MB</p>
          <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {preview && !result && (
        <div className="mt-5">
          <p className="text-sm font-medium mb-3">Preview — first {preview.length} row(s) of <span className="text-muted">{file?.name}</span></p>
          <div className="border border-border rounded overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead><tr><th className="th">Question</th><th className="th">Answer</th><th className="th">Category</th></tr></thead>
              <tbody>{preview.map((r, i) => (
                <tr key={i}><td className="td max-w-xs truncate font-medium">{r.question}</td><td className="td max-w-xs truncate text-muted">{r.answer}</td><td className="td text-muted">{r.category}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge (skip duplicates)</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace all existing FAQs</label>
          </div>
          {mode === 'replace' && <p className="text-xs text-amber bg-amber-light rounded px-3 py-2 mb-4">⚠️ Replace mode will overwrite all existing FAQs. This cannot be undone.</p>}
          <div className="flex gap-3">
            <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? 'Importing…' : 'Confirm import'}</button>
            <button className="btn-ghost" onClick={() => { setFile(null); setPreview(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-5 card">
          <h2 className="font-display text-lg font-semibold mb-4">Import complete</h2>
          <div className="flex gap-8 mb-4">
            <div><p className="text-3xl font-semibold text-teal">{result.added}</p><p className="text-xs text-muted uppercase tracking-wide mt-1">Added</p></div>
            <div><p className="text-3xl font-semibold">{result.skipped}</p><p className="text-xs text-muted uppercase tracking-wide mt-1">Skipped</p></div>
            {result.errors.length > 0 && <div><p className="text-3xl font-semibold text-red">{result.errors.length}</p><p className="text-xs text-muted uppercase tracking-wide mt-1">Errors</p></div>}
          </div>
          {result.errors.length > 0 && <ul className="text-xs text-red list-disc list-inside space-y-1 mb-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <button className="btn-ghost text-xs" onClick={() => setResult(null)}>Import another file</button>
        </div>
      )}
    </div>
  );
}
