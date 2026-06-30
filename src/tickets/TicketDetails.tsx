import React, { useEffect, useState } from 'react';
import './TicketModal.css';
import { getTicket, addComment, updateTicket } from './api';
import { Ticket, TicketComment } from './types';

interface TicketDetailsProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole?: string;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#14532d', color: '#4ade80' },
  pending: { bg: '#713f12', color: '#fbbf24' },
  closed: { bg: '#1f2937', color: '#9ca3af' },
};

const statusPill = (status: string) => {
  const s = STATUS_COLORS[status] || { bg: '#1f2937', color: '#9ca3af' };
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 600 as const,
    letterSpacing: 0.3,
    background: s.bg,
    color: s.color,
    marginRight: 8,
    verticalAlign: 'middle' as const,
  };
};

const authorTypeLabel = (type: string) => {
  if (type === 'admin' || type === 'super_admin') return 'Support';
  if (type === 'studio') return 'Studio';
  return 'Customer';
};

export const TicketDetails: React.FC<TicketDetailsProps> = ({
  ticketId,
  currentUserId,
  currentUserRole,
  onBack,
}) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = currentUserRole === 'super_admin' || currentUserRole === 'admin';
  const myAuthorType = isSuperAdmin ? 'admin' : 'studio';

  useEffect(() => {
    setLoading(true);
    getTicket(ticketId)
      .then(setTicket)
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handleAddComment = async () => {
    if (!comment.trim() || !ticket) return;
    setSaving(true);
    try {
      const updated = await addComment(ticketId, {
        authorId: currentUserId,
        authorType: myAuthorType,
        message: comment.trim(),
      });
      setTicket(updated);
      setComment('');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: 'open' | 'pending' | 'closed') => {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await updateTicket(ticketId, { status, by: currentUserId });
      setTicket(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEscalated = async () => {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await updateTicket(ticketId, {
        escalated: !ticket.escalated,
        by: currentUserId,
      });
      setTicket(updated);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#a78bfa' }}>Loading ticket…</div>;
  if (!ticket) return <div style={{ padding: 24, color: '#f87171' }}>Ticket not found.</div>;

  const isArchived = (ticket as any).meta?.source === 'chat_archive';

  return (
    <div className="ticket-modal">
      <button className="close-btn" onClick={onBack}>×</button>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <span style={statusPill(ticket.status)}>
          {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
        </span>
        {ticket.escalated && (
          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: '#7f1d1d', color: '#fca5a5' }}>
            Escalated
          </span>
        )}
        {isArchived && (
          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: '#2e1065', color: '#c4b5fd' }}>
            Chat Log
          </span>
        )}
      </div>

      <h3 style={{ marginTop: 0, marginBottom: 6 }}>{ticket.subject}</h3>

      {/* Ticket metadata */}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {((ticket as any).studioName || (ticket as any).studio_name) && (
          <span>Studio: <b style={{ color: '#a78bfa' }}>{(ticket as any).studioName || (ticket as any).studio_name}</b></span>
        )}
        {((ticket as any).createdByName || (ticket as any).created_by_name) && (
          <span>Created by: <b style={{ color: '#c4b5fd' }}>{(ticket as any).createdByName || (ticket as any).created_by_name}</b></span>
        )}
        {((ticket as any).createdAt || (ticket as any).created_at) && (
          <span>Created: {(ticket as any).createdAt || (ticket as any).created_at}</span>
        )}
      </div>

      {/* Description */}
      {ticket.description && !isArchived && (
        <p style={{ whiteSpace: 'pre-wrap', color: '#c4c4e0', marginBottom: 16, lineHeight: 1.6 }}>{ticket.description}</p>
      )}
      {isArchived && (
        <pre style={{ fontFamily: 'inherit', fontSize: 13, whiteSpace: 'pre-wrap', background: '#16162a', border: '1px solid #2d2d50', borderRadius: 6, padding: '10px 14px', color: '#b0b0cc', marginBottom: 16, overflowX: 'auto' }}>
          {ticket.description}
        </pre>
      )}

      {/* Status controls — super admins only */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {(['open', 'pending', 'closed'] as const).map(s => (
            <button
              key={s}
              disabled={saving || ticket.status === s}
              onClick={() => handleStatusChange(s)}
              style={{
                background: ticket.status === s ? '#4f46e5' : '#252545',
                color: ticket.status === s ? '#fff' : '#a78bfa',
                border: `1px solid ${ticket.status === s ? '#4f46e5' : '#3a3a60'}`,
                borderRadius: 6, padding: '5px 16px', fontSize: 13,
                cursor: ticket.status === s ? 'default' : 'pointer',
                fontWeight: ticket.status === s ? 700 : 400,
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            disabled={saving}
            onClick={handleToggleEscalated}
            style={{
              background: ticket.escalated ? '#7f1d1d' : '#7c2d12',
              color: ticket.escalated ? '#fca5a5' : '#fed7aa',
              border: `1px solid ${ticket.escalated ? '#991b1b' : '#9a3412'}`,
              borderRadius: 6, padding: '5px 16px', fontSize: 13, cursor: 'pointer', marginLeft: 'auto',
            }}
          >
            {ticket.escalated ? 'De-escalate' : 'Escalate'}
          </button>
        </div>
      )}

      {/* Comments */}
      <h4 style={{ marginBottom: 8 }}>
        Comments {ticket.comments.length > 0 ? `(${ticket.comments.length})` : ''}
      </h4>
      {ticket.comments.length === 0 && (
        <div style={{ color: '#555570', fontSize: 13, marginBottom: 12 }}>No comments yet.</div>
      )}
      <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ticket.comments.map((c: TicketComment & { authorName?: string }, i) => {
          const isMe = String(c.authorId) === String(currentUserId);
          const isSupport = c.authorType === 'admin' || c.authorType === 'super_admin';
          return (
            <div
              key={i}
              style={{
                padding: '9px 13px',
                borderRadius: 8,
                background: isSupport ? '#1e1335' : '#16213e',
                borderLeft: `3px solid ${isSupport ? '#7c3aed' : '#334155'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: isSupport ? '#a78bfa' : '#94a3b8' }}>
                  {c.authorName || authorTypeLabel(c.authorType)}
                  {isMe ? <span style={{ fontWeight: 400, color: '#555570', marginLeft: 4 }}>(you)</span> : null}
                </span>
                <span style={{ fontSize: 11, color: '#555570', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 14, color: '#c4c4e0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.message}</div>
            </div>
          );
        })}
      </div>

      {/* Add comment — hide on closed archive tickets */}
      {!(isArchived && ticket.status === 'closed') && (
        <>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
          />
          <button
            onClick={handleAddComment}
            disabled={saving || !comment.trim()}
            style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {saving ? 'Sending…' : 'Send'}
          </button>
        </>
      )}

      {/* Diagnostics panel — admins only */}
      {isSuperAdmin && <DiagnosticsPanel meta={(ticket as any).meta} />}
    </div>
  );
};

type DiagMeta = {
  page?: string;
  user?: { id?: number; email?: string; name?: string; role?: string; studioId?: number } | null;
  diagnostics?: {
    page?: { url?: string; title?: string; referrer?: string | null };
    browser?: {
      name?: string; os?: string; userAgent?: string; language?: string; online?: boolean;
      screen?: { width: number; height: number; pixelRatio: number } | null;
      viewport?: { width: number; height: number } | null;
      connection?: { type?: string; downlink?: number } | null;
    };
    performance?: { loadTimeMs?: number | null; memory?: { usedMB: number; totalMB: number } | null };
    recentErrors?: Array<{ message: string; stack?: string; source?: string; ts: string }>;
    capturedAt?: string;
  };
  [key: string]: unknown;
} | null;

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #1e1e35', fontSize: 12 }}>
    <span style={{ color: '#6b6b90', minWidth: 120, flexShrink: 0 }}>{label}</span>
    <span style={{ color: '#c4c4e0', wordBreak: 'break-all' }}>{value}</span>
  </div>
);

const DiagnosticsPanel: React.FC<{ meta: DiagMeta }> = ({ meta }) => {
  const [open, setOpen] = useState(false);
  if (!meta) return null;

  const d = meta.diagnostics;
  const pageUrl = d?.page?.url || meta.page;
  const hasAny = !!(pageUrl || d?.browser || d?.performance || d?.recentErrors?.length || meta.user);

  if (!hasAny) return null;

  const errors = d?.recentErrors ?? [];
  const mem = d?.performance?.memory;
  const screen = d?.browser?.screen;
  const viewport = d?.browser?.viewport;
  const conn = d?.browser?.connection;

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid #2d2d50', paddingTop: 14 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: 'none', color: '#6b6b90', cursor: 'pointer', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
      >
        <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
        Submission Context
        {errors.length > 0 && (
          <span style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 99, fontSize: 10, padding: '0 6px', lineHeight: '16px', fontWeight: 700 }}>
            {errors.length} error{errors.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Page */}
          {pageUrl && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#555570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Page</div>
              <Row label="URL" value={<a href={pageUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>{pageUrl}</a>} />
              {d?.page?.title && <Row label="Title" value={d.page.title} />}
              {d?.page?.referrer && <Row label="Referrer" value={d.page.referrer} />}
              {d?.capturedAt && <Row label="Captured" value={new Date(d.capturedAt).toLocaleString()} />}
            </div>
          )}

          {/* User */}
          {meta.user && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#555570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>User</div>
              {meta.user.name && <Row label="Name" value={meta.user.name} />}
              {meta.user.email && <Row label="Email" value={meta.user.email} />}
              {meta.user.role && <Row label="Role" value={meta.user.role} />}
              {meta.user.studioId && <Row label="Studio ID" value={meta.user.studioId} />}
            </div>
          )}

          {/* Browser */}
          {d?.browser && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#555570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Browser</div>
              {d.browser.name && <Row label="Browser" value={d.browser.name} />}
              {d.browser.os && <Row label="OS" value={d.browser.os} />}
              {d.browser.language && <Row label="Language" value={d.browser.language} />}
              {d.browser.online !== undefined && <Row label="Online" value={d.browser.online ? 'Yes' : 'No'} />}
              {screen && <Row label="Screen" value={`${screen.width}×${screen.height} @ ${screen.pixelRatio}x`} />}
              {viewport && <Row label="Viewport" value={`${viewport.width}×${viewport.height}`} />}
              {conn?.type && <Row label="Connection" value={`${conn.type}${conn.downlink ? `, ${conn.downlink} Mbps` : ''}`} />}
              {d.browser.userAgent && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: '#555570', marginBottom: 2 }}>User Agent</div>
                  <div style={{ fontSize: 11, color: '#6b6b90', wordBreak: 'break-all', background: '#16162a', borderRadius: 4, padding: '4px 8px', fontFamily: 'monospace' }}>
                    {d.browser.userAgent}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Performance */}
          {d?.performance && (d.performance.loadTimeMs != null || mem) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#555570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Performance</div>
              {d.performance.loadTimeMs != null && <Row label="Load time" value={`${d.performance.loadTimeMs} ms`} />}
              {mem && <Row label="JS Memory" value={`${mem.usedMB} MB used / ${mem.totalMB} MB total`} />}
            </div>
          )}

          {/* Recent errors */}
          {errors.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7f1d1d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Recent Errors ({errors.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {errors.map((e, i) => (
                  <div key={i} style={{ background: '#1a0a0a', border: '1px solid #3f1515', borderRadius: 6, padding: '7px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: e.stack ? 4 : 0 }}>
                      <span style={{ fontSize: 12, color: '#fca5a5', wordBreak: 'break-word' }}>{e.message}</span>
                      <span style={{ fontSize: 10, color: '#6b3030', whiteSpace: 'nowrap', flexShrink: 0 }}>{new Date(e.ts).toLocaleTimeString()}</span>
                    </div>
                    {e.source && <div style={{ fontSize: 10, color: '#6b3030', marginBottom: e.stack ? 3 : 0 }}>{e.source}</div>}
                    {e.stack && (
                      <pre style={{ margin: 0, fontSize: 10, color: '#7a3030', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.4 }}>
                        {e.stack}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
