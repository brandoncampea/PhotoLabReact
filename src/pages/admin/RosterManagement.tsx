import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
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

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface PlayerPhoto {
  id: number;
  fileName: string;
  thumbnailUrl: string | null;
  fullImageUrl: string | null;
  playerNames: string | null;
  playerNumbers: string | null;
  albumId: number;
  albumName: string;
}

interface PlayerPhotoPage {
  playerName: string;
  items: PlayerPhoto[];
  total: number;
  page: number;
  pageSize: number;
}

type Tab = 'schools' | 'players';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const RosterManagement: React.FC = () => {
  const [tab, setTab] = useState<Tab>('schools');

  // Schools state
  const [schoolPage, setSchoolPage] = useState<Page<School>>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [schoolPageNum, setSchoolPageNum] = useState(1);
  const [schoolPageSize, setSchoolPageSize] = useState(50);
  const [schoolSearch, setSchoolSearch] = useState('');
  const debouncedSchoolSearch = useDebounce(schoolSearch, 300);

  // Players state
  const [playerPage, setPlayerPage] = useState<Page<Player>>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [playerPageNum, setPlayerPageNum] = useState(1);
  const [playerPageSize, setPlayerPageSize] = useState(50);
  const [playerSearch, setPlayerSearch] = useState('');
  const debouncedPlayerSearch = useDebounce(playerSearch, 300);

  const [loading, setLoading] = useState(false);

  // Player photo panel
  const [photoPanel, setPhotoPanel] = useState<{ playerId: number; data: PlayerPhotoPage | null; loading: boolean; page: number } | null>(null);

  const loadPlayerPhotos = useCallback(async (playerId: number, page = 1) => {
    setPhotoPanel(prev => prev?.playerId === playerId
      ? { ...prev, loading: true, page }
      : { playerId, data: null, loading: true, page }
    );
    try {
      const res = await api.get(`/roster/players/${playerId}/photos?page=${page}&pageSize=48`);
      setPhotoPanel({ playerId, data: res.data, loading: false, page });
    } catch {
      setPhotoPanel(prev => prev ? { ...prev, loading: false } : null);
    }
  }, []);

  const togglePhotoPanel = (player: Player) => {
    if (photoPanel?.playerId === player.id) {
      setPhotoPanel(null);
    } else {
      loadPlayerPhotos(player.id, 1);
    }
  };

  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'school' | 'player'; item: School | Player } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const loadSchools = useCallback(async (page: number, pageSize: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const res = await api.get(`/roster/schools?${params}`);
      setSchoolPage(res.data);
    } catch {
      setSchoolPage({ items: [], total: 0, page: 1, pageSize });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlayers = useCallback(async (page: number, pageSize: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const res = await api.get(`/roster/players?${params}`);
      setPlayerPage(res.data);
    } catch {
      setPlayerPage({ items: [], total: 0, page: 1, pageSize });
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset to page 1 when search changes
  const prevSchoolSearch = useRef(debouncedSchoolSearch);
  const prevPlayerSearch = useRef(debouncedPlayerSearch);

  useEffect(() => {
    if (debouncedSchoolSearch !== prevSchoolSearch.current) {
      prevSchoolSearch.current = debouncedSchoolSearch;
      setSchoolPageNum(1);
    }
  }, [debouncedSchoolSearch]);

  useEffect(() => {
    if (debouncedPlayerSearch !== prevPlayerSearch.current) {
      prevPlayerSearch.current = debouncedPlayerSearch;
      setPlayerPageNum(1);
    }
  }, [debouncedPlayerSearch]);

  useEffect(() => {
    if (tab === 'schools') loadSchools(schoolPageNum, schoolPageSize, debouncedSchoolSearch);
  }, [tab, schoolPageNum, schoolPageSize, debouncedSchoolSearch, loadSchools]);

  useEffect(() => {
    if (tab === 'players') loadPlayers(playerPageNum, playerPageSize, debouncedPlayerSearch);
  }, [tab, playerPageNum, playerPageSize, debouncedPlayerSearch, loadPlayers]);

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

  const cancelEdit = () => { setEditingSchool(null); setEditingPlayer(null); setSaveError(''); };

  const saveSchool = async () => {
    if (!editName.trim() || !editingSchool) return;
    setSaving(true); setSaveError('');
    try {
      const res = await api.put(`/roster/schools/${editingSchool.id}`, { newName: editName.trim() });
      const { affected } = res.data;
      setEditingSchool(null);
      await loadSchools(schoolPageNum, schoolPageSize, debouncedSchoolSearch);
      flash(`Renamed "${editingSchool.schoolName}" → "${editName.trim()}" (${affected.albums} album${affected.albums !== 1 ? 's' : ''} updated)`);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const savePlayer = async () => {
    if (!editName.trim() || !editingPlayer) return;
    setSaving(true); setSaveError('');
    try {
      const res = await api.put(`/roster/players/${editingPlayer.id}`, {
        newName: editName.trim(),
        newNumber: editNumber.trim() || null,
      });
      const { affected } = res.data;
      setEditingPlayer(null);
      await loadPlayers(playerPageNum, playerPageSize, debouncedPlayerSearch);
      flash(`Updated "${editingPlayer.playerName}" (${affected.photos} photo${affected.photos !== 1 ? 's' : ''} updated)`);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const confirmAndDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === 'school') {
        const school = confirmDelete.item as School;
        await api.delete(`/roster/schools/${school.id}`);
        setConfirmDelete(null);
        await loadSchools(schoolPageNum, schoolPageSize, debouncedSchoolSearch);
        flash(`Deleted "${school.schoolName}" and removed from all albums and watchlists`);
      } else {
        const player = confirmDelete.item as Player;
        await api.delete(`/roster/players/${player.id}`);
        setConfirmDelete(null);
        await loadPlayers(playerPageNum, playerPageSize, debouncedPlayerSearch);
        flash(`Deleted "${player.playerName}" and removed from all photos and watchlists`);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete');
    } finally { setDeleting(false); }
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(124,92,255,0.25)',
    borderRadius: 8, color: '#e2e2f0', fontSize: '0.9rem',
    padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8,
    border: active ? '1px solid rgba(124,92,255,0.4)' : '1px solid transparent',
    background: active ? 'rgba(124,92,255,0.15)' : 'transparent',
    color: active ? '#a78bfa' : '#6b6b80',
    fontWeight: active ? 700 : 500, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s',
  });

  const currentSearch = tab === 'schools' ? schoolSearch : playerSearch;
  const setCurrentSearch = tab === 'schools' ? setSchoolSearch : setPlayerSearch;
  const currentPage = tab === 'schools' ? schoolPage : playerPage;
  const currentPageNum = tab === 'schools' ? schoolPageNum : playerPageNum;
  const setCurrentPageNum = tab === 'schools' ? setSchoolPageNum : setPlayerPageNum;
  const currentPageSize = tab === 'schools' ? schoolPageSize : playerPageSize;
  const setCurrentPageSize = tab === 'schools'
    ? (n: number) => { setSchoolPageSize(n); setSchoolPageNum(1); }
    : (n: number) => { setPlayerPageSize(n); setPlayerPageNum(1); };

  const totalPages = Math.max(1, Math.ceil(currentPage.total / currentPageSize));

  return (
    <AdminLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>Roster Management</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b6b80' }}>
            Rename or delete schools and players. All albums, photos, and customer watchlists update automatically.
          </p>
        </div>

        {successMsg && (
          <div style={{ background: 'rgba(126,231,135,0.1)', border: '1px solid rgba(126,231,135,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#7ee787', fontSize: '0.88rem', fontWeight: 600 }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={tabStyle(tab === 'schools')} onClick={() => { setTab('schools'); setPhotoPanel(null); }}>
            🏫 Schools
            {schoolPage.total > 0 && <span style={{ marginLeft: 6, background: 'rgba(124,92,255,0.2)', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem' }}>{schoolPage.total}</span>}
          </button>
          <button style={tabStyle(tab === 'players')} onClick={() => { setTab('players'); }}>
            🏃 Players
            {playerPage.total > 0 && <span style={{ marginLeft: 6, background: 'rgba(124,92,255,0.2)', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem' }}>{playerPage.total}</span>}
          </button>
        </div>

        {/* Search + page size */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a4a6a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
            <input
              style={{ ...inputStyle, paddingLeft: 34 }}
              placeholder={tab === 'schools' ? 'Search schools…' : 'Search by name, number, or team…'}
              value={currentSearch}
              onChange={e => setCurrentSearch(e.target.value)}
            />
          </div>
          <select
            value={currentPageSize}
            onChange={e => setCurrentPageSize(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(124,92,255,0.25)', borderRadius: 8, color: '#c4c4de', fontSize: '0.85rem', padding: '8px 10px', cursor: 'pointer', outline: 'none' }}
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n} style={{ background: '#1a1a24' }}>{n} per page</option>
            ))}
          </select>
        </div>

        {/* Result count */}
        {!loading && currentPage.total > 0 && (
          <div style={{ fontSize: '0.78rem', color: '#4a4a6a', marginBottom: 10 }}>
            Showing {((currentPageNum - 1) * currentPageSize) + 1}–{Math.min(currentPageNum * currentPageSize, currentPage.total)} of {currentPage.total}
            {currentSearch ? ` matching "${currentSearch}"` : ''}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72', fontSize: '0.9rem' }}>Loading…</div>
        )}

        {/* ── SCHOOLS ── */}
        {!loading && tab === 'schools' && (
          <>
            {currentPage.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
                <div style={{ fontWeight: 600, color: '#8b8ba0' }}>
                  {currentSearch ? 'No schools match your search' : 'No schools yet'}
                </div>
                {!currentSearch && <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Schools are added automatically when you tag albums.</div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(currentPage.items as School[]).map(school => (
                <div key={school.id}>
                  {editingSchool?.id === school.id ? (
                    <div style={{ background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 12, padding: '16px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>School Name</label>
                          <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSchool()} autoFocus />
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
                        Updates {school.albumCount} album{school.albumCount !== 1 ? 's' : ''} and {school.watchlistCount} customer watchlist{school.watchlistCount !== 1 ? 's' : ''}.
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
            {currentPage.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
                <div style={{ fontWeight: 600, color: '#8b8ba0' }}>
                  {currentSearch ? 'No players match your search' : 'No players yet'}
                </div>
                {!currentSearch && <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Players are added automatically when you upload tagged photos.</div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(currentPage.items as Player[]).map(player => (
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
                        Updates {player.photoCount} photo{player.photoCount !== 1 ? 's' : ''} and {player.watchlistCount} customer watchlist{player.watchlistCount !== 1 ? 's' : ''}.
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
                        <button
                          onClick={() => togglePhotoPanel(player)}
                          style={{ background: photoPanel?.playerId === player.id ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)', border: `1px solid ${photoPanel?.playerId === player.id ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.2)'}`, borderRadius: 7, color: photoPanel?.playerId === player.id ? '#818cf8' : '#6366f1', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}
                        >
                          {photoPanel?.playerId === player.id ? 'Hide Photos' : `Photos (${player.photoCount})`}
                        </button>
                        <button onClick={() => openEditPlayer(player)} style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 7, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => setConfirmDelete({ type: 'player', item: player })} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  )}

                  {/* Photo panel */}
                  {photoPanel?.playerId === player.id && (
                    <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '16px' }}>
                      {photoPanel.loading && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#5a5a72', fontSize: '0.85rem' }}>Loading photos…</div>
                      )}
                      {!photoPanel.loading && photoPanel.data && (
                        <>
                          <div style={{ fontSize: '0.75rem', color: '#5a5a72', marginBottom: 12 }}>
                            {photoPanel.data.total} photo{photoPanel.data.total !== 1 ? 's' : ''} tagged with <strong style={{ color: '#a78bfa' }}>{photoPanel.data.playerName}</strong>
                          </div>
                          {photoPanel.data.items.length === 0 && (
                            <div style={{ color: '#4a4a6a', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>No photos found.</div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                            {photoPanel.data.items.map(photo => (
                              <a
                                key={photo.id}
                                href={`/api/photos/${photo.id}/asset`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${photo.albumName} — ${photo.fileName}`}
                                style={{ display: 'block', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', position: 'relative', background: 'rgba(0,0,0,0.3)', textDecoration: 'none' }}
                              >
                                <img
                                  src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                                  alt={photo.fileName}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '3px 5px' }}>
                                  <div style={{ fontSize: '0.6rem', color: '#c4c4de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{photo.albumName}</div>
                                </div>
                              </a>
                            ))}
                          </div>
                          {/* Photo panel pagination */}
                          {photoPanel.data.total > photoPanel.data.pageSize && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                              <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>
                                Page {photoPanel.page} of {Math.ceil(photoPanel.data.total / photoPanel.data.pageSize)}
                              </span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  disabled={photoPanel.page <= 1}
                                  onClick={() => loadPlayerPhotos(player.id, photoPanel.page - 1)}
                                  style={pagerBtn(photoPanel.page <= 1)}
                                >‹ Prev</button>
                                <button
                                  disabled={photoPanel.page >= Math.ceil(photoPanel.data.total / photoPanel.data.pageSize)}
                                  onClick={() => loadPlayerPhotos(player.id, photoPanel.page + 1)}
                                  style={pagerBtn(photoPanel.page >= Math.ceil(photoPanel.data.total / photoPanel.data.pageSize))}
                                >Next ›</button>
                              </div>
                            </div>
                          )}
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <Link
                              to={`/admin/albums?highlight=${photoPanel.data.items[0]?.albumId}`}
                              style={{ fontSize: '0.78rem', color: '#6366f1', textDecoration: 'none' }}
                            >
                              View in Albums →
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {!loading && currentPage.total > currentPageSize && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}>
            <button
              onClick={() => setCurrentPageNum(1)}
              disabled={currentPageNum === 1}
              style={pagerBtn(currentPageNum === 1)}
            >«</button>
            <button
              onClick={() => setCurrentPageNum(p => Math.max(1, p - 1))}
              disabled={currentPageNum === 1}
              style={pagerBtn(currentPageNum === 1)}
            >‹</button>

            {pageNumbers(currentPageNum, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} style={{ color: '#4a4a6a', padding: '0 4px', fontSize: '0.85rem' }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPageNum(Number(p))}
                  style={pagerBtn(false, currentPageNum === Number(p))}
                >{p}</button>
              )
            )}

            <button
              onClick={() => setCurrentPageNum(p => Math.min(totalPages, p + 1))}
              disabled={currentPageNum === totalPages}
              style={pagerBtn(currentPageNum === totalPages)}
            >›</button>
            <button
              onClick={() => setCurrentPageNum(totalPages)}
              disabled={currentPageNum === totalPages}
              style={pagerBtn(currentPageNum === totalPages)}
            >»</button>
          </div>
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

function pagerBtn(disabled: boolean, active = false): React.CSSProperties {
  return {
    minWidth: 32, height: 32, borderRadius: 7, border: active ? '1px solid rgba(124,92,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
    background: active ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.03)',
    color: disabled ? '#3a3a52' : active ? '#a78bfa' : '#c4c4de',
    fontSize: '0.85rem', fontWeight: active ? 700 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer', padding: '0 8px',
    transition: 'all 0.15s',
  };
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [];
  pages.push(1);
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

export default RosterManagement;
