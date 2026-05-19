import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('jwt', data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Sign in</h1>
        <p className="text-muted text-sm mb-8">FAQ Bot admin panel</p>
        <form onSubmit={submit} className="card flex flex-col gap-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="admin@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red bg-red-light rounded px-3 py-2">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center mt-1" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-sm text-muted text-center">
            New here? <Link to="/register" className="text-link">Create an admin account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
