import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TicketDetails } from '../../tickets/TicketDetails';
import { getDiagnostics } from '../../utils/diagnostics';

type TicketRow = {
  id: number;
  subject: string;
  status: string;
  escalated: boolean;
  created_at?: string;
  createdAt?: string;
  meta?: { source?: string } | null;
};

const STATUS_PILLS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#dcfce7', color: '#15803d' },
  pending: { bg: '#fef9c3', color: '#a16207' },
  closed: { bg: '#f3f4f6', color: '#6b7280' },
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_PILLS[status] || { bg: '#e5e7eb', color: '#374151' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const CreateForm: React.FC<{ token: string; onCreated: (t: TicketRow) => void; onCancel: () => void }> = ({ token, onCreated, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) { setErr('Subject and description are required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          meta: { diagnostics: getDiagnostics() },
        }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Failed to create ticket'); return; }
      const ticket = await res.json();
      onCreated(ticket);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 24 }}>
      <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: '1em' }}>New Support Ticket</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Brief summary of your issue"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe your issue in detail…"
            rows={4}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={saving} style={{ padding: '8px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {saving ? 'Submitting…' : 'Submit Ticket'}
          </button>
          <button type="button" onClick={onCancel} style={{ padding: '8px 14px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const StudioTickets: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    fetch('/api/tickets/mine', {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => { setTickets(data.tickets || []); setLoading(false); })
      .catch(() => { setError('Failed to load tickets'); setLoading(false); });
  };

  useEffect(load, [user]);

  const handleCreated = (ticket: TicketRow) => {
    setTickets(prev => [ticket, ...prev]);
    setShowCreate(false);
    setSelectedTicketId(String(ticket.id));
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  return (
    <div style={{ maxWidth: 860, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Support Tickets</h2>
          {!loading && tickets.length > 0 && (
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
              {openCount > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>{openCount} open</span>}
              {openCount > 0 && pendingCount > 0 && <span style={{ color: '#9ca3af' }}> · </span>}
              {pendingCount > 0 && <span style={{ color: '#a16207', fontWeight: 600 }}>{pendingCount} pending</span>}
            </div>
          )}
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            + New Ticket
          </button>
        )}
      </div>

      {showCreate && (
        <CreateForm token={localStorage.getItem('authToken') || ''} onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
      )}

      {loading && <div style={{ color: '#888', padding: 16 }}>Loading…</div>}
      {error && <div style={{ color: '#b91c1c', padding: 8 }}>{error}</div>}

      {!loading && !error && (
        tickets.length === 0 && !showCreate
          ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎫</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>No tickets yet</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Open a ticket and our support team will get back to you.</div>
              <button
                onClick={() => setShowCreate(true)}
                style={{ padding: '9px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Open First Ticket
              </button>
            </div>
          )
          : tickets.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Subject', 'Status', 'Created'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const isChatLog = t.meta?.source === 'chat_archive';
                  const createdAt = t.created_at || t.createdAt;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTicketId(String(t.id))}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{t.subject}</span>
                          {isChatLog && (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#6d28d9' }}>
                              Chat Log
                            </span>
                          )}
                          {t.escalated && (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#b91c1c' }}>
                              Escalated
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
                        <StatusPill status={t.status || 'open'} />
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontSize: 13 }}>
                        {createdAt ? (isNaN(Date.parse(createdAt)) ? createdAt : new Date(createdAt).toLocaleString()) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
      )}

      {selectedTicketId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setSelectedTicketId(null); load(); }}
        >
          <div
            style={{ background: '#1e1e2e', borderRadius: 12, maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', border: '1px solid #2d2d50' }}
            onClick={e => e.stopPropagation()}
          >
            <TicketDetails
              ticketId={selectedTicketId}
              currentUserId={String(user?.id || '')}
              currentUserRole={user?.role}
              onBack={() => { setSelectedTicketId(null); load(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioTickets;
