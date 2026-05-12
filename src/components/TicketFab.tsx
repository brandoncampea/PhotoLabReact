import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createTicket } from '../tickets/api';

const getBrowserInfo = () => {
  if (typeof navigator === 'undefined') return '';
  return `${navigator.userAgent} (${navigator.platform})`;
};

const TicketFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createTicket({
        subject,
        description,
        createdBy: user?.id ? String(user.id) : '',
        createdForStudio: user?.studioId ? String(user.studioId) : '',
        meta: {
          page: location.pathname + location.search,
          user: user ? { id: user.id, email: user.email, name: user.firstName + ' ' + user.lastName } : null,
          studio: user?.studioId ? String(user.studioId) : undefined,
          browser: getBrowserInfo(),
        },
      });
      setSuccess(true);
      setSubject('');
      setDescription('');
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1800);
    } catch {
      alert('Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        aria-label="Support / Ticket"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 1200,
          background: '#7c3aed',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 56,
          height: 56,
          boxShadow: '0 2px 12px 0 #7c3aed44',
          fontSize: 28,
          cursor: 'pointer',
          display: open ? 'none' : 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => setOpen(true)}
      >
        <span role="img" aria-label="Help">❓</span>
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            zIndex: 1300,
            background: '#fff',
            color: '#23232a',
            borderRadius: 16,
            boxShadow: '0 4px 32px 0 #7c3aed33',
            padding: 24,
            width: 340,
            maxWidth: '90vw',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#7c3aed' }}>Support Ticket</div>
            <button
              aria-label="Close"
              style={{ background: 'none', border: 'none', fontSize: 22, color: '#7c3aed', cursor: 'pointer' }}
              onClick={() => setOpen(false)}
            >×</button>
          </div>
          {success ? (
            <div style={{ color: '#059669', fontWeight: 600, textAlign: 'center', padding: '24px 0' }}>
              Ticket submitted!<br />We'll be in touch soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label style={{ fontWeight: 500, fontSize: 15 }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                required
                style={{ width: '100%', marginBottom: 12, marginTop: 2, padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
                placeholder="Brief summary"
                disabled={submitting}
              />
              <label style={{ fontWeight: 500, fontSize: 15 }}>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                style={{ width: '100%', minHeight: 70, marginBottom: 14, marginTop: 2, padding: 8, borderRadius: 6, border: '1px solid #ddd', resize: 'vertical' }}
                placeholder="Describe your issue or question"
                disabled={submitting}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 16, border: 'none', marginTop: 2, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit Ticket'}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
};

export default TicketFab;
