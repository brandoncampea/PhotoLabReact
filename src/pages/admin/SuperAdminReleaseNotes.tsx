import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';

interface ReleaseNote {
  id: number;
  title: string;
  version: string;
  summary: string;
  content: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Draft {
  version: string;
  title: string;
  summary: string;
  content: string;
}

const EMPTY_FORM = { title: '', version: '', summary: '', content: '', published: false };

const SuperAdminReleaseNotes: React.FC = () => {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; sentTo?: number; error?: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingDraftIdx, setSavingDraftIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/release-notes/all');
      setNotes(res.data || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const startEdit = (note: ReleaseNote) => {
    setEditingId(note.id);
    setForm({
      title: note.title,
      version: note.version || '',
      summary: note.summary || '',
      content: note.content,
      published: note.published,
    });
    setFormError('');
  };

  const cancelEdit = () => { setEditingId(null); setFormError(''); };

  const generate = async () => {
    setGenerating(true);
    setGenerateError('');
    setDrafts([]);
    try {
      const res = await api.post('/release-notes/generate', {});
      const incoming: Draft[] = res.data.drafts || [];
      if (!incoming.length) {
        setGenerateError(res.data.message || 'No new commits found since last release note.');
      } else {
        setDrafts(incoming);
      }
    } catch (err: any) {
      setGenerateError(err?.response?.data?.error || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const editDraft = (draft: Draft) => {
    setEditingId('new');
    setForm({ title: draft.title, version: draft.version, summary: draft.summary, content: draft.content, published: false });
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveDraft = async (draft: Draft, idx: number) => {
    setSavingDraftIdx(idx);
    try {
      await api.post('/release-notes', { ...draft, published: true });
      setDrafts(prev => prev.filter((_, i) => i !== idx));
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to save draft.');
    } finally {
      setSavingDraftIdx(null);
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('Title and content are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingId === 'new') {
        await api.post('/release-notes', form);
      } else {
        await api.put(`/release-notes/${editingId}`, form);
      }
      setEditingId(null);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: number) => {
    if (!window.confirm('Delete this release note?')) return;
    setDeleting(id);
    try {
      await api.delete(`/release-notes/${id}`);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      await load();
    } catch {
      alert('Failed to delete.');
    } finally {
      setDeleting(null);
    }
  };

  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAll = () => setSelected(new Set(notes.map(n => n.id)));
  const clearAll = () => setSelected(new Set());

  const openEmailModal = () => {
    setSendResult(null);
    setEmailSubject('What\'s New in Photo Lab');
    setShowEmailModal(true);
  };

  const sendEmail = async () => {
    if (!emailSubject.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await api.post('/release-notes/send-email', {
        noteIds: Array.from(selected),
        subject: emailSubject.trim(),
      });
      setSendResult({ ok: true, sentTo: res.data.sentTo });
    } catch (err: any) {
      setSendResult({ ok: false, error: err?.response?.data?.error || 'Failed to send.' });
    } finally {
      setSending(false);
    }
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(124,92,255,0.2)',
    borderRadius: 8, color: '#e2e2f0', fontSize: '0.9rem', padding: '8px 12px',
    outline: 'none',
  };

  const selectedNotes = notes.filter(n => selected.has(n.id));

  return (
    <AdminLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>Release Notes</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b6b80' }}>
              Auto-generated on each server start from git history. Select notes to email studio admins.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selected.size > 0 && (
              <button
                onClick={openEmailModal}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.88rem', padding: '8px 16px', cursor: 'pointer' }}
              >
                📧 Email {selected.size} Release{selected.size !== 1 ? 's' : ''} to Studios
              </button>
            )}
            <button
              onClick={generate}
              disabled={generating}
              title="Manually check for new commits and generate notes (also runs automatically on each server start)"
              style={{ background: generating ? 'rgba(88,216,163,0.08)' : 'rgba(88,216,163,0.12)', border: '1px solid rgba(88,216,163,0.3)', borderRadius: 8, color: '#58d8a3', fontWeight: 700, fontSize: '0.88rem', padding: '8px 16px', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}
            >
              {generating ? '⏳ Checking…' : '🔄 Check for New'}
            </button>
            <button
              onClick={startNew}
              style={{ background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 8, color: '#a78bfa', fontWeight: 700, fontSize: '0.88rem', padding: '8px 16px', cursor: 'pointer' }}
            >
              + New Release Note
            </button>
          </div>
        </div>

        {/* New / Edit form */}
        {editingId !== null && (
          <div style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.25)', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#a78bfa' }}>
              {editingId === 'new' ? 'New Release Note' : 'Edit Release Note'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Title *</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Saved Photos & Favorites" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Version</label>
                <input style={inputStyle} value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. v2.4" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Summary <span style={{ color: '#5a5a72', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(1–2 sentences shown in preview)</span></label>
              <input style={inputStyle} value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="Customers can now save photos to a personal favorites list…" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Detailed Content * <span style={{ color: '#5a5a72', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(blank lines = new paragraph)</span>
              </label>
              <textarea
                style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'inherit' }}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Write a thorough explanation of this feature — what it does, how studio admins and customers can use it, and what benefit it provides. Be specific so studios understand the value immediately."
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', color: '#c9c9e0' }}>
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={e => setForm(f => ({ ...f, published: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                />
                Publish immediately (visible to studio admins)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b6b80', fontWeight: 600, fontSize: '0.88rem', padding: '7px 14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.88rem', padding: '7px 14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
            {formError && <p style={{ margin: '10px 0 0', color: '#f87171', fontSize: '0.85rem' }}>{formError}</p>}
          </div>
        )}

        {/* Generate error */}
        {generateError && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: '0.85rem' }}>
            {generateError}
          </div>
        )}

        {/* Generated drafts */}
        {drafts.length > 0 && (
          <div style={{ background: 'rgba(88,216,163,0.06)', border: '1px solid rgba(88,216,163,0.2)', borderRadius: 14, padding: '20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#58d8a3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>✨ Newly Generated</span>
              <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>— review each draft, then save & publish or edit first</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {drafts.map((draft, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(88,216,163,0.15)', borderRadius: 10, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ background: 'rgba(88,216,163,0.15)', color: '#58d8a3', fontSize: '0.7rem', fontWeight: 800, padding: '2px 9px', borderRadius: 99, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{draft.version}</span>
                        <span style={{ fontWeight: 700, color: '#e2e2f0', fontSize: '0.95rem' }}>{draft.title}</span>
                      </div>
                      {draft.summary && <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#8b8ba0', fontStyle: 'italic', lineHeight: 1.5 }}>{draft.summary}</p>}
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#5a5a72', lineHeight: 1.6 }}>
                        {draft.content.slice(0, 220)}{draft.content.length > 220 ? '…' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => editDraft(draft)}
                        style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 7, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 600, padding: '5px 10px', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => saveDraft(draft, idx)}
                        disabled={savingDraftIdx === idx}
                        style={{ background: 'rgba(88,216,163,0.12)', border: '1px solid rgba(88,216,163,0.3)', borderRadius: 7, color: '#58d8a3', fontSize: '0.78rem', fontWeight: 700, padding: '5px 10px', cursor: savingDraftIdx === idx ? 'not-allowed' : 'pointer', opacity: savingDraftIdx === idx ? 0.6 : 1 }}
                      >
                        {savingDraftIdx === idx ? 'Saving…' : 'Save & Publish'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selection toolbar */}
        {notes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: '0.8rem', color: '#6b6b80' }}>{selected.size} selected</span>
            <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#7c5cff', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>Select all</button>
            {selected.size > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#6b6b80', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>Clear</button>}
          </div>
        )}

        {/* Notes list */}
        {loading && <div style={{ color: '#6b6b80', padding: '40px 0', textAlign: 'center' }}>Loading…</div>}
        {!loading && notes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#5a5a72' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#8b8ba0' }}>No release notes yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Click "New Release Note" to create your first one.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(note => (
            <div
              key={note.id}
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${selected.has(note.id) ? 'rgba(124,92,255,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'border-color 0.15s' }}
            >
              <input
                type="checkbox"
                checked={selected.has(note.id)}
                onChange={() => toggleSelect(note.id)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: '#7c3aed', flexShrink: 0, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  {note.version && (
                    <span style={{ background: 'rgba(124,92,255,0.15)', color: '#a78bfa', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>{note.version}</span>
                  )}
                  <span style={{ background: note.published ? 'rgba(126,231,135,0.12)' : 'rgba(255,166,87,0.12)', color: note.published ? '#7ee787' : '#ffa657', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                    {note.published ? '● Published' : '○ Draft'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#5a5a72' }}>{formatDate(note.publishedAt || note.createdAt)}</span>
                </div>
                <div style={{ fontWeight: 700, color: '#e2e2f0', fontSize: '0.95rem', marginBottom: 2 }}>{note.title}</div>
                {note.summary && <div style={{ fontSize: '0.82rem', color: '#6b6b80', lineHeight: 1.5 }}>{note.summary}</div>}
                {!note.summary && (
                  <div style={{ fontSize: '0.82rem', color: '#4a4a6a', lineHeight: 1.5, fontStyle: 'italic' }}>
                    {note.content.slice(0, 100)}{note.content.length > 100 ? '…' : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => startEdit(note)}
                  style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 7, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 600, padding: '5px 10px', cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  disabled={deleting === note.id}
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', fontSize: '0.78rem', fontWeight: 600, padding: '5px 10px', cursor: 'pointer' }}
                >
                  {deleting === note.id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Email modal */}
        {showEmailModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: '#1a1a24', border: '1px solid rgba(124,92,255,0.25)', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>Send Release Notes Email</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b6b80' }}>{selectedNotes.length} release note{selectedNotes.length !== 1 ? 's' : ''} selected · BCC'd to all studio admins</p>
                </div>
                <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: '#6b6b80', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Subject</label>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, color: '#e2e2f0', fontSize: '0.9rem', padding: '9px 12px', outline: 'none' }}
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="What's New in Photo Lab"
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: '#8b8ba0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Selected Releases</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {selectedNotes.map(note => (
                    <div key={note.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {note.version && <span style={{ background: 'rgba(124,92,255,0.15)', color: '#a78bfa', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>{note.version}</span>}
                        <span style={{ fontWeight: 700, color: '#e2e2f0', fontSize: '0.9rem' }}>{note.title}</span>
                      </div>
                      {note.summary && <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b6b80', fontStyle: 'italic' }}>{note.summary}</p>}
                      <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#4a4a6a', lineHeight: 1.5 }}>
                        {note.content.slice(0, 180)}{note.content.length > 180 ? '…' : ''}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.15)', borderRadius: 10, padding: '12px 16px', fontSize: '0.82rem', color: '#8b8ba0', lineHeight: 1.6 }}>
                  <strong style={{ color: '#a78bfa' }}>What gets sent:</strong> A styled HTML email will be delivered to all studio admin accounts (BCC). Each selected release note appears as a section with title, date, summary, and full detailed content — exactly as you wrote it.
                </div>

                {sendResult && (
                  <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, background: sendResult.ok ? 'rgba(126,231,135,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${sendResult.ok ? 'rgba(126,231,135,0.3)' : 'rgba(239,68,68,0.3)'}`, color: sendResult.ok ? '#7ee787' : '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
                    {sendResult.ok ? `✓ Sent to ${sendResult.sentTo} studio admin${(sendResult.sentTo ?? 0) !== 1 ? 's' : ''}` : `✗ ${sendResult.error}`}
                  </div>
                )}
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setShowEmailModal(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b6b80', fontWeight: 600, fontSize: '0.88rem', padding: '8px 16px', cursor: 'pointer' }}>
                  {sendResult?.ok ? 'Close' : 'Cancel'}
                </button>
                {!sendResult?.ok && (
                  <button
                    onClick={sendEmail}
                    disabled={sending || !emailSubject.trim()}
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.88rem', padding: '8px 20px', cursor: sending || !emailSubject.trim() ? 'not-allowed' : 'pointer', opacity: sending || !emailSubject.trim() ? 0.6 : 1 }}
                  >
                    {sending ? 'Sending…' : `Send to All Studios`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default SuperAdminReleaseNotes;
