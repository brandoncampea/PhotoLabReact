import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TicketDetails } from '../../tickets/TicketDetails';

type TicketRow = {
  id: number;
  subject: string;
  status: string;
  escalated: boolean;
  created_at?: string;
  createdAt?: string;
  studio_name?: string;
  studioName?: string;
  created_by_name?: string;
  createdByName?: string;
  created_by_email?: string;
  createdByEmail?: string;
  meta?: { source?: string } | null;
};

const STATUS_PILLS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#14532d', color: '#4ade80' },
  pending: { bg: '#713f12', color: '#fbbf24' },
  closed: { bg: '#1f2937', color: '#9ca3af' },
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_PILLS[status] || { bg: '#1f2937', color: '#9ca3af' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

type FilterTab = 'all' | 'open' | 'pending' | 'closed' | 'escalated';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
  { key: 'escalated', label: 'Escalated' },
];

const AdminTickets: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    fetch('/api/tickets/all', {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => { setTickets(data.tickets || []); setLoading(false); })
      .catch(() => { setError('Failed to load tickets'); setLoading(false); });
  };

  useEffect(load, [user]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (tab === 'escalated') list = list.filter(t => t.escalated);
    else if (tab !== 'all') list = list.filter(t => t.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.subject || '').toLowerCase().includes(q) ||
        (t.studio_name || t.studioName || '').toLowerCase().includes(q) ||
        (t.created_by_name || t.createdByName || '').toLowerCase().includes(q) ||
        (t.created_by_email || t.createdByEmail || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [tickets, tab, search]);

  const counts = useMemo(() => ({
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    pending: tickets.filter(t => t.status === 'pending').length,
    closed: tickets.filter(t => t.status === 'closed').length,
    escalated: tickets.filter(t => t.escalated).length,
  }), [tickets]);

  return (
    <div style={{ maxWidth: 980, margin: '32px auto', padding: '0 16px', color: '#e2e2f0' }}>
      <h2 style={{ marginBottom: 20, color: '#e2e2f0' }}>All Support Tickets</h2>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #2d2d50' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? '#a78bfa' : '#6b6b90',
              borderBottom: tab === t.key ? '2px solid #a78bfa' : '2px solid transparent',
              marginBottom: -1, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span style={{
                background: tab === t.key ? '#4f46e5' : '#252545',
                color: tab === t.key ? '#fff' : '#7070a0',
                borderRadius: 99, fontSize: 11, fontWeight: 600, padding: '0 6px', lineHeight: '18px',
              }}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by subject, studio, or user…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 400, padding: '7px 12px', borderRadius: 7,
            border: '1px solid #3a3a60', fontSize: 14, outline: 'none',
            background: '#16162a', color: '#e2e2f0',
          }}
        />
      </div>

      {loading && <div style={{ color: '#6b6b90', padding: 16 }}>Loading…</div>}
      {error && <div style={{ color: '#f87171', padding: 8 }}>{error}</div>}

      {!loading && !error && (
        filtered.length === 0
          ? <div style={{ color: '#555570', padding: '24px 0', textAlign: 'center' }}>No tickets found.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#16162a' }}>
                  {['Subject', 'Studio', 'Created By', 'Status', 'Created'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #2d2d50', fontWeight: 600, color: '#8888aa', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const isChatLog = t.meta?.source === 'chat_archive';
                  const studioName = t.studio_name || t.studioName || '-';
                  const createdBy = t.created_by_name || t.createdByName || t.created_by_email || t.createdByEmail || '-';
                  const createdAt = t.created_at || t.createdAt || '-';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTicketId(String(t.id))}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #1e1e35' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#1e1e35')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, color: '#d4d4f0' }}>{t.subject}</span>
                          {isChatLog && (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#2e1065', color: '#c4b5fd' }}>
                              Chat Log
                            </span>
                          )}
                          {t.escalated && (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#7f1d1d', color: '#fca5a5' }}>
                              Escalated
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#7070a0' }}>{studioName}</td>
                      <td style={{ padding: '10px 12px', color: '#7070a0' }}>{createdBy}</td>
                      <td style={{ padding: '10px 12px' }}><StatusPill status={t.status || 'open'} /></td>
                      <td style={{ padding: '10px 12px', color: '#555570', whiteSpace: 'nowrap', fontSize: 13 }}>{createdAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
      )}

      {selectedTicketId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
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

export default AdminTickets;
