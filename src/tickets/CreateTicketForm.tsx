import React, { useState } from 'react';
import { createTicket } from './api';
import { Ticket } from './types';

interface CreateTicketFormProps {
  currentUserId: string;
  onCreated: (ticket: Ticket) => void;
}

export const CreateTicketForm: React.FC<CreateTicketFormProps> = ({ currentUserId, onCreated }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const ticket = await createTicket({ subject, description, createdBy: currentUserId });
      onCreated(ticket);
      setSubject('');
      setDescription('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>Create Ticket</h3>
      <input
        type="text"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Subject"
        required
      />
      <br />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Describe your issue..."
        required
      />
      <br />
      <button type="submit" disabled={loading}>Submit</button>
    </form>
  );
};
