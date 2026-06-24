import React, { useCallback, useEffect, useState } from 'react';
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
              {watchlist.map((entry) => (
                <li key={entry.id} className="watchlist-item">
                  <span className="watchlist-player-name">{entry.playerName}</span>
                  {entry.playerNumber && (
                    <span className="watchlist-player-number">#{entry.playerNumber}</span>
                  )}
                  <button
                    className="watchlist-remove-btn"
                    disabled={actionInProgress === entry.playerName.toLowerCase()}
                    onClick={() => {
                      setActionInProgress(entry.playerName.toLowerCase());
                      playerWatchlistService.removePlayer(entry.id)
                        .then(() => {
                          showMessage('success', `Stopped watching ${entry.playerName}`);
                          return loadWatchlist();
                        })
                        .catch(() => showMessage('error', 'Failed to remove player.'))
                        .finally(() => setActionInProgress(''));
                    }}
                    title="Stop watching"
                  >
                    {actionInProgress === entry.playerName.toLowerCase() ? '…' : '✕'}
                  </button>
                </li>
              ))}
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
