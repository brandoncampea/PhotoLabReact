import React, { useState, useEffect } from 'react';
import { UserAccount } from '../../types';
import { userAdminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';

type RoleFilter = 'all' | 'customer' | 'admin' | 'super_admin' | 'studio_admin';
type SortCol = 'name' | 'email' | 'studio' | 'role' | 'registered' | 'lastLogin' | 'orders' | 'spent';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'customer', label: 'Customers' },
  { key: 'studio_admin', label: 'Studio Admins' },
  { key: 'super_admin', label: 'Super Admins' },
  { key: 'admin', label: 'Admins' },
];

const roleColors: Record<string, string> = {
  customer: '#60a5fa',
  admin: '#f59e0b',
  studio_admin: '#a78bfa',
  super_admin: '#f472b6',
};

const roleBg: Record<string, string> = {
  customer: 'rgba(96,165,250,0.12)',
  admin: 'rgba(245,158,11,0.12)',
  studio_admin: 'rgba(167,139,250,0.12)',
  super_admin: 'rgba(244,114,182,0.12)',
};

const roleLabel: Record<string, string> = {
  customer: 'Customer',
  admin: 'Admin',
  studio_admin: 'Studio Admin',
  super_admin: 'Super Admin',
};

const roleOrder: Record<string, number> = {
  super_admin: 0,
  admin: 1,
  studio_admin: 2,
  customer: 3,
};

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const selectStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: '#1e1c30',
  border: '1px solid rgba(102,102,204,0.35)',
  borderRadius: 7,
  color: '#e4e4e7',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none',
};

