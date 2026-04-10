// Ticketing API service for frontend
import axios from 'axios';
import { Ticket } from './types';

const BASE_URL = '/api/tickets';

export const createTicket = async (data: Partial<Ticket>) => {
  const res = await axios.post(BASE_URL, data);
  return res.data as Ticket;
};

export const getTickets = async (params?: Record<string, string | boolean>) => {
  const res = await axios.get(BASE_URL, { params });
  return res.data as Ticket[];
};

export const getTicket = async (id: string) => {
  const res = await axios.get(`${BASE_URL}/${id}`);
  return res.data as Ticket;
};

export const addComment = async (id: string, comment: { authorId: string; authorType: string; message: string }) => {
  const res = await axios.post(`${BASE_URL}/${id}/comment`, comment);
  return res.data as Ticket;
};

export const updateTicket = async (id: string, update: Partial<Ticket> & { by: string }) => {
  const res = await axios.patch(`${BASE_URL}/${id}`, update);
  return res.data as Ticket;
};
