import api from './api';

export interface SchoolWatchlistEntry {
  id: number;
  schoolId: number;
  category: string;
  createdAt: string;
  schoolName?: string;
}


export interface AvailableSchool {
  schoolId: number;
  schoolName: string;
}

export interface AvailableSchoolsAndCategories {
  schools: AvailableSchool[];
  categories: string[];
}

const schoolWatchlistService = {
  async getWatchlist(): Promise<SchoolWatchlistEntry[]> {
    const res = await api.get<SchoolWatchlistEntry[]>('/school-watchlist');
    return res.data;
  },
  async getAvailableSchoolsAndCategories(): Promise<AvailableSchoolsAndCategories> {
    const res = await api.get<AvailableSchoolsAndCategories>('/school-watchlist/available');
    return res.data;
  },
  async addSchool(schoolId: string, category: string): Promise<SchoolWatchlistEntry> {
    const res = await api.post<SchoolWatchlistEntry>('/school-watchlist', { schoolId, category });
    return res.data;
  },
  async removeSchool(id: number): Promise<void> {
    await api.delete(`/school-watchlist/${id}`);
  },
};

export default schoolWatchlistService;
