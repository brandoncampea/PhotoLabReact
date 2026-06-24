import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';

interface ReleaseNote {
  id: number;
  title: string;
  version: string | null;
  summary: string | null;
  content: string;
  publishedAt: string | null;
  createdAt: string;
}

const ReleaseNotes: React.FC = () => {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get('/release-notes')
      .then(res => setNotes(res.data || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const renderContent = (text: string) =>
    text.split(/\n\n+/).map((block, i) => (
      <p key={i} style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#c9c9e0', lineHeight: 1.75 }}>
        {block.split('\n').map((line, j) => (
          <React.Fragment key={j}>{j > 0 && <br />}{line}</React.Fragment>
        ))}
      </p>
    ));

  return (
    <AdminLayout>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>What's New</h1>
          <p style={{ margin: 0, fontSize: '0.92rem', color: '#6b6b80' }}>
            The latest features and improvements to your photo lab platform.
          </p>
        </div>

        {loading && (
          <div style={{ color: '#6b6b80', padding: '40px 0', textAlign: 'center' }}>Loading release notes…</div>
        )}

        {!loading && notes.length === 0 && (
          <div style={{ color: '#6b6b80', padding: '40px 0', textAlign: 'center' }}>No release notes yet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {notes.map((note, idx) => {
            const isOpen = expanded.has(note.id);
            const isLast = idx === notes.length - 1;
            return (
              <div key={note.id} style={{ display: 'flex', gap: 0 }}>
                {/* Timeline track */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: '2px solid #1a1a24', flexShrink: 0, marginTop: 6 }} />
                  {!isLast && <div style={{ width: 2, flex: 1, background: 'rgba(124,92,255,0.15)', minHeight: 24 }} />}
                </div>

                {/* Card */}
                <div style={{ flex: 1, paddingLeft: 16, paddingBottom: isLast ? 0 : 28 }}>
                  <div
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(124,92,255,0.12)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => toggle(note.id)}
                  >
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        {note.version && (
                          <span style={{ background: 'rgba(124,92,255,0.18)', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 800, padding: '2px 9px', borderRadius: 99, letterSpacing: '0.06em', border: '1px solid rgba(124,92,255,0.3)' }}>
                            {note.version}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>{formatDate(note.publishedAt || note.createdAt)}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.75rem', color: '#5a5a72', userSelect: 'none' }}>{isOpen ? '▲' : '▼'}</span>
                      </div>

                      <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{note.title}</h2>

                      {note.summary && (
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#8b8ba0', lineHeight: 1.6, fontStyle: 'italic' }}>{note.summary}</p>
                      )}
                    </div>

                    {isOpen && (
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(124,92,255,0.08)', paddingTop: 16 }}>
                        {renderContent(note.content)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
};

export default ReleaseNotes;
