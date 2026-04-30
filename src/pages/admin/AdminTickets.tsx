import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TicketDetails } from '../../tickets/TicketDetails';

const AdminTickets: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/tickets/all', {
      headers: {
        Authorization: user?.token ? `Bearer ${user.token}` : '',
      },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setTickets(data.tickets || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load tickets');
        setLoading(false);
      });
  }, [user]);

  return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: 16, position: 'relative' }}>
      <h2>All Support Tickets</h2>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Subject</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Created By</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Studio</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Status</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedTicketId(t.id || t._id)}>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.subject}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.createdByEmail || t.createdBy || '-'}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.studioName || t.createdForStudio || '-'}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.status || 'Open'}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedTicketId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.32)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
          onClick={() => setSelectedTicketId(null)}
        >
          <div style={{ background: '#fff', borderRadius: 10, minWidth: 400, maxWidth: 600, padding: 24, boxShadow: '0 4px 32px rgba(0,0,0,0.18)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button style={{ position: 'absolute', top: 12, right: 12, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSelectedTicketId(null)}>&times;</button>
            <TicketDetails ticketId={selectedTicketId} currentUserId={user?.id || ''} onBack={() => setSelectedTicketId(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTickets;
