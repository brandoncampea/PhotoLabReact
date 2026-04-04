import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import playerWatchlistService, { RosterPlayer, WatchlistEntry } from '../services/playerWatchlistService';
import './CustomerAccount.css';

const CustomerAccount: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Derive studioSlug from the URL query (?studioSlug=...)
  const studioSlug = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('studioSlug') || undefined;
  }, [location.search]);

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [search, setSearch] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const data = await playerWatchlistService.getRoster(studioSlug);
      setRoster(data);
    } catch {
      // silently ignore
    } finally {
      setLoadingRoster(false);
    }
  }, [studioSlug]);

  useEffect(() => {
    loadWatchlist();
    loadRoster();
  }, [loadWatchlist, loadRoster]);

  const handleToggleWatch = async (player: RosterPlayer) => {
    const key = player.playerName.toLowerCase();
    setActionInProgress(key);
    try {
      if (player.isWatching) {
        // Find the watchlist entry to delete
        const entry = watchlist.find(
          (w) => w.playerName.toLowerCase() === key
        );
        if (entry) {
          await playerWatchlistService.removePlayer(entry.id);
          showMessage('success', `Stopped watching ${player.playerName}`);
        }
      } else {
        await playerWatchlistService.addPlayer(
          player.playerName,
          player.playerNumber ?? undefined
        );
        showMessage('success', `Now watching ${player.playerName}! You'll get an email when new photos are added.`);
      }
      await Promise.all([loadWatchlist(), loadRoster()]);
    } catch (err: any) {
      showMessage('error', err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (p) =>
        p.playerName.toLowerCase().includes(q) ||
        (p.playerNumber ?? '').toLowerCase().includes(q) ||
        (p.rosterName ?? '').toLowerCase().includes(q)
    );
  }, [roster, search]);

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
                    disabled={actionInProgress === entry.playerName.toLowerCase()}
                    onClick={() => {
                      const rosterPlayer = roster.find(
                        (r) => r.playerName.toLowerCase() === entry.playerName.toLowerCase()
                      );
                      if (rosterPlayer) {
                        handleToggleWatch(rosterPlayer);
                      } else {
                        // Player may not be in the current roster — delete directly
                        setActionInProgress(entry.playerName.toLowerCase());
                        playerWatchlistService.removePlayer(entry.id)
                          .then(() => {
                            showMessage('success', `Stopped watching ${entry.playerName}`);
                            return loadWatchlist();
                          })
                          .catch(() => showMessage('error', 'Failed to remove player.'))
                          .finally(() => setActionInProgress(null));
                      }
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

        {/* ── Roster ────────────────────────────────────────────────── */}
        <section className="account-section">
          <h2 className="account-section-title">
            👤 Studio Roster
          </h2>
          <p className="account-section-desc">
            Search for a player and tap <strong>Watch</strong> to get notified when their photos are added.
          </p>

          <input
            className="account-search-input"
            type="text"
            placeholder="Search by name or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loadingRoster ? (
            <p className="account-loading">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="account-empty">
              No roster found for this studio. Ask the studio to upload a player roster.
            </p>
          ) : filteredRoster.length === 0 ? (
            <p className="account-empty">No players match "{search}".</p>
          ) : (
            <ul className="roster-list">
              {filteredRoster.map((player) => {
                const busy = actionInProgress === player.playerName.toLowerCase();
                return (
                  <li
                    key={player.id}
                    className={`roster-item ${player.isWatching ? 'roster-item--watching' : ''}`}
                  >
                    <div className="roster-item-info">
                      <span className="roster-player-name">{player.playerName}</span>
                      {player.playerNumber && (
                        <span className="roster-player-number">#{player.playerNumber}</span>
                      )}
                      {player.rosterName && (
                        <span className="roster-team-name">{player.rosterName}</span>
                      )}
                    </div>
                    <button
                      className={`roster-watch-btn ${player.isWatching ? 'roster-watch-btn--watching' : ''}`}
                      disabled={busy}
                      onClick={() => handleToggleWatch(player)}
                    >
                      {busy ? '…' : player.isWatching ? '✓ Watching' : '+ Watch'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default CustomerAccount;
