import { useEffect, useState, FormEvent } from 'react';
import { api } from '../lib/api';

type Role = 'admin' | 'lt' | 'user';

type Person = {
  email: string;
  name: string;
  role: Role;
  teams_user_id: string;
  active: boolean;
  has_web_login: boolean;
  created_at?: string | null;
};

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', lt: 'LT', user: 'User' };
const ROLE_DESC: Record<Role, string> = {
  admin: 'Full control — admin panel access, manage FAQs in chat, approve/reject suggestions',
  lt: 'Read FAQs via chatbot; can suggest changes to admins',
  user: 'Read-only access to FAQs via chatbot',
};
const ROLE_PILL: Record<Role, string> = {
  admin: 'bg-red-light text-red',
  lt: 'bg-amber-light text-amber',
  user: 'bg-green-light text-green',
};

export default function Users() {
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Add-person form
  const [newName, setNewName]       = useState('');
  const [newEmail, setNewEmail]     = useState('');
  const [newRole, setNewRole]       = useState<Role>('user');
  const [newPassword, setNewPwd]    = useState('');

  // Promote-to-admin password prompt
  const [pwdPromptFor, setPwdPromptFor] = useState<Person | null>(null);
  const [pwdValue, setPwdValue]         = useState('');

  async function load() {
    try {
      const { data } = await api.get('/access');
      setPeople(data.users);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to load.');
    }
  }
  useEffect(() => { load(); }, []);

  async function addPerson(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const body: any = { email: newEmail.trim(), name: newName.trim(), role: newRole };
      if (newRole === 'admin') body.password = newPassword;
      await api.post('/access', body);
      setNewName(''); setNewEmail(''); setNewRole('user'); setNewPwd('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to add.');
    } finally { setLoading(false); }
  }

  async function changeRole(p: Person, role: Role) {
    if (role === p.role) return;
    // Promote to admin from non-admin without web login → ask for a password
    if (role === 'admin' && !p.has_web_login) {
      setPwdPromptFor(p);
      return;
    }
    try {
      await api.patch(`/access/${encodeURIComponent(p.email)}`, { role });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to change role.');
    }
  }

  async function confirmPwdPromotion() {
    if (!pwdPromptFor) return;
    if (pwdValue.length < 8) { setError('Password must be at least 8 characters.'); return; }
    try {
      await api.patch(`/access/${encodeURIComponent(pwdPromptFor.email)}`, { role: 'admin', password: pwdValue });
      setPwdPromptFor(null); setPwdValue('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to promote.');
    }
  }

  async function toggleActive(p: Person) {
    await api.patch(`/access/${encodeURIComponent(p.email)}`, { active: !p.active });
    load();
  }

  async function remove(p: Person) {
    if (!confirm(`Remove ${p.name} (${p.email})? They will lose all access.`)) return;
    await api.delete(`/access/${encodeURIComponent(p.email)}`);
    load();
  }

  const count = (r: Role) => people.filter(p => p.role === r).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Access management</h1>
        <p className="text-muted text-sm">
          One page to manage who can use the bot and what they can do.
          {' '}{count('admin')} admin · {count('lt')} LT · {count('user')} user
        </p>
      </div>

      {error && <p className="text-sm text-red bg-red-light rounded px-3 py-2">{error}</p>}

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Add a person</h2>
        <form onSubmit={addPerson} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input className="input sm:col-span-1" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} required />
          <input className="input sm:col-span-2" placeholder="Work email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
          <select className="input sm:col-span-1" value={newRole} onChange={e => setNewRole(e.target.value as Role)}>
            <option value="user">User</option>
            <option value="lt">LT</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn-primary sm:col-span-1" disabled={loading}>{loading ? '…' : 'Add'}</button>
          {newRole === 'admin' && (
            <input className="input sm:col-span-5" type="password" placeholder="Initial password (8+ chars) — required for admin" value={newPassword} onChange={e => setNewPwd(e.target.value)} minLength={8} required />
          )}
        </form>
        <p className="text-xs text-muted mt-3">
          The person's Teams ID will be linked automatically the first time they chat with the bot.
          New <strong>users</strong> and <strong>LT</strong> members don't need a password — only admins do.
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-muted">Name</th>
              <th className="px-4 py-3 font-medium text-muted">Email</th>
              <th className="px-4 py-3 font-medium text-muted">Role</th>
              <th className="px-4 py-3 font-medium text-muted">Teams</th>
              <th className="px-4 py-3 font-medium text-muted">Status</th>
              <th className="px-4 py-3 font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No users yet. Add one above.</td></tr>
            )}
            {people.map(p => (
              <tr key={p.email} className="border-t border-divider">
                <td className="px-4 py-3 text-ink">{p.name}</td>
                <td className="px-4 py-3 text-muted">{p.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_PILL[p.role]}`}>
                      {ROLE_LABEL[p.role]}
                    </span>
                    <select
                      className="input text-xs py-1 w-24"
                      value={p.role}
                      onChange={e => changeRole(p, e.target.value as Role)}
                      title={ROLE_DESC[p.role]}
                    >
                      <option value="user">User</option>
                      <option value="lt">LT</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.teams_user_id
                    ? <span className="text-green">✓ linked</span>
                    : <span className="text-amber">○ pending</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-green-light text-green' : 'bg-bg-elevated text-muted'}`}>
                    {p.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 space-x-2">
                  <button className="btn-secondary text-xs" onClick={() => toggleActive(p)}>{p.active ? 'Disable' : 'Enable'}</button>
                  <button className="btn-secondary text-xs text-red" onClick={() => remove(p)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card text-xs text-muted">
        <strong>Role permissions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><span className="font-medium text-ink">Admin</span> — {ROLE_DESC.admin}</li>
          <li><span className="font-medium text-ink">LT</span> — {ROLE_DESC.lt}</li>
          <li><span className="font-medium text-ink">User</span> — {ROLE_DESC.user}</li>
        </ul>
      </div>

      {pwdPromptFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={() => { setPwdPromptFor(null); setPwdValue(''); }}>
          <div className="bg-bg-elevated rounded-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ink mb-1">Promote to admin</h3>
            <p className="text-sm text-muted mb-4">Set an initial password for <strong>{pwdPromptFor.name}</strong>. They'll use this to log in to the admin panel.</p>
            <input className="input mb-3" type="password" placeholder="Password (8+ chars)" value={pwdValue} onChange={e => setPwdValue(e.target.value)} minLength={8} autoFocus />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setPwdPromptFor(null); setPwdValue(''); }}>Cancel</button>
              <button className="btn-primary" onClick={confirmPwdPromotion} disabled={pwdValue.length < 8}>Promote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
