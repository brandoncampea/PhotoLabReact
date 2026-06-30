import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createTicket } from '../tickets/api';
import { getDiagnostics } from '../utils/diagnostics';

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: 10,
  marginTop: 2,
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #ddd',
  fontSize: 14,
  boxSizing: 'border-box',
};

const TicketFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const authToken = localStorage.getItem('authToken');
  const isGuest = !user || !authToken;

  const handleClose = () => {
    setOpen(false);
    setSuccess(false);
    setSubject('');
    setDescription('');
    setGuestName('');
    setGuestEmail('');
    setHoneypot('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Honeypot: bots fill hidden fields, humans don't
    if (honeypot) return;
    setSubmitting(true);
    try {
      if (isGuest) {
        const res = await fetch('/api/tickets/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            description,
            guestName: guestName.trim(),
            guestEmail: guestEmail.trim(),
            honeypot,
            meta: {
              page: location.pathname + location.search,
              diagnostics: getDiagnostics(),
            },
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to submit ticket.');
        }
      } else {
        await createTicket({
          subject,
          description,
          meta: {
            page: location.pathname + location.search,
            user: user ? { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`.trim(), role: user.role, studioId: user.studioId } : null,
            diagnostics: getDiagnostics(),
          },
        });
      }
      setSuccess(true);
      setSubject('');
      setDescription('');
      setGuestName('');
      setGuestEmail('');
      setTimeout(handleClose, 1800);
    } catch (err: any) {
      alert(err?.message || 'Failed to submit ticket. Please try again.');
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
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#7c3aed' }}>Contact Support</div>
            <button
              aria-label="Close"
              style={{ background: 'none', border: 'none', fontSize: 22, color: '#7c3aed', cursor: 'pointer' }}
              onClick={handleClose}
            >×</button>
          </div>

          {success ? (
            <div style={{ color: '#059669', fontWeight: 600, textAlign: 'center', padding: '24px 0' }}>
              Ticket submitted!<br />We'll be in touch soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {isGuest && (
                <>
                  <label style={{ fontWeight: 500, fontSize: 13, color: '#555' }}>Your Name</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    required
                    placeholder="Jane Smith"
                    disabled={submitting}
                    style={inputStyle}
                  />
                  <label style={{ fontWeight: 500, fontSize: 13, color: '#555' }}>Your Email</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    disabled={submitting}
                    style={inputStyle}
                  />
                </>
              )}

              <label style={{ fontWeight: 500, fontSize: 13, color: '#555' }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                required
                placeholder="Brief summary"
                disabled={submitting}
                style={inputStyle}
              />

              <label style={{ fontWeight: 500, fontSize: 13, color: '#555' }}>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                placeholder="Describe your issue or question"
                disabled={submitting}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
              />

              {/* Honeypot — hidden from real users, bots fill it */}
              <input
                type="text"
                value={honeypot}
                onChange={e => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
              />

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
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
