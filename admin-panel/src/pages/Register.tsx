import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const body: Record<string, string> = { email, name, password };
      if (code.trim()) body.register_code = code.trim();
      const { data } = await api.post('/auth/register', body);
      localStorage.setItem('jwt', data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Create admin account</h1>
        <p className="text-muted text-sm mb-8">FAQ Bot admin panel</p>
        <form onSubmit={submit} className="card flex flex-col gap-4">
          <div>
            <label className="label">Full name</label>
            <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} placeholder="Re-enter password" />
          </div>
          <div>
            <label className="label">Registration code <span className="text-muted text-xs">(if your org requires one)</span></label>
            <input type="text" className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="text-sm text-red bg-red-light rounded px-3 py-2">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center mt-1" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-sm text-muted text-center">
            Already have an account? <Link to="/login" className="text-link">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
