import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const StudioTickets: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/tickets/mine', {
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
    <div style={{ maxWidth: 900, margin: '32px auto', padding: 16 }}>
      <h2>My Support Tickets</h2>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Subject</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Status</th>
              <th style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: 8 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.subject}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.status || 'Open'}</td>
                <td style={{ borderBottom: '1px solid #f5f5f5', padding: 8 }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StudioTickets;
