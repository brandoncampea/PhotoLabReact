import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';

const card: React.CSSProperties = {
  background: '#23232a',
  border: '1px solid #3a3656',
  borderRadius: 18,
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  padding: '1.75rem 2rem',
  marginBottom: '1.5rem',
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 0.2rem 0',
  fontSize: '1.5rem',
  fontWeight: 800,
  background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const subTitle: React.CSSProperties = {
  ...sectionTitle,
  fontSize: '1.1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontWeight: 600,
  color: '#bdbdbd',
  fontSize: '0.9rem',
};

const divider: React.CSSProperties = {
  borderTop: '1px solid #3a3656',
  margin: '1.25rem 0',
};

type Admin = {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  receiveOrderNotifications: boolean;
};

type Invite = {
  id: number;
  email: string;
  name: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedByName: string | null;
};

const AdminTeam: React.FC = () => {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const studioId = user?.studioId;
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    if (studioId) loadAll();
  }, [studioId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [adminsRes, invitesRes] = await Promise.all([
        fetch(`/api/studios/${studioId}/admins`, { headers }),
        fetch(`/api/studios/${studioId}/admin-invites`, { headers }),
      ]);
      if (adminsRes.ok) setAdmins(await adminsRes.json());
      if (invitesRes.ok) setInvites(await invitesRes.json());
    } catch (e) {
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/studios/${studioId}/admin-invites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send invite'); return; }
      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      setShowInviteForm(false);
      await loadAll();
    } catch (e) {
      setError('Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleRemoveAdmin = async (adminId: number, adminEmail: string) => {
    if (!confirm(`Remove ${adminEmail} as an admin?`)) return;
    try {
      const res = await fetch(`/api/studios/${studioId}/admins/${adminId}`, { method: 'DELETE', headers });
      if (res.ok) {
        setAdmins(prev => prev.filter(a => a.id !== adminId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to remove admin');
      }
    } catch (e) {
      alert('Failed to remove admin');
    }
  };

  const handleToggleNotifications = async (adminId: number, current: boolean) => {
    const next = !current;
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, receiveOrderNotifications: next } : a));
    try {
      const res = await fetch(`/api/studios/${studioId}/admins/${adminId}/notifications`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ receiveOrderNotifications: next }),
      });
      if (!res.ok) {
        setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, receiveOrderNotifications: current } : a));
        setError('Failed to update notification preference');
      }
    } catch {
      setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, receiveOrderNotifications: current } : a));
      setError('Failed to update notification preference');
    }
  };

  const handleCancelInvite = async (inviteId: number) => {
    try {
      const res = await fetch(`/api/studios/${studioId}/admin-invites/${inviteId}`, { method: 'DELETE', headers });
      if (res.ok) {
        setInvites(prev => prev.filter(i => i.id !== inviteId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to cancel invite');
      }
    } catch (e) {
      alert('Failed to cancel invite');
    }
  };

  const pendingInvites = invites.filter(i => !i.acceptedAt && new Date(i.expiresAt) > new Date());

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
          Loading team...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ minHeight: '100vh', background: '#181a1b', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          <div style={{ marginBottom: '2rem' }}>
            <h1 style={sectionTitle}>Team Management</h1>
            <p style={{ color: '#a1a1aa', fontSize: '0.92rem', margin: '0.2rem 0 0 0' }}>
              Manage who has admin access to your studio
            </p>
          </div>

          {error && (
            <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.95rem' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: '#1a2d1e', color: '#a3ffb3', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.95rem' }}>
              {success}
            </div>
          )}

          {/* Current admins */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h2 style={subTitle}>Admins</h2>
                <p style={{ color: '#6b6b80', fontSize: '0.85rem', margin: '2px 0 0 0' }}>
                  {admins.length} admin{admins.length !== 1 ? 's' : ''} currently active
                </p>
              </div>
              <button
                onClick={() => { setShowInviteForm(v => !v); setError(''); setSuccess(''); }}
                style={{
                  padding: '9px 18px',
                  background: '#7c5cff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(124,92,255,0.25)',
                  flexShrink: 0,
                }}
              >
                + Invite Admin
              </button>
            </div>

            {showInviteForm && (
              <>
                <div style={divider} />
                <form onSubmit={handleInvite} style={{ marginBottom: '1rem' }}>
                  <p style={{ ...labelStyle, fontSize: '0.92rem', color: '#a78bfa', marginBottom: 12 }}>
                    Send an Invite
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Email <span style={{ color: '#ff6b6b' }}>*</span></label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        required
                        disabled={sending}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Name <span style={{ color: '#6b6b80', fontWeight: 400 }}>(optional)</span></label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={e => setInviteName(e.target.value)}
                        placeholder="Full name"
                        disabled={sending}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="submit"
                      disabled={sending}
                      style={{
                        padding: '9px 20px',
                        background: sending ? '#5a3cff66' : '#7c5cff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 9,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: sending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {sending ? 'Sending...' : 'Send Invite'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteForm(false)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.9rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                <div style={divider} />
              </>
            )}

            {admins.length === 0 ? (
              <p style={{ color: '#6b6b80', fontSize: '0.9rem' }}>No admins found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {admins.map(admin => (
                  <div
                    key={admin.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#29293a',
                      borderRadius: 10,
                      border: '1px solid #3a3656',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {admin.name || admin.email}
                        {admin.id === user?.id && (
                          <span style={{ marginLeft: 8, fontSize: '0.72rem', background: 'rgba(124,92,255,0.18)', color: '#a78bfa', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>
                            You
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#6b6b80', fontSize: '0.82rem', marginTop: 2 }}>{admin.email}</div>
                      <div style={{ color: '#6b6b80', fontSize: '0.75rem', marginTop: 2 }}>
                        Joined {new Date(admin.createdAt).toLocaleDateString()}
                        {admin.lastLoginAt && ` · Last login ${new Date(admin.lastLoginAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleNotifications(admin.id, admin.receiveOrderNotifications)}
                        title={admin.receiveOrderNotifications ? 'Receiving order emails — click to turn off' : 'Not receiving order emails — click to turn on'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 11px',
                          background: admin.receiveOrderNotifications ? 'rgba(124,92,255,0.15)' : 'rgba(100,100,120,0.12)',
                          color: admin.receiveOrderNotifications ? '#a78bfa' : '#6b6b80',
                          border: `1px solid ${admin.receiveOrderNotifications ? 'rgba(124,92,255,0.35)' : '#3a3656'}`,
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{admin.receiveOrderNotifications ? '✉' : '✉'}</span>
                        {admin.receiveOrderNotifications ? 'Emails on' : 'Emails off'}
                      </button>
                      {admin.id !== user?.id && (
                        <button
                          onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                          style={{
                            padding: '6px 14px',
                            background: 'rgba(255,107,107,0.12)',
                            color: '#ff6b6b',
                            border: '1px solid rgba(255,107,107,0.3)',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div style={card}>
              <h2 style={{ ...subTitle, marginBottom: '0.2rem' }}>Pending Invites</h2>
              <p style={{ color: '#6b6b80', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                {pendingInvites.length} invite{pendingInvites.length !== 1 ? 's' : ''} awaiting acceptance
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingInvites.map(invite => (
                  <div
                    key={invite.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#1e1c30',
                      borderRadius: 10,
                      border: '1px solid #3a3656',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#e0e0e0', fontSize: '0.92rem' }}>
                        {invite.name ? `${invite.name} (${invite.email})` : invite.email}
                      </div>
                      <div style={{ color: '#6b6b80', fontSize: '0.75rem', marginTop: 2 }}>
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                        {invite.invitedByName && ` by ${invite.invitedByName}`}
                        {' · '}
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(255,107,107,0.08)',
                        color: '#ff6b6b',
                        border: '1px solid rgba(255,107,107,0.25)',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTeam;
