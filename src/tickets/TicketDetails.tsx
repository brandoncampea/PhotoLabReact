import React, { useEffect, useState } from 'react';
import { getTicket, addComment, updateTicket } from './api';
import { Ticket, TicketComment } from './types';

interface TicketDetailsProps {
  ticketId: string;
  currentUserId: string;
  onBack: () => void;
}

export const TicketDetails: React.FC<TicketDetailsProps> = ({ ticketId, currentUserId, onBack }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTicket(ticketId)
      .then(setTicket)
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    const updated = await addComment(ticketId, { authorId: currentUserId, authorType: 'customer', message: comment });
    setTicket(updated);
    setComment('');
  };

  const handleStatusChange = async (status: 'open' | 'pending' | 'closed') => {
    if (!ticket) return;
    const updated = await updateTicket(ticketId, { status, by: currentUserId });
    setTicket(updated);
  };

  if (loading) return <div>Loading ticket...</div>;
  if (!ticket) return <div>Ticket not found.</div>;

  return (
    <div>
      <button onClick={onBack}>Back to tickets</button>
      <h3>{ticket.subject}</h3>
      <p>{ticket.description}</p>
      <div>Status: {ticket.status}</div>
      <div>
        <button onClick={() => handleStatusChange('open')}>Open</button>
        <button onClick={() => handleStatusChange('pending')}>Pending</button>
        <button onClick={() => handleStatusChange('closed')}>Close</button>
      </div>
      <h4>Comments</h4>
      <ul>
        {ticket.comments.map((c: TicketComment, i) => (
          <li key={i}>
            <b>{c.authorType}</b> ({new Date(c.createdAt).toLocaleString()}): {c.message}
          </li>
        ))}
      </ul>
      <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." />
      <button onClick={handleAddComment}>Add Comment</button>
    </div>
  );
};
