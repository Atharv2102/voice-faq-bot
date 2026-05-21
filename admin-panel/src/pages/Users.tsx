import { useEffect, useState, FormEvent } from 'react';
import { api } from '../lib/api';

type AllowUser = {
  teams_user_id: string;
  name: string;
  email: string;
  active: boolean;
  created_at?: string;
  created_by?: string;
};

type RosterAdmin = {
  email: string;
  name: string;
  role: 'admin' | 'lt';
  teams_user_id: string;
  active: boolean;
  created_at?: string | null;
};

export default function Users() {
  const [tab, setTab] = useState<'users' | 'roster'>('users');
  const [users, setUsers] = useState<AllowUser[]>([]);
  const [roster, setRoster] = useState<RosterAdmin[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Add-user form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  async function load() {
    try {
      const [u, r] = await Promise.all([api.get('/users'), api.get('/roster')]);
      setUsers(u.data.users);
      setRoster(r.data.admins);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to load.');
    }
  }
  useEffect(() => { load(); }, []);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/users', { email: newEmail.trim(), name: newName.trim() });
      setNewName(''); setNewEmail('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to add user.');
    } finally { setLoading(false); }
  }

  async function toggleUser(u: AllowUser) {
    await api.patch(`/users/${encodeURIComponent(u.email)}`, { active: !u.active });
    load();
  }
  async function removeUser(u: AllowUser) {
    if (!confirm(`Remove ${u.name} (${u.email}) from the allowlist?`)) return;
    await api.delete(`/users/${encodeURIComponent(u.email)}`);
    load();
  }

  async function updateRoster(email: string, updates: Partial<RosterAdmin>) {
    await api.patch(`/roster/${encodeURIComponent(email)}`, updates);
    load();
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Access management</h1>
        <p className="text-muted text-sm">Control who can use the bot and who can manage FAQs.</p>
      </div>

      <div className="flex gap-2 border-b border-divider">
        <button className={`px-4 py-2 text-sm font-medium ${tab === 'users' ? 'border-b-2 border-blue text-ink' : 'text-muted'}`} onClick={() => setTab('users')}>
          Allowlisted users ({users.length})
        </button>
        <button className={`px-4 py-2 text-sm font-medium ${tab === 'roster' ? 'border-b-2 border-blue text-ink' : 'text-muted'}`} onClick={() => setTab('roster')}>
          Admins & LT ({roster.length})
        </button>
      </div>

      {error && <p className="text-sm text-red bg-red-light rounded px-3 py-2">{error}</p>}

      {tab === 'users' && (
        <>
          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink mb-4">Add a new user</h2>
            <form onSubmit={addUser} className="flex flex-col sm:flex-row gap-3">
              <input className="input flex-1" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} required />
              <input className="input flex-1" placeholder="Work email (e.g. name@inmobi.com)" value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" required />
              <button className="btn-primary" disabled={loading}>{loading ? '…' : 'Add'}</button>
            </form>
            <p className="text-xs text-muted mt-3">
              The user's Teams ID will be linked automatically the first time they message the bot.
            </p>
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-muted">Email</th>
                  <th className="px-4 py-3 font-medium text-muted">Teams linked</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No users on the allowlist yet. Add one above — or set <code>ACCESS_OPEN_MODE=true</code> to allow anyone.</td></tr>
                )}
                {users.map(u => (
                  <tr key={u.email} className="border-t border-divider">
                    <td className="px-4 py-3 text-ink">{u.name}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {u.teams_user_id
                        ? <span className="text-green">✓ linked</span>
                        : <span className="text-amber">○ pending first message</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-light text-green' : 'bg-bg-elevated text-muted'}`}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button className="btn-secondary text-xs" onClick={() => toggleUser(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                      <button className="btn-secondary text-xs text-red" onClick={() => removeUser(u)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'roster' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-muted">Name</th>
                <th className="px-4 py-3 font-medium text-muted">Email</th>
                <th className="px-4 py-3 font-medium text-muted">Role</th>
                <th className="px-4 py-3 font-medium text-muted">Teams linked</th>
                <th className="px-4 py-3 font-medium text-muted">Status</th>
                <th className="px-4 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(a => (
                <tr key={a.email} className="border-t border-divider">
                  <td className="px-4 py-3 text-ink">{a.name}</td>
                  <td className="px-4 py-3 text-muted">{a.email}</td>
                  <td className="px-4 py-3">
                    <select
                      className="input text-xs py-1"
                      value={a.role}
                      onChange={e => updateRoster(a.email, { role: e.target.value as 'admin' | 'lt' })}
                    >
                      <option value="admin">Admin</option>
                      <option value="lt">LT</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.teams_user_id ? '✓' : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.active ? 'bg-green-light text-green' : 'bg-bg-elevated text-muted'}`}>
                      {a.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="btn-secondary text-xs" onClick={() => updateRoster(a.email, { active: !a.active })}>
                      {a.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
