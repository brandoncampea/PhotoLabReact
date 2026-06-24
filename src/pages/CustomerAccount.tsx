import React, { useCallback, useEffect, useRef, useState } from 'react';
import playerService from '../services/playerService';
import { useAuth } from '../contexts/AuthContext';
import playerWatchlistService, { WatchlistEntry } from '../services/playerWatchlistService';
import schoolWatchlistService, { SchoolWatchlistEntry, AvailableSchool } from '../services/schoolWatchlistService';
import './CustomerAccount.css';

const CustomerAccount: React.FC = () => {
  const { user } = useAuth();

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [schoolWatchlist, setSchoolWatchlist] = useState<SchoolWatchlistEntry[]>([]);
  const [availableSchools, setAvailableSchools] = useState<AvailableSchool[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingSchoolWatchlist, setLoadingSchoolWatchlist] = useState(true);
  const [search, setSearch] = useState('');
  // Removed unused schoolSearch
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // Use string for per-player loading state (player name), or '' for none
  const [actionInProgress, setActionInProgress] = useState('');
  const [schoolActionInProgress, setSchoolActionInProgress] = useState<number|null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  // Load roster on mount
  useEffect(() => {
    async function loadRoster() {
      try {
        const data = await playerService.getRoster();
        setRoster(data);
      } catch {
        setRoster([]);
      }
    }
    loadRoster();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadWatchlist = useCallback(async () => {
    setLoadingWatchlist(true);
    try {
      const data = await playerWatchlistService.getWatchlist();
      setWatchlist(data);
    } catch {
      // silently ignore — may not be logged in
    } finally {
      setLoadingWatchlist(false);
    }
  }, []);


  // School watchlist
  const loadSchoolWatchlist = useCallback(async () => {
    setLoadingSchoolWatchlist(true);
    try {
      const data = await schoolWatchlistService.getWatchlist();
      setSchoolWatchlist(data);
    } catch {}
    setLoadingSchoolWatchlist(false);
  }, []);

  const loadAvailableSchools = useCallback(async () => {
    try {
      const data = await schoolWatchlistService.getAvailableSchoolsAndCategories();
      setAvailableSchools(data.schools);
      setAvailableCategories(data.categories);
    } catch {}
  }, []);

  useEffect(() => {
    loadWatchlist();
    loadSchoolWatchlist();
    loadAvailableSchools();
  }, [loadWatchlist, loadSchoolWatchlist, loadAvailableSchools]);
  // Add school watch
  const handleAddSchoolWatch = async () => {
    if (!selectedSchool || !selectedCategory) return;
    setSchoolActionInProgress(-1);
    try {
      // Use the school name as the ID (string)
      await schoolWatchlistService.addSchool(selectedSchool, selectedCategory);
      showMessage('success', 'Now watching this school!');
      setSelectedSchool('');
      setSelectedCategory('');
      await loadSchoolWatchlist();
    } catch (err: any) {
      showMessage('error', err?.response?.data?.error || 'Something went wrong.');
    } finally {
      setSchoolActionInProgress(null);
    }
  };

  // Remove school watch
  const handleRemoveSchoolWatch = async (id: number) => {
    setSchoolActionInProgress(id);
    try {
      await schoolWatchlistService.removeSchool(id);
      showMessage('success', 'Stopped watching this school.');
      await loadSchoolWatchlist();
    } catch {
      showMessage('error', 'Failed to remove school.');
    } finally {
      setSchoolActionInProgress(null);
    }
  };

  const handleAddWatch = async () => {
    const name = search.trim();
    if (!name) return;
    setActionInProgress('__adding__');
    try {
      await playerWatchlistService.addPlayer(name);
      showMessage('success', `Now watching ${name}! You'll get an email when new photos are added.`);
      setSearch('');
      await loadWatchlist();
    } catch (err: any) {
      showMessage('error', err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setActionInProgress('');
    }
  };

  // For player autocomplete
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  useEffect(() => {
    playerWatchlistService.getAvailablePlayers().then(setAvailablePlayers).catch(() => setAvailablePlayers([]));
  }, []);

  // Per-player photo panels: map from watchlist entry id → { loading, page, data }
  type PhotoPanelData = { playerName: string; items: { id: number; fileName: string; albumId: number; albumName: string }[]; total: number; page: number; pageSize: number };
  const [photoPanels, setPhotoPanels] = useState<Record<number, { loading: boolean; page: number; data: PhotoPanelData | null }>>({});
  const loadingPanelRef = useRef<Record<number, boolean>>({});

  const loadPhotos = async (entryId: number, page = 1) => {
    if (loadingPanelRef.current[entryId]) return;
    loadingPanelRef.current[entryId] = true;
    setPhotoPanels(prev => ({ ...prev, [entryId]: { ...prev[entryId], loading: true, page } }));
    try {
      const res = await fetch(`/api/player-watchlist/${entryId}/photos?page=${page}&pageSize=24`);
      const data: PhotoPanelData = await res.json();
      setPhotoPanels(prev => ({ ...prev, [entryId]: { loading: false, page, data } }));
    } catch {
      setPhotoPanels(prev => ({ ...prev, [entryId]: { loading: false, page, data: null } }));
    } finally {
      loadingPanelRef.current[entryId] = false;
    }
  };

  const togglePhotoPanel = (entryId: number) => {
    if (photoPanels[entryId]) {
      setPhotoPanels(prev => { const next = { ...prev }; delete next[entryId]; return next; });
    } else {
      loadPhotos(entryId, 1);
    }
  };

  if (!user) {
    return (
      <div className="customer-account-page">
        <div className="account-card">
          <h1 className="account-title">My Account</h1>
          <p className="account-login-prompt">
            Please <a href="/login">log in</a> to manage your player watchlist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-account-page">
      <div className="account-card">
        <h1 className="account-title">My Account</h1>
        <p className="account-user-info">
          Signed in as <strong>{user.email}</strong>
        </p>

        {message && (
          <div className={`account-message account-message--${message.type}`}>
            {message.text}
          </div>
        )}

        {/* ── Orders ─────────────────────────────────────────────────── */}
        <section className="account-section">
          <h2 className="account-section-title">🛒 My Orders</h2>
          <p className="account-section-desc">View your photo print and product orders.</p>
          <a href="/orders" style={{ display: 'inline-block', padding: '8px 20px', background: '#7c5cff', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.92rem', textDecoration: 'none' }}>View Orders</a>
        </section>

        {/* ── Saved Photos ─────────────────────────────────────────── */}
        <section className="account-section">
          <h2 className="account-section-title">♥ Saved Photos</h2>
          <p className="account-section-desc">View and order your favorited photos across all albums.</p>
          <a href="/favorites" style={{ display: 'inline-block', padding: '8px 20px', background: '#ec4899', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.92rem', textDecoration: 'none' }}>View Saved Photos</a>
        </section>

        {/* ── Current Player Watchlist ─────────────────────────────── */}
                {/* ── Current School Watchlist ─────────────────────────────── */}
                <section className="account-section">
                  <h2 className="account-section-title">🏫 My School Watchlist</h2>
                  <p className="account-section-desc">
                    You'll receive an email whenever new photos are added for a school and category you're watching.
                  </p>
                  {loadingSchoolWatchlist ? (
                    <p className="account-loading">Loading…</p>
                  ) : schoolWatchlist.length === 0 ? (
                    <p className="account-empty">You're not watching any schools yet. Add some below.</p>
                  ) : (
                    <ul className="watchlist-list">
                      {schoolWatchlist.map((entry) => (
                        <li key={entry.id} className="watchlist-item">
                          <span className="watchlist-player-name">{entry.schoolId}</span>
                          <span className="watchlist-player-number">{entry.category}</span>
                          <button
                            className="watchlist-remove-btn"
                            disabled={schoolActionInProgress === entry.id}
                            onClick={() => handleRemoveSchoolWatch(entry.id)}
                            title="Stop watching"
                          >
                            {schoolActionInProgress === entry.id ? '…' : '✕'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {/* ── Watch a School ───────────────────────────────────────── */}
                <section className="account-section">
                  <h2 className="account-section-title">🏫 Watch a School</h2>
                  <p className="account-section-desc">
                    Select a school and category to get notified when new photos are added.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className="account-search-input"
                      value={selectedSchool}
                      onChange={e => {
                        setSelectedSchool(e.target.value);
                        setSelectedCategory('');
                      }}
                      disabled={schoolActionInProgress !== null}
                    >
                      <option value="">Select school…</option>
                      {Array.from(new Set(availableSchools.map(s => `${s.schoolId}|${s.schoolName}`))).map((key) => {
                        const [schoolId, schoolName] = key.split('|');
                        return <option key={key} value={schoolId}>{schoolName}</option>;
                      })}
                    </select>
                    <select
                      className="account-search-input"
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      disabled={!selectedSchool || schoolActionInProgress !== null}
                    >
                      <option value="">Select category…</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      className="roster-watch-btn"
                      onClick={handleAddSchoolWatch}
                      disabled={schoolActionInProgress !== null || !selectedSchool || !selectedCategory}
                    >
                      {schoolActionInProgress !== null ? '…' : '+ Watch'}
                    </button>
                  </div>
                </section>
        <section className="account-section">
          <h2 className="account-section-title">
            🔔 My Player Watchlist
          </h2>
          <p className="account-section-desc">
            You'll receive an email whenever new photos are added for a player you're watching.
          </p>

          {loadingWatchlist ? (
            <p className="account-loading">Loading…</p>
          ) : watchlist.length === 0 ? (
            <p className="account-empty">
              You're not watching any players yet. Add some from the roster below.
            </p>
          ) : (
            <ul className="watchlist-list">
              {watchlist.map((entry) => {
                const panel = photoPanels[entry.id];
                const isOpen = !!panel;
                const totalPhotos = panel?.data?.total ?? null;
                return (
                  <li key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div className="watchlist-item" style={{ borderRadius: isOpen ? '8px 8px 0 0' : undefined }}>
                      <span className="watchlist-player-name">{entry.playerName}</span>
                      {entry.playerNumber && (
                        <span className="watchlist-player-number">#{entry.playerNumber}</span>
                      )}
                      <button
                        onClick={() => togglePhotoPanel(entry.id)}
                        title={isOpen ? 'Hide photos' : 'View photos'}
                        style={{
                          marginLeft: 'auto',
                          background: isOpen ? 'rgba(124,92,255,0.25)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${isOpen ? 'rgba(124,92,255,0.5)' : 'rgba(255,255,255,0.12)'}`,
                          color: isOpen ? '#c4b5fd' : '#9fb0c6',
                          borderRadius: 6,
                          padding: '3px 10px',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {panel?.loading ? '…' : isOpen ? 'Hide' : totalPhotos !== null ? `${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : 'View Photos'}
                      </button>
                      <button
                        className="watchlist-remove-btn"
                        disabled={actionInProgress === entry.playerName.toLowerCase()}
                        onClick={() => {
                          setActionInProgress(entry.playerName.toLowerCase());
                          playerWatchlistService.removePlayer(entry.id)
                            .then(() => {
                              showMessage('success', `Stopped watching ${entry.playerName}`);
                              setPhotoPanels(prev => { const next = { ...prev }; delete next[entry.id]; return next; });
                              return loadWatchlist();
                            })
                            .catch(() => showMessage('error', 'Failed to remove player.'))
                            .finally(() => setActionInProgress(''));
                        }}
                        title="Stop watching"
                      >
                        {actionInProgress === entry.playerName.toLowerCase() ? '…' : '✕'}
                      </button>
                    </div>
                    {isOpen && (
                      <div style={{ background: '#0f131a', border: '1px solid #2e3642', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '14px 12px' }}>
                        {panel.loading && <div style={{ color: '#5a6a7a', fontSize: '0.85rem', padding: '8px 0' }}>Loading photos…</div>}
                        {!panel.loading && panel.data && panel.data.items.length === 0 && (
                          <div style={{ color: '#5a6a7a', fontSize: '0.85rem', padding: '8px 0' }}>No photos found for {entry.playerName} yet.</div>
                        )}
                        {!panel.loading && panel.data && panel.data.items.length > 0 && (
                          <>
                            <div style={{ fontSize: '0.75rem', color: '#5a6a7a', marginBottom: 10 }}>
                              Showing {((panel.page - 1) * panel.data.pageSize) + 1}–{Math.min(panel.page * panel.data.pageSize, panel.data.total)} of {panel.data.total} photo{panel.data.total !== 1 ? 's' : ''}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                              {panel.data.items.map(photo => (
                                <a
                                  key={photo.id}
                                  href={`/albums/${photo.albumId}?photo=${photo.id}`}
                                  title={`${photo.albumName} — tap to view & order`}
                                  style={{ display: 'block', borderRadius: 7, overflow: 'hidden', aspectRatio: '1', position: 'relative', background: 'rgba(0,0,0,0.35)', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.07)' }}
                                >
                                  <img
                                    src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                                    alt={photo.albumName}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', padding: '12px 4px 4px' }}>
                                    <div style={{ fontSize: '0.58rem', color: '#c4c4de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{photo.albumName}</div>
                                  </div>
                                </a>
                              ))}
                            </div>
                            {panel.data.total > panel.data.pageSize && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <span style={{ fontSize: '0.75rem', color: '#5a6a7a' }}>
                                  Page {panel.page} of {Math.ceil(panel.data.total / panel.data.pageSize)}
                                </span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    disabled={panel.page <= 1}
                                    onClick={() => loadPhotos(entry.id, panel.page - 1)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #2e3642', background: panel.page <= 1 ? '#1a1f2a' : '#1e2533', color: panel.page <= 1 ? '#3a4a5a' : '#9fb0c6', cursor: panel.page <= 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}
                                  >‹ Prev</button>
                                  <button
                                    disabled={panel.page >= Math.ceil(panel.data.total / panel.data.pageSize)}
                                    onClick={() => loadPhotos(entry.id, panel.page + 1)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #2e3642', background: panel.page >= Math.ceil(panel.data.total / panel.data.pageSize) ? '#1a1f2a' : '#1e2533', color: panel.page >= Math.ceil(panel.data.total / panel.data.pageSize) ? '#3a4a5a' : '#9fb0c6', cursor: panel.page >= Math.ceil(panel.data.total / panel.data.pageSize) ? 'default' : 'pointer', fontSize: '0.8rem' }}
                                  >Next ›</button>
                                </div>
                              </div>
                            )}
                            <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#4a5a6a' }}>
                              Tap a photo to view it in the album and order prints.
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Watch Any Player ─────────────────────────────────────── */}
        <section className="account-section">
          <h2 className="account-section-title">👤 Watch a Player</h2>
          <p className="account-section-desc">
            Enter a player name to get notified when their photos are added—even if they're not on the roster yet.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="account-search-input"
              type="text"
              placeholder="Enter player name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              list="available-players"
              onKeyDown={e => { if (e.key === 'Enter') handleAddWatch(); }}
              disabled={!!actionInProgress}
            />
            <datalist id="available-players">
              {search.trim() && (() => {
                const seen = new Set();
                return availablePlayers
                  .filter((p) => {
                    // Case-insensitive substring match
                    return p.playerName && p.playerName.toLowerCase().includes(search.trim().toLowerCase());
                  })
                  .filter((p) => {
                    // Deduplicate by player name (case-insensitive)
                    const name = p.playerName.replace(/\s*#\d+$/, '').toLowerCase();
                    if (seen.has(name)) return false;
                    seen.add(name);
                    return true;
                  })
                  .map((p, idx) => {
                    const name = p.playerName.replace(/\s*#\d+$/, '');
                    return <option key={name} value={name} />;
                  });
              })()}
            </datalist>
            <button
              className="roster-watch-btn"
              onClick={handleAddWatch}
              disabled={!!actionInProgress || !search.trim()}
            >
              {actionInProgress ? '…' : '+ Watch'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CustomerAccount;