const AdminUsers: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('registered');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    loadUsers();
    const interval = setInterval(() => loadUsers(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // Reset to page 1 when filter/search/sort changes
  useEffect(() => { setPage(1); }, [filter, search, sortCol, sortDir]);

  const loadUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setUsers(await userAdminService.getAll());
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleActive = async (id: number) => {
    const u = users.find(u => u.id === id);
    if (!u) return;
    try {
      await userAdminService.toggleActive(id, u.isActive);
      loadUsers();
    } catch (error) {
      console.error('Failed to toggle user active status:', error);
    }
  };

  const handleChangeRole = async (id: number, newRole: 'customer' | 'admin' | 'super_admin' | 'studio_admin') => {
    if (!confirm(`Change role to ${roleLabel[newRole]}?`)) return;
    try {
      await userAdminService.changeRole(id, newRole);
      loadUsers();
    } catch (error: any) {
      console.error('Failed to change user role:', error);
      if (error?.response?.status === 403) {
        alert('Only super admins can assign this role.');
      }
    }
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const filtered = users.filter(u => {
    const matchRole = filter === 'all' || u.role === filter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.studioName || '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'name':
        cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        break;
      case 'email':
        cmp = a.email.localeCompare(b.email);
        break;
      case 'studio':
        cmp = (a.studioName || '').localeCompare(b.studioName || '');
        break;
      case 'role':
        cmp = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        break;
      case 'registered':
        cmp = (a.registeredDate || '').localeCompare(b.registeredDate || '');
        break;
      case 'lastLogin':
        cmp = (a.lastLoginDate || '').localeCompare(b.lastLoginDate || '');
        break;
      case 'orders':
        cmp = (a.totalOrders ?? 0) - (b.totalOrders ?? 0);
        break;
      case 'spent':
        cmp = (a.totalSpent ?? 0) - (b.totalSpent ?? 0);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const count = (role: RoleFilter) =>
    role === 'all' ? users.length : users.filter(u => u.role === role).length;

  const SortIndicator = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const colHeader = (label: string, col: SortCol) => (
    <button
      onClick={() => handleSort(col)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: sortCol === col ? '#c4b5fd' : '#a78bfa',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <SortIndicator col={col} />
    </button>
  );

  const gridCols = isSuperAdmin
    ? '1.8fr 1.8fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.9fr 0.7fr 0.6fr'
    : '1.8fr 1.8fr 1.2fr 1fr 1fr 0.8fr 0.9fr 0.7fr 0.6fr';

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

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
            <div>
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
                User Accounts
              </h1>
              {isSuperAdmin && (
                <p style={{ color: '#a1a1aa', margin: '6px 0 0', fontSize: 14 }}>
                  All users across all studios
                </p>
              )}
            </div>
            <button
              onClick={() => loadUsers()}
              disabled={refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 18px',
                background: 'rgba(102,102,204,0.15)',
                border: '1px solid rgba(102,102,204,0.35)',
                borderRadius: 8,
                color: '#cfd5ff',
                fontWeight: 700,
                fontSize: 14,
                cursor: refreshing ? 'not-allowed' : 'pointer',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <span style={{ display: 'inline-block', transition: 'transform 0.5s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>⟳</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Filters + search */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROLE_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 20,
                    border: filter === f.key ? '1px solid #7c5cff' : '1px solid rgba(102,102,204,0.25)',
                    background: filter === f.key ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.03)',
                    color: filter === f.key ? '#c4b5fd' : '#a1a1aa',
                    fontWeight: filter === f.key ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {f.label} <span style={{ opacity: 0.7 }}>({count(f.key)})</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, or studio..."
              style={{
                marginLeft: 'auto',
                padding: '8px 14px',
                background: '#1e1c30',
                border: '1px solid rgba(102,102,204,0.3)',
                borderRadius: 8,
                color: '#e4e4e7',
                fontSize: 13,
                outline: 'none',
                minWidth: 220,
              }}
            />
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 60 }}>Loading users...</div>
          ) : (
            <div style={{ background: 'rgba(20,20,35,0.8)', border: '1px solid rgba(102,102,204,0.3)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Table header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridCols,
                  padding: '10px 20px',
                  borderBottom: '1px solid rgba(102,102,204,0.2)',
                }}
              >
                {colHeader('Name', 'name')}
                {colHeader('Email', 'email')}
                {isSuperAdmin && colHeader('Studio', 'studio')}
                {colHeader('Role', 'role')}
                <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Watched Players</div>
                {colHeader('Registered', 'registered')}
                {colHeader('Last Login', 'lastLogin')}
                {colHeader('Orders', 'orders')}
                {colHeader('Spent', 'spent')}
                <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Actions</div>
              </div>

              {sorted.length === 0 ? (
                <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 48 }}>
                  {search || filter !== 'all' ? 'No users match your filters.' : 'No users found.'}
                </div>
              ) : (
                paginated.map((u, i) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      padding: '13px 20px',
                      borderBottom: i < paginated.length - 1 ? '1px solid rgba(102,102,204,0.1)' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    {/* Name */}
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                      {u.firstName} {u.lastName}
                    </div>

                    {/* Email */}
                    <div style={{ color: '#a1a1aa', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.email}
                    </div>

                    {/* Studio */}
                    {isSuperAdmin && (
                      <div style={{ color: u.studioName ? '#e4e4e7' : '#3f3f5a', fontSize: 13, fontStyle: u.studioName ? 'normal' : 'italic' }}>
                        {u.studioName || 'None'}
                      </div>
                    )}

                    {/* Role */}
                    <div>
                      <select
                        value={u.role}
                        onChange={e => handleChangeRole(u.id, e.target.value as any)}
                        style={{
                          ...selectStyle,
                          color: roleColors[u.role] || '#e4e4e7',
                          borderColor: `${roleColors[u.role]}44` || 'rgba(102,102,204,0.35)',
                          background: roleBg[u.role] || '#1e1c30',
                        }}
                      >
                        <option value="customer">👤 Customer</option>
                        <option value="admin">👨‍💼 Admin</option>
                        <option value="studio_admin">🏢 Studio Admin</option>
                        <option value="super_admin">👑 Super Admin</option>
                      </select>
                    </div>

                    {/* Watched players */}
                    <div style={{ color: '#71717a', fontSize: 12 }}>
                      {u.watchedPlayers && u.watchedPlayers.length > 0
                        ? <span style={{ color: '#a1a1aa' }}>{u.watchedPlayers.join(', ')}</span>
                        : <span style={{ color: '#3f3f5a', fontStyle: 'italic' }}>None</span>}
                    </div>

                    {/* Registered */}
                    <div style={{ color: '#a1a1aa', fontSize: 13 }}>{formatDate(u.registeredDate)}</div>

                    {/* Last login */}
                    <div style={{ color: '#a1a1aa', fontSize: 13 }}>{formatDate(u.lastLoginDate)}</div>

                    {/* Orders */}
                    <div style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600 }}>{u.totalOrders}</div>

                    {/* Spent */}
                    <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>
                      ${u.totalSpent.toFixed(2)}
                    </div>

                    {/* Actions */}
                    <div>
                      <button
                        onClick={() => handleToggleActive(u.id)}
                        title={u.isActive ? 'Deactivate user' : 'Activate user'}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          border: u.isActive
                            ? '1px solid rgba(239,68,68,0.3)'
                            : '1px solid rgba(74,222,128,0.3)',
                          background: u.isActive
                            ? 'rgba(239,68,68,0.1)'
                            : 'rgba(74,222,128,0.1)',
                          color: u.isActive ? '#fca5a5' : '#86efac',
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        {u.isActive ? '🔒' : '🔓'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Pagination + count */}
          {!loading && sorted.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <div style={{ color: '#3f3f5a', fontSize: 12 }}>
                {sorted.length} of {users.length} users
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      padding: '5px 12px',
                      background: 'rgba(102,102,204,0.1)',
                      border: '1px solid rgba(102,102,204,0.25)',
                      borderRadius: 6,
                      color: page === 1 ? '#3f3f5a' : '#c4b5fd',
                      cursor: page === 1 ? 'default' : 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ color: '#a1a1aa', fontSize: 13 }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{
                      padding: '5px 12px',
                      background: 'rgba(102,102,204,0.1)',
                      border: '1px solid rgba(102,102,204,0.25)',
                      borderRadius: 6,
                      color: page === totalPages ? '#3f3f5a' : '#c4b5fd',
                      cursor: page === totalPages ? 'default' : 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
          {!loading && sorted.length === 0 && (
            <div style={{ color: '#3f3f5a', fontSize: 12, marginTop: 10, textAlign: 'right' }}>
              0 of {users.length} users
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
