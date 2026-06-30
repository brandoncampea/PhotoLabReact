// Ticketing API service for frontend
import axios from 'axios';
import { Ticket } from './types';

const BASE_URL = '/api/tickets';

const authHeader = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const createTicket = async (data: { subject: string; description: string; meta?: Record<string, unknown> }) => {
  const res = await axios.post(BASE_URL, data, { headers: authHeader() });
  return res.data as Ticket;
};

export const getTickets = async (params?: Record<string, string | boolean>) => {
  const res = await axios.get(BASE_URL, { params, headers: authHeader() });
  return res.data as Ticket[];
};

export const getTicket = async (id: string) => {
  const res = await axios.get(`${BASE_URL}/${id}`, { headers: authHeader() });
  return res.data as Ticket;
};

export const addComment = async (
  id: string,
  comment: { authorId: string; authorType: string; message: string }
) => {
  const res = await axios.post(`${BASE_URL}/${id}/comment`, comment, { headers: authHeader() });
  return res.data as Ticket;
};

export const updateTicket = async (id: string, update: { status?: string; escalated?: boolean; by?: string }) => {
  const res = await axios.patch(`${BASE_URL}/${id}`, update, { headers: authHeader() });
  return res.data as Ticket;
};
