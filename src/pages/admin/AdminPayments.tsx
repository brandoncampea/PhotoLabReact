import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';

interface StudioSub {
  id: number;
  name: string;
  email: string;
  plan: string | null;
  status: string;
  billingCycle: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  isFreeSubscription: boolean;
  cancellationRequested: boolean;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
}

interface Plan {
  id: number;
  name: string;
  monthly_price: number;
  yearly_price: number | null;
}

interface EditDraft {
  plan: string;
  status: string;
  billingCycle: string;
  isFree: boolean;
}

const STATUS_OPTIONS = ['active', 'inactive', 'past_due', 'canceled', 'paused'];

const statusColors: Record<string, string> = {
  active: '#4ade80',
  inactive: '#a1a1aa',
  past_due: '#f59e0b',
  canceled: '#ef4444',
  paused: '#60a5fa',
};

const statusBg: Record<string, string> = {
  active: 'rgba(74,222,128,0.12)',
  inactive: 'rgba(161,161,170,0.08)',
  past_due: 'rgba(245,158,11,0.12)',
  canceled: 'rgba(239,68,68,0.1)',
  paused: 'rgba(96,165,250,0.12)',
};

function statusLabel(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : 'Inactive';
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthlyEquiv(s: StudioSub): string {
  if (s.isFreeSubscription) return 'Free';
  if (!s.plan) return '—';
  if (s.billingCycle === 'yearly' && s.yearlyPrice != null) return `$${(s.yearlyPrice / 12).toFixed(2)}/mo`;
  if (s.monthlyPrice != null) return `$${s.monthlyPrice.toFixed(2)}/mo`;
  return '—';
}

function annualEquiv(s: StudioSub): string {
  if (s.isFreeSubscription) return 'Free';
  if (!s.plan) return '—';
  if (s.billingCycle === 'yearly' && s.yearlyPrice != null) return `$${s.yearlyPrice.toFixed(2)}/yr`;
  if (s.monthlyPrice != null) return `$${(s.monthlyPrice * 12).toFixed(2)}/yr`;
  return '—';
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#1a1830',
  border: '1px solid rgba(102,102,204,0.4)',
  borderRadius: 6,
  color: '#e4e4e7',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const AdminPayments: React.FC = () => {
  const [studios, setStudios] = useState<StudioSub[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/stripe/admin/studio-subscriptions'),
      api.get('/subscription-plans'),
    ])
      .then(([sRes, pRes]) => {
        setStudios(sRes.data);
        setPlans(pRes.data || []);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  const reload = () =>
    api.get('/stripe/admin/studio-subscriptions')
      .then(res => setStudios(res.data))
      .catch(() => {});

  const startEdit = (s: StudioSub) => {
    setEditingId(s.id);
    setSaveError(null);
    setDraft({
      plan: s.plan || '',
      status: s.status || 'inactive',
      billingCycle: s.billingCycle || 'monthly',
      isFree: s.isFreeSubscription,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setSaveError(null);
  };

  const saveEdit = async (studioId: number) => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/studios/${studioId}/subscription`, {
        subscriptionPlan: draft.isFree ? (draft.plan || null) : draft.plan || null,
        subscriptionStatus: draft.isFree ? 'active' : draft.status,
        billingCycle: draft.billingCycle,
        isFreeSubscription: draft.isFree,
      });
      await reload();
      setEditingId(null);
      setDraft(null);
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const filtered = studios.filter(s => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.plan || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const totals = {
    active: studios.filter(s => s.status === 'active').length,
    past_due: studios.filter(s => s.status === 'past_due').length,
    totalMrr: studios
      .filter(s => s.status === 'active' && !s.isFreeSubscription)
      .reduce((sum, s) => {
        if (s.billingCycle === 'yearly' && s.yearlyPrice != null) return sum + s.yearlyPrice / 12;
        if (s.monthlyPrice != null) return sum + s.monthlyPrice;
        return sum;
      }, 0),
  };

  return (
    <AdminLayout>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '40px 32px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 36 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                background: 'linear-gradient(90deg, #a78bfa, #7c5cff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Studio Payments
            </h1>
            <p style={{ color: '#a1a1aa', marginTop: 8, fontSize: 15 }}>
              Manage subscription plans and billing for all studios.
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Active Subscriptions', value: totals.active, color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
              { label: 'Past Due', value: totals.past_due, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
              { label: 'Est. Monthly Revenue', value: `$${totals.totalMrr.toFixed(2)}`, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.color}33`, borderRadius: 12, padding: 20 }}>
                <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{card.label}</div>
                <div style={{ color: card.color, fontWeight: 800, fontSize: 28 }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search studio, email, or plan..."
              style={{ flex: 1, minWidth: 220, padding: '9px 14px', background: '#1e1c30', border: '1px solid rgba(102,102,204,0.3)', borderRadius: 8, color: '#e4e4e7', fontSize: 14, outline: 'none' }}
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '9px 14px', background: '#1e1c30', border: '1px solid rgba(102,102,204,0.3)', borderRadius: 8, color: '#e4e4e7', fontSize: 14, outline: 'none' }}
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 60 }}>Loading subscriptions...</div>
          ) : (
            <div style={{ background: 'rgba(20,20,35,0.8)', border: '1px solid rgba(102,102,204,0.3)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1.2fr 1.3fr 80px', padding: '10px 20px', borderBottom: '1px solid rgba(102,102,204,0.2)', color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <div>Studio</div>
                <div>Plan</div>
                <div>Status</div>
                <div>Billing</div>
                <div>Rate</div>
                <div>Renews / Ends</div>
                <div></div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 40 }}>
                  {search || filterStatus !== 'all' ? 'No studios match your filters.' : 'No studios found.'}
                </div>
              ) : (
                filtered.map((s, i) => {
                  const isEditing = editingId === s.id;
                  const isLast = i === filtered.length - 1;

                  return (
                    <div key={s.id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(102,102,204,0.1)' }}>
                      {/* Summary row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1.2fr 1.3fr 80px', padding: '14px 20px', alignItems: 'center', background: isEditing ? 'rgba(124,92,255,0.06)' : 'transparent' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{s.name}</div>
                          <div style={{ color: '#52525b', fontSize: 12, marginTop: 2 }}>{s.email}</div>
                        </div>
                        <div style={{ color: s.plan ? '#e4e4e7' : '#52525b', fontSize: 14 }}>
                          {s.plan || 'None'}
                          {s.isFreeSubscription && <span style={{ marginLeft: 6, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>Free</span>}
                        </div>
                        <div>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, background: statusBg[s.status] || 'transparent', color: statusColors[s.status] || '#a1a1aa', fontSize: 12, fontWeight: 700 }}>
                            {statusLabel(s.status)}
                          </span>
                        </div>
                        <div style={{ color: '#e4e4e7', fontSize: 13, textTransform: 'capitalize' }}>
                          {s.billingCycle === 'yearly' ? 'Annual' : 'Monthly'}
                        </div>
                        <div>
                          <div style={{ color: s.isFreeSubscription ? '#4ade80' : '#a78bfa', fontWeight: 700, fontSize: 14 }}>{monthlyEquiv(s)}</div>
                          {!s.isFreeSubscription && <div style={{ color: '#52525b', fontSize: 11, marginTop: 1 }}>{annualEquiv(s)} equiv</div>}
                        </div>
                        <div style={{ color: '#a1a1aa', fontSize: 13 }}>
                          {s.cancellationRequested
                            ? <span style={{ color: '#ef4444' }}>Cancels {formatDate(s.subscriptionEnd)}</span>
                            : formatDate(s.subscriptionEnd)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {isEditing ? (
                            <button
                              onClick={cancelEdit}
                              style={{ padding: '5px 12px', background: 'transparent', border: '1px solid rgba(102,102,204,0.4)', borderRadius: 6, color: '#a1a1aa', fontSize: 12, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => startEdit(s)}
                              style={{ padding: '5px 12px', background: 'rgba(102,102,204,0.15)', border: '1px solid rgba(102,102,204,0.35)', borderRadius: 6, color: '#cfd5ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline edit panel */}
                      {isEditing && draft && (
                        <div style={{ margin: '0 20px 16px', padding: 20, background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.25)', borderRadius: 10 }}>
                          {saveError && (
                            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
                              {saveError}
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
                            {/* Plan */}
                            <div>
                              <label style={{ display: 'block', color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Plan</label>
                              <select
                                value={draft.plan}
                                onChange={e => setDraft({ ...draft, plan: e.target.value })}
                                style={inputStyle}
                                disabled={draft.isFree}
                              >
                                <option value="">— None —</option>
                                {plans.map(p => (
                                  <option key={p.id} value={p.name}>{p.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Status */}
                            <div>
                              <label style={{ display: 'block', color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Status</label>
                              <select
                                value={draft.isFree ? 'active' : draft.status}
                                onChange={e => setDraft({ ...draft, status: e.target.value })}
                                style={inputStyle}
                                disabled={draft.isFree}
                              >
                                {STATUS_OPTIONS.map(s => (
                                  <option key={s} value={s}>{statusLabel(s)}</option>
                                ))}
                              </select>
                            </div>

                            {/* Billing cycle */}
                            <div>
                              <label style={{ display: 'block', color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Billing Cycle</label>
                              <select
                                value={draft.billingCycle}
                                onChange={e => setDraft({ ...draft, billingCycle: e.target.value })}
                                style={inputStyle}
                                disabled={draft.isFree}
                              >
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Annual</option>
                              </select>
                            </div>

                            {/* Free toggle */}
                            <div style={{ paddingBottom: 2 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                                <div
                                  onClick={() => setDraft({ ...draft, isFree: !draft.isFree, status: !draft.isFree ? 'active' : draft.status })}
                                  style={{
                                    width: 40,
                                    height: 22,
                                    borderRadius: 11,
                                    background: draft.isFree ? '#4ade80' : 'rgba(102,102,204,0.3)',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    flexShrink: 0,
                                  }}
                                >
                                  <div style={{
                                    position: 'absolute',
                                    top: 3,
                                    left: draft.isFree ? 21 : 3,
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.2s',
                                  }} />
                                </div>
                                <span style={{ color: draft.isFree ? '#4ade80' : '#a1a1aa', fontSize: 13, fontWeight: 700 }}>
                                  Free
                                </span>
                              </label>
                              <div style={{ color: '#52525b', fontSize: 11, marginTop: 4 }}>No billing required</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                            <button
                              onClick={cancelEdit}
                              style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(102,102,204,0.4)', borderRadius: 7, color: '#a1a1aa', fontSize: 13, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(s.id)}
                              disabled={saving}
                              style={{ padding: '8px 22px', background: saving ? 'rgba(124,92,255,0.4)' : '#7c5cff', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div style={{ color: '#52525b', fontSize: 12, marginTop: 12, textAlign: 'right' }}>
              {filtered.length} of {studios.length} studios
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminPayments;
