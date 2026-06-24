import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';

interface School {
  id: number;
  schoolName: string;
  albumCount: number;
  watchlistCount: number;
}

interface Player {
  id: number;
  playerName: string;
  playerNumber: string | null;
  rosterName: string | null;
  photoCount: number;
  watchlistCount: number;
}

type Tab = 'schools' | 'players';

const RosterManagement: React.FC = () => {
  const [tab, setTab] = useState<Tab>('schools');
  const [schools, setSchools] = useState<School[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'school' | 'player'; item: School | Player } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/roster/schools');
      setSchools(res.data || []);
    } catch { setSchools([]); }
    finally { setLoading(false); }
  }, []);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/roster/players');
      setPlayers(res.data || []);
    } catch { setPlayers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'schools') loadSchools();
    else loadPlayers();
    setSearch('');
  }, [tab, loadSchools, loadPlayers]);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const openEditSchool = (school: School) => {
    setEditingSchool(school);
    setEditName(school.schoolName);
    setSaveError('');
  };

  const openEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setEditName(player.playerName);
    setEditNumber(player.playerNumber || '');
    setSaveError('');
  };

  const cancelEdit = () => {
    setEditingSchool(null);
    setEditingPlayer(null);
    setSaveError('');
  };

  const saveSchool = async () => {
    if (!editName.trim() || !editingSchool) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.put(`/roster/schools/${editingSchool.id}`, { newName: editName.trim() });
      const { affected } = res.data;
      setEditingSchool(null);
      await loadSchools();
      flash(`Renamed "${editingSchool.schoolName}" → "${editName.trim()}" (${affected.albums} album${affected.albums !== 1 ? 's' : ''} updated)`);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const savePlayer = async () => {
    if (!editName.trim() || !editingPlayer) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.put(`/roster/players/${editingPlayer.id}`, {
        newName: editName.trim(),
        newNumber: editNumber.trim() || null,
      });
      const { affected } = res.data;
      setEditingPlayer(null);
      await loadPlayers();
      flash(`Updated "${editingPlayer.playerName}" (${affected.photos} photo${affected.photos !== 1 ? 's' : ''} updated)`);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const confirmAndDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === 'school') {
        const school = confirmDelete.item as School;
        await api.delete(`/roster/schools/${school.id}`);
        setConfirmDelete(null);
        await loadSchools();
        flash(`Deleted "${school.schoolName}" and removed from all albums and watchlists`);
      } else {
        const player = confirmDelete.item as Player;
        await api.delete(`/roster/players/${player.id}`);
        setConfirmDelete(null);
        await loadPlayers();
        flash(`Deleted "${player.playerName}" and removed from all photos and watchlists`);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const filteredSchools = schools.filter(s =>
    s.schoolName.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPlayers = players.filter(p =>
    p.playerName.toLowerCase().includes(search.toLowerCase()) ||
    (p.playerNumber && p.playerNumber.includes(search)) ||
    (p.rosterName && p.rosterName.toLowerCase().includes(search.toLowerCase()))
  );

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(124,92,255,0.25)',
    borderRadius: 8,
    color: '#e2e2f0',
    fontSize: '0.9rem',
    padding: '8px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: active ? '1px solid rgba(124,92,255,0.4)' : '1px solid transparent',
    background: active ? 'rgba(124,92,255,0.15)' : 'transparent',
    color: active ? '#a78bfa' : '#6b6b80',
    fontWeight: active ? 700 : 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <AdminLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
            Roster Management
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b6b80' }}>
            Rename or delete schools and players. All albums, photos, and customer watchlists update automatically.
          </p>
        </div>

        {/* Success banner */}
        {successMsg && (
          <div style={{ background: 'rgba(126,231,135,0.1)', border: '1px solid rgba(126,231,135,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#7ee787', fontSize: '0.88rem', fontWeight: 600 }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(tab === 'schools')} onClick={() => setTab('schools')}>
              🏫 Schools {schools.length > 0 && <span style={{ marginLeft: 6, background: 'rgba(124,92,255,0.2)', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem' }}>{schools.length}</span>}
            </button>
            <button style={tabStyle(tab === 'players')} onClick={() => setTab('players')}>
              🏃 Players {players.length > 0 && <span style={{ marginLeft: 6, background: 'rgba(124,92,255,0.2)', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem' }}>{players.length}</span>}
            </button>
          </div>
          <input
            style={{ ...inputStyle, width: 240 }}
            placeholder={`Search ${tab}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72', fontSize: '0.9rem' }}>Loading…</div>
        )}

        {/* ── SCHOOLS ── */}
        {!loading && tab === 'schools' && (
          <>
            {filteredSchools.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
                <div style={{ fontWeight: 600, color: '#8b8ba0' }}>
                  {search ? 'No schools match your search' : 'No schools yet'}
                </div>
                {!search && <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Schools are added automatically when you tag albums.</div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredSchools.map(school => (
                <div key={school.id}>
                  {editingSchool?.id === school.id ? (
                    <div style={{ background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 12, padding: '16px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>School Name</label>
                          <input
                            style={inputStyle}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveSchool()}
                            autoFocus
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={cancelEdit} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b6b80', fontSize: '0.85rem', fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
                          <button onClick={saveSchool} disabled={saving || !editName.trim()} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.85rem', fontWeight: 700, padding: '8px 16px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                      {saveError && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{saveError}</p>}
                      <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#5a5a72' }}>
                        This will update {school.albumCount} album{school.albumCount !== 1 ? 's' : ''} and {school.watchlistCount} customer watchlist{school.watchlistCount !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#e2e2f0', fontSize: '0.95rem' }}>{school.schoolName}</div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                          <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>📸 {school.albumCount} album{school.albumCount !== 1 ? 's' : ''}</span>
                          <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>👁 {school.watchlistCount} watching</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openEditSchool(school)} style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 7, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Rename</button>
                        <button onClick={() => setConfirmDelete({ type: 'school', item: school })} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PLAYERS ── */}
        {!loading && tab === 'players' && (
          <>
            {filteredPlayers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
                <div style={{ fontWeight: 600, color: '#8b8ba0' }}>
                  {search ? 'No players match your search' : 'No players yet'}
                </div>
                {!search && <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Players are added automatically when you upload tagged photos.</div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredPlayers.map(player => (
                <div key={player.id}>
                  {editingPlayer?.id === player.id ? (
                    <div style={{ background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 12, padding: '16px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Player Name</label>
                          <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</label>
                          <input style={inputStyle} value={editNumber} onChange={e => setEditNumber(e.target.value)} placeholder="optional" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={cancelEdit} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b6b80', fontSize: '0.85rem', fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
                          <button onClick={savePlayer} disabled={saving || !editName.trim()} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.85rem', fontWeight: 700, padding: '8px 16px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                      {saveError && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{saveError}</p>}
                      <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#5a5a72' }}>
                        This will update {player.photoCount} photo{player.photoCount !== 1 ? 's' : ''} and {player.watchlistCount} customer watchlist{player.watchlistCount !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, color: '#e2e2f0', fontSize: '0.95rem' }}>{player.playerName}</span>
                          {player.playerNumber && (
                            <span style={{ background: 'rgba(124,92,255,0.15)', color: '#a78bfa', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>#{player.playerNumber}</span>
                          )}
                          {player.rosterName && (
                            <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>{player.rosterName}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                          <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>📷 {player.photoCount} photo{player.photoCount !== 1 ? 's' : ''}</span>
                          <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>👁 {player.watchlistCount} watching</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openEditPlayer(player)} style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 7, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => setConfirmDelete({ type: 'player', item: player })} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#1a1a24', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, width: '100%', maxWidth: 460, padding: '28px 28px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
              Delete {confirmDelete.type === 'school' ? 'School' : 'Player'}?
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#8b8ba0', lineHeight: 1.6 }}>
              <strong style={{ color: '#e2e2f0' }}>
                "{confirmDelete.type === 'school' ? (confirmDelete.item as School).schoolName : (confirmDelete.item as Player).playerName}"
              </strong>{' '}
              will be permanently removed from the roster and:
            </p>
            <ul style={{ margin: '0 0 20px', padding: '0 0 0 20px', fontSize: '0.85rem', color: '#6b6b80', lineHeight: 1.8 }}>
              {confirmDelete.type === 'school' ? (
                <>
                  <li>Removed from all album school tags ({(confirmDelete.item as School).albumCount} album{(confirmDelete.item as School).albumCount !== 1 ? 's' : ''})</li>
                  <li>Removed from {(confirmDelete.item as School).watchlistCount} customer watchlist{(confirmDelete.item as School).watchlistCount !== 1 ? 's' : ''}</li>
                </>
              ) : (
                <>
                  <li>Removed from all photo player tags ({(confirmDelete.item as Player).photoCount} photo{(confirmDelete.item as Player).photoCount !== 1 ? 's' : ''})</li>
                  <li>Removed from {(confirmDelete.item as Player).watchlistCount} customer watchlist{(confirmDelete.item as Player).watchlistCount !== 1 ? 's' : ''}</li>
                  <li>Face recognition data deleted</li>
                </>
              )}
            </ul>
            <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#f87171', fontWeight: 600 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b6b80', fontWeight: 600, fontSize: '0.88rem', padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmAndDelete} disabled={deleting} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#f87171', fontWeight: 700, fontSize: '0.88rem', padding: '8px 20px', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default RosterManagement;
