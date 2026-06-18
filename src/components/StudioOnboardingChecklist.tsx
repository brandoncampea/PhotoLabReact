import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

type Step = { id: string; label: string; done: boolean; link: string | null };

const DISMISS_KEY = 'studio_onboarding_dismissed';

const STEP_ICONS: Record<string, string> = {
  profile:   '🖼️',
  watermark: '💧',
  priceList: '💰',
  shipping:  '📦',
  packages:  '🎁',
  albums:    '📷',
  income:    '🎉',
};

const StudioOnboardingChecklist: React.FC = () => {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    api.get('/studios/onboarding-checklist')
      .then(res => setSteps(res.data?.steps || []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, []);

  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  if (loading || dismissed) return null;

  return (
    <div style={{
      background: 'rgba(22,22,35,0.97)',
      border: '1px solid rgba(124,92,255,0.3)',
      borderRadius: 14,
      marginBottom: 24,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        userSelect: 'none',
      }} onClick={() => setCollapsed(c => !c)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.97rem' }}>
              {allDone ? '🎉 Setup complete!' : 'Studio Setup Checklist'}
            </span>
            <span style={{
              fontSize: '0.75rem', fontWeight: 700,
              background: allDone ? 'rgba(74,222,128,0.18)' : 'rgba(124,92,255,0.18)',
              color: allDone ? '#4ade80' : '#a78bfa',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {completedCount}/{totalCount}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: allDone
                ? 'linear-gradient(90deg,#4ade80,#22c55e)'
                : 'linear-gradient(90deg,#a78bfa,#7c5cff)',
              borderRadius: 4,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {allDone && (
            <button
              onClick={e => { e.stopPropagation(); handleDismiss(); }}
              style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.8rem', cursor: 'pointer', padding: '2px 6px' }}
            >
              Dismiss
            </button>
          )}
          <span style={{ color: '#52525b', fontSize: '0.85rem' }}>{collapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 18px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px 16px' }}>
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              const inner = (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: step.done
                      ? (isLast ? 'rgba(74,222,128,0.08)' : 'rgba(74,222,128,0.05)')
                      : 'rgba(255,255,255,0.03)',
                    border: step.done
                      ? '1px solid rgba(74,222,128,0.15)'
                      : '1px solid rgba(255,255,255,0.06)',
                    cursor: step.link && !step.done ? 'pointer' : 'default',
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Circle checkbox */}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: step.done ? 'none' : '2px solid #3f3f60',
                    background: step.done
                      ? (isLast ? '#22c55e' : '#4ade80')
                      : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 700,
                  }}>
                    {step.done && '✓'}
                  </div>
                  <span style={{ fontSize: '0.9rem' }}>{STEP_ICONS[step.id]}</span>
                  <span style={{
                    fontSize: '0.87rem',
                    fontWeight: step.done ? 400 : 600,
                    color: step.done ? '#6b7280' : '#e0e0e0',
                    textDecoration: step.done ? 'line-through' : 'none',
                    flex: 1,
                  }}>
                    {step.label}
                  </span>
                  {!step.done && step.link && (
                    <span style={{ fontSize: '0.72rem', color: '#7c5cff', fontWeight: 700, flexShrink: 0 }}>→</span>
                  )}
                </div>
              );

              return step.link && !step.done
                ? <Link key={step.id} to={step.link} style={{ textDecoration: 'none' }}>{inner}</Link>
                : <div key={step.id}>{inner}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioOnboardingChecklist;
