import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { AuditEntry, QueryEntry } from '../types';

interface Stats { faqCount: number; queriesTotal: number; answerRate: number; unansweredWeek: number; pendingSuggestions: number; }

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [unanswered, setUnanswered] = useState<QueryEntry[]>([]);

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 864e5);

    Promise.all([
      api.get('/health'),
      api.get('/query-log', { params: { from: today.toISOString(), limit: 200 } }),
      api.get('/query-log', { params: { answered: false, from: weekAgo.toISOString(), limit: 10 } }),
      api.get('/audit-log', { params: { limit: 10 } }),
    ]).then(([health, todayLogs, unansweredRes, auditRes]) => {
      const total = todayLogs.data.logs.length;
      const answered = todayLogs.data.logs.filter((l: QueryEntry) => l.answered === 'yes').length;
      setStats({
        faqCount: health.data.faqCount,
        queriesTotal: total,
        answerRate: total ? Math.round((answered / total) * 100) : 100,
        unansweredWeek: unansweredRes.data.total,
        pendingSuggestions: health.data.pendingSuggestions,
      });
      setActivity(auditRes.data.logs);
      setUnanswered(unansweredRes.data.logs);
    }).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Overview of your FAQ bot activity</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Active FAQs', value: stats?.faqCount ?? '—' },
          { label: 'Queries today', value: stats?.queriesTotal ?? '—' },
          { label: 'Answer rate', value: stats ? `${stats.answerRate}%` : '—' },
          { label: 'Unanswered this week', value: stats?.unansweredWeek ?? '—' },
          {
            label: 'Pending suggestions',
            value: stats?.pendingSuggestions ?? '—',
            highlight: (stats?.pendingSuggestions ?? 0) > 0,
          },
        ].map(({ label, value, highlight }) => (
          <div key={label} className={`stat-card ${highlight ? 'border-amber' : ''}`}>
            <span className={`stat-value ${highlight ? 'text-amber' : ''}`}>{value}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div>
          <h2 className="font-display text-base font-semibold mb-3">Recent activity</h2>
          {activity.length === 0
            ? <p className="text-muted text-sm">No recent changes.</p>
            : <div className="card p-0 overflow-hidden">
                {activity.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded mt-0.5 shrink-0 ${
                      e.source === 'voice' ? 'bg-teal-light text-teal' : e.source === 'suggestion' ? 'bg-amber-light text-amber' : 'bg-gray-100 text-muted'
                    }`}>{e.source}</span>
                    <div className="min-w-0">
                      <p className="text-sm truncate"><span className="font-medium">{e.action}</span> — "{e.question_snippet || '—'}"</p>
                      <p className="text-xs text-muted">{e.actor_email} · {new Date(e.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Most asked unanswered */}
        <div>
          <h2 className="font-display text-base font-semibold mb-3">Unanswered questions this week</h2>
          {unanswered.length === 0
            ? <p className="text-muted text-sm">None — great coverage!</p>
            : <div className="card p-0 overflow-hidden">
                {unanswered.map((q, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 gap-3">
                    <p className="text-sm truncate">"{q.query}"</p>
                    <button
                      onClick={() => navigate(`/questions?prefill=${encodeURIComponent(q.query)}`)}
                      className="text-xs text-teal hover:underline shrink-0"
                    >
                      Add FAQ
                    </button>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}
