import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const NAV = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/questions',   label: 'FAQs' },
  { to: '/suggestions', label: 'Suggestions', badge: true },
  { to: '/import',      label: 'Import' },
  { to: '/audit',       label: 'Audit Log' },
  { to: '/queries',     label: 'Query Log' },
  { to: '/profile',     label: 'Profile' },
];

export default function Layout() {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetch = () => api.get('/suggestions/count?status=pending').then(r => setPendingCount(r.data.count)).catch(() => {});
    fetch();
    const t = setInterval(fetch, 30_000);
    return () => clearInterval(t);
  }, []);

  function logout() { localStorage.removeItem('jwt'); navigate('/login'); }

  // Decode email from JWT
  let email = '';
  try { email = JSON.parse(atob(localStorage.getItem('jwt')!.split('.')[1])).email; } catch {}

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <span className="font-display text-base font-semibold text-ink">FAQ Bot</span>
          <span className="block text-xs text-muted mt-0.5">Admin</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map(({ to, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                  isActive ? 'bg-teal-light text-teal font-medium' : 'text-ink hover:bg-gray-50'
                }`
              }
            >
              <span>{label}</span>
              {badge && pendingCount > 0 && (
                <span className="text-xs bg-amber text-white rounded-full px-1.5 py-0.5 font-semibold leading-none">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <p className="text-xs text-muted truncate mb-2">{email}</p>
          <button onClick={logout} className="text-xs text-muted hover:text-ink transition-colors">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
