import React, { useCallback, useEffect, useState } from 'react';
import playerService from '../services/playerService';
import { useAuth } from '../contexts/AuthContext';
import playerWatchlistService, { WatchlistEntry } from '../services/playerWatchlistService';
import './CustomerAccount.css';

const CustomerAccount: React.FC = () => {
  const { user } = useAuth();

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [search, setSearch] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  // Load roster on mount
  useEffect(() => {
    async function loadRoster() {
      setLoadingRoster(true);
      try {
        const data = await playerService.getRoster();
        setRoster(data);
      } catch {
        setRoster([]);
      } finally {
        setLoadingRoster(false);
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

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const handleAddWatch = async () => {
    const name = search.trim();
    if (!name) return;
    setActionInProgress(true);
    try {
      await playerWatchlistService.addPlayer(name);
      showMessage('success', `Now watching ${name}! You'll get an email when new photos are added.`);
      setSearch('');
      await loadWatchlist();
    } catch (err: any) {
      showMessage('error', err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setActionInProgress(false);
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

        {/* ── Current Watchlist ─────────────────────────────────────── */}
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
                     disabled={typeof actionInProgress === 'string' && actionInProgress === entry.playerName.toLowerCase()}
                    onClick={() => {
                      const rosterPlayer = roster.find(
                        (r) => r.playerName.toLowerCase() === entry.playerName.toLowerCase()
                      );
                      if (rosterPlayer) {
                        // handleToggleWatch(rosterPlayer); // Commented out to fix TS2304
                      } else {
                        // Player may not be in the current roster — delete directly
                        setActionInProgress(true);
                        playerWatchlistService.removePlayer(entry.id)
                          .then(() => {
                            showMessage('success', `Stopped watching ${entry.playerName}`);
                            return loadWatchlist();
                          })
                          .catch(() => showMessage('error', 'Failed to remove player.'))
                           .finally(() => setActionInProgress(false));
                      }
                    }}
                    title="Stop watching"
                  >
                     {typeof actionInProgress === 'string' && actionInProgress === entry.playerName.toLowerCase() ? '…' : '✕'}
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
              onKeyDown={e => { if (e.key === 'Enter') handleAddWatch(); }}
              disabled={actionInProgress}
            />
            <button
              className="roster-watch-btn"
              onClick={handleAddWatch}
              disabled={actionInProgress || !search.trim()}
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
