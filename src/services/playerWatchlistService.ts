import api from './api';

export interface WatchlistEntry {
  id: number;
  studioId: number;
  playerName: string;
  playerNumber: string | null;
  createdAt: string;
}

export interface RosterPlayer {
  id: number;
  playerName: string;
  playerNumber: string | null;
  rosterName: string | null;
  isWatching: boolean;
}

export const playerWatchlistService = {
  /** Get the current user's watched players */
  async getWatchlist(): Promise<WatchlistEntry[]> {
    const res = await api.get<WatchlistEntry[]>('/player-watchlist/');
    return res.data;
  },

  /**
   * Get the studio's roster with isWatching flags.
   * Pass studioSlug when the customer is browsing a public studio URL.
   */
  async getRoster(studioSlug?: string): Promise<RosterPlayer[]> {
    const params: Record<string, string> = {};
    if (studioSlug) params.studioSlug = studioSlug;
    const res = await api.get<RosterPlayer[]>('/player-watchlist/roster', { params });
    return res.data;
  },

  /** Subscribe to a player */
  async addPlayer(playerName: string, playerNumber?: string | null, studioId?: number): Promise<WatchlistEntry> {
    const res = await api.post<WatchlistEntry>('/player-watchlist/', { playerName, playerNumber, studioId });
    return res.data;
  },

  /** Unsubscribe from a player */
  async removePlayer(id: number): Promise<void> {
    await api.delete(`/player-watchlist/${id}`);
  },
};

export default playerWatchlistService;
