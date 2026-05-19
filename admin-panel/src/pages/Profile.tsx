import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Me = {
  email: string;
  name: string;
  teams_user_id: string;
  teams_linked: boolean;
  notifications_enabled: boolean;
};

export default function Profile() {
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeExpires, setCodeExpires] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadMe() {
    try {
      const { data } = await api.get('/auth/me');
      setMe(data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to load profile.');
    }
  }

  useEffect(() => { loadMe(); }, []);

  // Poll for link completion every 3s when a code is active
  useEffect(() => {
    if (!code) return;
    const id = setInterval(loadMe, 3000);
    return () => clearInterval(id);
  }, [code]);

  // When me.teams_linked becomes true while a code is showing, clear the code
  useEffect(() => {
    if (me?.teams_linked && code) { setCode(null); setCodeExpires(null); }
  }, [me?.teams_linked, code]);

  // Countdown timer
  useEffect(() => {
    if (!codeExpires) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((codeExpires - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [codeExpires]);

  useEffect(() => {
    if (codeExpires && secondsLeft === 0) { setCode(null); setCodeExpires(null); }
  }, [secondsLeft, codeExpires]);

  async function generateCode() {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/link-code');
      setCode(data.code);
      setCodeExpires(new Date(data.expires_at).getTime());
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to generate code.');
    } finally { setLoading(false); }
  }

  async function unlink() {
    if (!confirm('Unlink your Teams account? You will lose voice admin access in Teams until you re-link.')) return;
    setLoading(true); setError('');
    try {
      await api.post('/auth/unlink-teams');
      await loadMe();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to unlink.');
    } finally { setLoading(false); }
  }

  if (!me) {
    return <div className="p-6 text-muted">Loading profile…</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Profile</h1>
        <p className="text-muted text-sm">Manage your admin account</p>
      </div>

      <div className="card space-y-4">
        <div>
          <div className="label">Name</div>
          <div className="text-ink">{me.name}</div>
        </div>
        <div>
          <div className="label">Email</div>
          <div className="text-ink">{me.email}</div>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Microsoft Teams account</h2>
          <p className="text-muted text-sm mt-1">
            Link your Teams identity so you can run admin commands by chatting with the bot in Teams.
            Without this, you can only manage FAQs from this web panel.
          </p>
        </div>

        {me.teams_linked ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-light text-green text-sm font-medium">
                <span>✓</span> Linked
              </div>
              <div className="text-muted text-xs mt-2 font-mono break-all">{me.teams_user_id}</div>
            </div>
            <button onClick={unlink} disabled={loading} className="btn-secondary self-start">
              {loading ? '…' : 'Unlink'}
            </button>
          </div>
        ) : code ? (
          <div className="space-y-3">
            <div className="bg-bg-elevated border border-divider rounded-lg p-4 text-center">
              <div className="text-xs text-muted uppercase tracking-wider mb-2">Your one-time code</div>
              <div className="font-mono text-4xl font-bold text-ink tracking-widest">{code}</div>
              <div className="text-xs text-muted mt-3">Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</div>
            </div>
            <ol className="text-sm text-ink space-y-1 list-decimal list-inside">
              <li>Open Microsoft Teams and find the FAQ Bot chat</li>
              <li>Send the bot this message: <code className="bg-bg-elevated px-2 py-0.5 rounded font-mono">link {code}</code></li>
              <li>This page will update automatically once linked</li>
            </ol>
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-light text-amber text-sm font-medium mb-3">
              <span>○</span> Not linked
            </div>
            <button onClick={generateCode} disabled={loading} className="btn-primary block">
              {loading ? 'Generating…' : 'Generate link code'}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red bg-red-light rounded px-3 py-2">{error}</p>}
      </div>
    </div>
  );
}
