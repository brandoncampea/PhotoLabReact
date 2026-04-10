import React, { useEffect, useState } from 'react';
import { getTickets } from './api';
import { Ticket } from './types';

interface TicketListProps {
  studioId?: string;
  escalated?: boolean;
  onSelect: (ticket: Ticket) => void;
}

export const TicketList: React.FC<TicketListProps> = ({ studioId, escalated, onSelect }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTickets(studioId ? { studioId } : escalated ? { escalated: true } : undefined)
      .then(setTickets)
      .finally(() => setLoading(false));
  }, [studioId, escalated]);

  if (loading) return <div>Loading tickets...</div>;
  if (!tickets.length) return <div>No tickets found.</div>;

  return (
    <div>
      <h3>Tickets</h3>
      <ul>
        {tickets.map(ticket => (
          <li key={ticket._id}>
            <button onClick={() => onSelect(ticket)}>
              [{ticket.status}] {ticket.subject} - {new Date(ticket.createdAt).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
