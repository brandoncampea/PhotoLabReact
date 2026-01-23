import api from './api';
import { mockApi } from './mockApi';
import { LoginCredentials, RegisterData, AuthResponse } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    if (useMockApi) {
      const response = await mockApi.auth.login(credentials);
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response;
    }

    try {
      console.log('Attempting to login with:', { email: credentials.email, password: '***' });
      console.log('API baseURL:', api.defaults.baseURL);
      const response = await api.post<AuthResponse>('/auth/login', credentials);
      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      throw error;
    }
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    if (useMockApi) {
      const response = await mockApi.auth.register(data);
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response;
    }

    try {
      console.log('Attempting to register with:', { ...data, password: '***' });
      console.log('API baseURL:', api.defaults.baseURL);
      const response = await api.post<AuthResponse>('/auth/register', data);
      console.log('Registration successful:', response.data);
      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error: any) {
      console.error('Registration error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        url: error.config?.url,
        method: error.config?.method,
      });
      throw error;
    }
  },

  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken(): string | null {
    return localStorage.getItem('authToken');
  },
};
