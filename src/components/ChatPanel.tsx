import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ChatMessage {
  id: number;
  studioId: number;
  senderId: number;
  senderRole: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface StudioThread {
  id: number;
  name: string;
  unreadCount: number;
  online: boolean;
  lastMessageAt: string | null;
}

const getToken = () => {
  const t = localStorage.getItem('authToken');
  return t && t !== 'null' && t !== 'undefined' ? t : null;
};

const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const ChatPanel: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isStudioAdmin = user?.role === 'studio_admin';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [studios, setStudios] = useState<StudioThread[]>([]);
  const [selectedStudioId, setSelectedStudioId] = useState<number | null>(null);
  const [onlineStudios, setOnlineStudios] = useState<Set<number>>(new Set());
  const [superAdminOnline, setSuperAdminOnline] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [studioAdminUnread, setStudioAdminUnread] = useState(0);
  const [hasArchived, setHasArchived] = useState(false);
  const [studioFilter, setStudioFilter] = useState('');

  // Refs so SSE handler always sees current values without stale closures
  const openRef = useRef(false);
  const selectedStudioIdRef = useRef<number | null>(null);
  const userRef = useRef(user);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { selectedStudioIdRef.current = selectedStudioId; }, [selectedStudioId]);
  useEffect(() => { userRef.current = user; }, [user]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (open) setTimeout(scrollToBottom, 50);
  }, [messages, open]);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const r = await fetch(`/api/chat/${sid}/messages`, { headers: authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      setMessages(d.messages || []);
      setHasArchived(!!d.hasArchived);
    } catch {}
  }, []);

  const markRead = useCallback(async (sid: number) => {
    try {
      await fetch(`/api/chat/${sid}/read`, {
        method: 'POST',
        headers: authHeaders(),
      });
    } catch {}
  }, []);

  const loadStudios = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const r = await fetch('/api/chat/studios', { headers: authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      setStudios(d.studios || []);
    } catch {}
  }, [isSuperAdmin]);

  // SSE connection with automatic reconnect
  useEffect(() => {
    if (!user || (!isSuperAdmin && !isStudioAdmin)) return;

    let cancelled = false;
    let abort: AbortController | null = null;

    const handleEvent = (event: any) => {
      const u = userRef.current;
      if (!u) return;

      if (event.type === 'connected') {
        if (event.onlineStudios) {
          setOnlineStudios(new Set(event.onlineStudios.map(Number)));
        }
        if (event.superAdminOnline != null) {
          setSuperAdminOnline(!!event.superAdminOnline);
        }
      } else if (event.type === 'presence') {
        const sid = Number(event.studioId);
        if (sid) {
          setOnlineStudios(prev => {
            const next = new Set(prev);
            event.studioOnline ? next.add(sid) : next.delete(sid);
            return next;
          });
          setStudios(prev =>
            prev.map(s => s.id === sid ? { ...s, online: !!event.studioOnline } : s)
          );
        }
        if (event.superAdminOnline != null) {
          setSuperAdminOnline(!!event.superAdminOnline);
        }
      } else if (event.type === 'message') {
        const msg = event as ChatMessage & { type: string };
        const viewingSid = u.role === 'super_admin'
          ? selectedStudioIdRef.current
          : Number(u.studioId) || null;

        if (msg.studioId === viewingSid) {
          setMessages(prev =>
            prev.find(m => m.id === msg.id) ? prev : [...prev, msg]
          );
        }

        // Update unread count / badge
        if (msg.senderId !== u.id) {
          if (u.role === 'super_admin') {
            const isViewingAndOpen = openRef.current && msg.studioId === selectedStudioIdRef.current;
            if (!isViewingAndOpen) {
              setStudios(prev =>
                prev.map(s =>
                  s.id === msg.studioId
                    ? { ...s, unreadCount: s.unreadCount + 1, lastMessageAt: msg.createdAt }
                    : s
                )
              );
            }
          } else {
            if (!openRef.current) setStudioAdminUnread(v => v + 1);
          }
        }
      }
    };

    const connect = async () => {
      while (!cancelled) {
        try {
          abort = new AbortController();
          const token = getToken();
          const res = await fetch('/api/chat/events', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: abort.signal,
          });

          if (!res.ok || !res.body) throw new Error('SSE connect failed');

          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';

          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop()!;
            for (const part of parts) {
              const line = part.split('\n').find(l => l.startsWith('data: '));
              if (!line) continue;
              try { handleEvent(JSON.parse(line.slice(6))); } catch {}
            }
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || cancelled) break;
        }
        if (!cancelled) await new Promise(r => setTimeout(r, 3000));
      }
    };

    connect();

    if (isSuperAdmin) loadStudios();
    if (isStudioAdmin && user.studioId) loadMessages(user.studioId);

    return () => {
      cancelled = true;
      abort?.abort();
    };
  }, [user?.id, user?.role]);

  const selectStudio = async (sid: number) => {
    setSelectedStudioId(sid);
    await loadMessages(sid);
    await markRead(sid);
    setStudios(prev => prev.map(s => s.id === sid ? { ...s, unreadCount: 0 } : s));
  };

  const openPanel = async () => {
    setOpen(true);
    if (isStudioAdmin && user?.studioId) {
      await markRead(user.studioId);
      setStudioAdminUnread(0);
    }
    if (isSuperAdmin) await loadStudios();
  };

  const sendMessage = async () => {
    const sid = isSuperAdmin ? selectedStudioId : user?.studioId;
    const content = input.trim();
    if (!sid || !content || sending) return;
    setSending(true);
    setInput('');
    try {
      await fetch(`/api/chat/${sid}/messages`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!user || (!isSuperAdmin && !isStudioAdmin)) return null;

  const totalUnread = isSuperAdmin
    ? studios.reduce((s, st) => s + st.unreadCount, 0)
    : studioAdminUnread;

  const panelWidth = isSuperAdmin ? 480 : 360;

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          aria-label="Open chat"
          onClick={openPanel}
          style={{
            position: 'fixed',
            bottom: 96,
            right: 28,
            zIndex: 1200,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 56,
            height: 56,
            boxShadow: '0 2px 16px #2563eb55',
            fontSize: 24,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          💬
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              minWidth: 18,
              height: 18,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 1300,
          background: '#1e1e2e',
          borderRadius: 16,
          boxShadow: '0 8px 40px #0009',
          width: panelWidth,
          maxWidth: 'calc(100vw - 32px)',
          height: 520,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #2d2d50',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #2d2d50',
            background: '#16162a',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e2f0' }}>
              {isSuperAdmin ? 'Studio Chat' : 'Support Chat'}
            </span>
            {isStudioAdmin && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: superAdminOnline ? '#4ade80' : '#777' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: superAdminOnline ? '#4ade80' : '#444',
                  display: 'inline-block',
                }} />
                {superAdminOnline ? 'Support online' : 'Support offline'}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#777', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}
              aria-label="Close chat"
            >×</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Super admin studio list */}
            {isSuperAdmin && (
              <div style={{
                width: 160,
                borderRight: '1px solid #2d2d50',
                display: 'flex',
                flexDirection: 'column',
                background: '#181828',
                flexShrink: 0,
              }}>
                <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid #222238', flexShrink: 0 }}>
                  <input
                    value={studioFilter}
                    onChange={e => setStudioFilter(e.target.value)}
                    placeholder="Filter studios…"
                    style={{
                      width: '100%',
                      background: '#252540',
                      border: '1px solid #3a3a60',
                      borderRadius: 6,
                      padding: '5px 8px',
                      color: '#e2e2f0',
                      fontSize: 11,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(() => {
                    const filtered = studioFilter.trim()
                      ? studios.filter(s => s.name.toLowerCase().includes(studioFilter.toLowerCase()))
                      : studios;
                    if (filtered.length === 0) return (
                      <div style={{ padding: '16px 12px', color: '#555', fontSize: 12 }}>
                        {studioFilter.trim() ? 'No match' : 'No studios yet'}
                      </div>
                    );
                    return filtered.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectStudio(s.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          background: selectedStudioId === s.id ? '#252545' : 'none',
                          border: 'none',
                          borderBottom: '1px solid #222238',
                          cursor: 'pointer',
                          color: '#e2e2f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: (onlineStudios.has(s.id) || s.online) ? '#4ade80' : '#444',
                            flexShrink: 0,
                          }} />
                          <span style={{
                            fontSize: 12,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>{s.name}</span>
                          {s.unreadCount > 0 && (
                            <span style={{
                              background: '#2563eb',
                              color: '#fff',
                              borderRadius: 10,
                              padding: '1px 6px',
                              fontSize: 10,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}>{s.unreadCount}</span>
                          )}
                        </div>
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Messages + input */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Empty state for super admin with no studio selected */}
              {isSuperAdmin && !selectedStudioId ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>
                  Select a studio to start chatting
                </div>
              ) : (
                <>
                  {/* Archived banner */}
                  {hasArchived && (
                    <div style={{ padding: '6px 14px', background: '#1a1a35', borderBottom: '1px solid #2d2d50', fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span>📁</span>
                      <span>Older messages archived to <a href="/admin/tickets" style={{ color: '#a78bfa', textDecoration: 'none' }}>tickets</a>.</span>
                    </div>
                  )}

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {messages.length === 0 && (
                      <div style={{ margin: 'auto', color: '#555', fontSize: 13 }}>No messages yet — say hello!</div>
                    )}
                    {messages.map(msg => {
                      const own = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
                          <div style={{
                            maxWidth: '78%',
                            background: own ? '#2563eb' : '#252545',
                            color: '#f0f0ff',
                            borderRadius: own ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            padding: '8px 12px',
                            fontSize: 13,
                          }}>
                            {!own && (
                              <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginBottom: 2 }}>{msg.senderName}</div>
                            )}
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3, textAlign: 'right' }}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div style={{
                    borderTop: '1px solid #2d2d50',
                    padding: '10px 12px',
                    display: 'flex',
                    gap: 8,
                    background: '#16162a',
                    flexShrink: 0,
                  }}>
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message…"
                      disabled={sending}
                      maxLength={2000}
                      style={{
                        flex: 1,
                        background: '#252540',
                        border: '1px solid #3a3a60',
                        borderRadius: 8,
                        padding: '7px 12px',
                        color: '#e2e2f0',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !input.trim()}
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '7px 16px',
                        cursor: sending || !input.trim() ? 'default' : 'pointer',
                        opacity: sending || !input.trim() ? 0.45 : 1,
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPanel;
