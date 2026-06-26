import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type AvailWindow = { from: string; to: string; lastStart: string };
type Availability = {
  id: number;
  date: string;
  windowStart: string;
  windowEnd: string;
  sessionTypeId: number | null;
  sessionTypeName: string | null;
  sessionDuration: number | null;
  bufferBefore: number;
  bufferAfter: number;
  location: string | null;
  staffName: string | null;
  availableWindows: AvailWindow[];
};
type SessionType = { id: number; name: string; description: string | null; durationMinutes: number; price: number; imageUrl?: string | null };

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3rem 1rem 4rem' };
const wrapWide: React.CSSProperties = { ...wrap, alignItems: 'flex-start' };
const card: React.CSSProperties = { background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, padding: '2rem', width: '100%', maxWidth: 580, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' };
const heading: React.CSSProperties = { background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 800, fontSize: '1.5rem', margin: '0 0 0.3rem 0' };
const sub: React.CSSProperties = { color: '#a1a1aa', fontSize: '0.9rem', margin: '0 0 1.5rem 0' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontWeight: 600, color: '#bdbdbd', fontSize: '0.88rem' };
const inputStyle: React.CSSProperties = { width: '100%', background: '#18181f', border: '1px solid #3a3656', borderRadius: 8, color: '#e0e0e0', padding: '9px 12px', fontSize: '0.92rem', boxSizing: 'border-box', marginBottom: 14 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '11px', background: '#7c5cff', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: 4 };
const divider: React.CSSProperties = { borderTop: '1px solid #3a3656', margin: '1.25rem 0' };
const ghostBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#6b6b80', cursor: 'pointer', fontSize: '0.82rem', padding: 0 };

// SQL Server DATE columns come back as full ISO strings — extract just YYYY-MM-DD
function toDateStr(d: string): string {
  if (!d) return '';
  return d.split('T')[0];
}

const fmtDate = (d: string) => {
  const clean = toDateStr(d);
  if (!clean) return '';
  return new Date(clean + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const fmtDateShort = (d: string) => {
  const clean = toDateStr(d);
  if (!clean) return '';
  return new Date(clean + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
};

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isTimeInWindows(time: string, windows: AvailWindow[]) {
  const tMin = toMin(time);
  return windows.some(w => tMin >= toMin(w.from) && tMin <= toMin(w.lastStart));
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function BookingPage() {
  const { studioSlug } = useParams<{ studioSlug: string }>();
  const { user } = useAuth();
  const [studioName, setStudioName] = useState('');
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [selectedType, setSelectedType] = useState<SessionType | null>(null);
  const [selectedAvail, setSelectedAvail] = useState<Availability | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [step, setStep] = useState<'type' | 'slot' | 'form' | 'done' | 'request' | 'requestDone'>('type');
  const defaultName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
  const [form, setForm] = useState({ name: defaultName, email: user?.email || '', phone: '', notes: '' });
  const [reqForm, setReqForm] = useState({ name: defaultName, email: user?.email || '', phone: '', sessionType: '', preferredDate: '', preferredTime: '', location: '', notes: '' });
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [timeError, setTimeError] = useState('');

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calFilter, setCalFilter] = useState<string | null>(null); // 'YYYY-MM-DD' or null = show all
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/scheduling/public/${studioSlug}/info`)
      .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json(); })
      .then(d => {
        setStudioName(d.name || '');
        setSessionTypes(d.sessionTypes || []);
        if (!d.sessionTypes?.length) {
          loadSlots(null);
          setStep('slot');
        }
      })
      .catch(() => setError('Failed to load studio info'));
  }, [studioSlug]);

  const loadSlots = (typeId: number | null) => {
    setLoadingSlots(true);
    const url = typeId
      ? `/api/scheduling/public/${studioSlug}/slots?sessionTypeId=${typeId}`
      : `/api/scheduling/public/${studioSlug}/slots`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const avails: Availability[] = (Array.isArray(d) ? d : []).map((a: Availability) => ({
          ...a,
          date: toDateStr(a.date),
        }));
        setAvailabilities(avails);
        // Advance calendar to first available month if it's in the future
        if (avails.length > 0) {
          const firstDate = new Date(avails[0].date + 'T00:00:00');
          if (firstDate > today) {
            setCalYear(firstDate.getFullYear());
            setCalMonth(firstDate.getMonth());
          }
        }
      })
      .catch(() => setError('Failed to load available times'))
      .finally(() => setLoadingSlots(false));
  };

  const selectType = (st: SessionType | null) => {
    setSelectedType(st);
    setSelectedAvail(null);
    setSelectedTime('');
    setCalFilter(null);
    loadSlots(st?.id ?? null);
    setStep('slot');
  };

  const selectAvail = (avail: Availability) => {
    setSelectedAvail(avail);
    setSelectedTime('');
    setTimeError('');
  };

  const confirmTime = () => {
    if (!selectedAvail || !selectedTime) return;
    if (!isTimeInWindows(selectedTime, selectedAvail.availableWindows)) {
      setTimeError('That time is not available. Please choose a time within one of the windows shown.');
      return;
    }
    setTimeError('');
    setStep('form');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !selectedAvail || !selectedTime) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/scheduling/public/${studioSlug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityId: selectedAvail.id,
          sessionTypeId: selectedType?.id ?? selectedAvail.sessionTypeId ?? null,
          startTime: selectedTime,
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone || null,
          customerNotes: form.notes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed to submit'); return; }
      setStep('done');
    } catch { setError('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqForm.name || !reqForm.email) return;
    setReqSubmitting(true);
    setReqError('');
    try {
      const res = await fetch(`/api/scheduling/public/${studioSlug}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: reqForm.name,
          customerEmail: reqForm.email,
          customerPhone: reqForm.phone || null,
          sessionTypeName: reqForm.sessionType || null,
          preferredDate: reqForm.preferredDate || null,
          preferredTime: reqForm.preferredTime || null,
          preferredLocation: reqForm.location || null,
          customerNotes: reqForm.notes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setReqError(d.error || 'Failed to submit'); return; }
      setStep('requestDone');
    } catch { setReqError('Network error. Please try again.'); }
    finally { setReqSubmitting(false); }
  };

  // Build set of available date strings for the calendar
  const availDateSet = new Set(availabilities.map(a => a.date));

  // Calendar helpers
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const handleCalDayClick = (dateStr: string) => {
    if (!availDateSet.has(dateStr)) return;
    setCalFilter(prev => prev === dateStr ? null : dateStr);
    // Auto-select if exactly one availability on that day
    const dayAvails = availabilities.filter(a => a.date === dateStr);
    if (dayAvails.length === 1) {
      selectAvail(dayAvails[0]);
    } else {
      setSelectedAvail(null);
      setSelectedTime('');
    }
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const visibleAvails = calFilter
    ? availabilities.filter(a => a.date === calFilter)
    : availabilities;

  const stepNums = sessionTypes.length > 0 ? { type: 1, slot: 2, form: 3 } : { type: 0, slot: 1, form: 2 };

  if (step === 'done') {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={heading}>Request Received!</h1>
          <p style={{ color: '#bdbdbd', lineHeight: 1.6 }}>
            Thanks{form.name ? `, ${form.name}` : ''}! Your booking request with <strong style={{ color: '#e0e0e0' }}>{studioName}</strong> has been submitted.
            You'll receive a confirmation email and hear back once the studio reviews your request.
          </p>
          {selectedAvail && selectedTime && (
            <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 10, padding: '12px 16px', marginTop: 16 }}>
              <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>Requested time</div>
              <div style={{ color: '#e0e0e0' }}>{fmtDate(selectedAvail.date)}</div>
              <div style={{ color: '#bdbdbd', fontSize: '0.88rem' }}>
                {fmtTime(selectedTime)}
                {selectedAvail.sessionDuration && ` (${selectedAvail.sessionDuration} min)`}
                {selectedAvail.location && ` · ${selectedAvail.location}`}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'requestDone') {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={heading}>Request Sent!</h1>
          <p style={{ color: '#bdbdbd', lineHeight: 1.6 }}>
            Thanks{reqForm.name ? `, ${reqForm.name}` : ''}! Your session request with <strong style={{ color: '#e0e0e0' }}>{studioName}</strong> has been received.
            The studio will review your request and follow up to confirm details.
          </p>
          {(reqForm.preferredDate || reqForm.sessionType || reqForm.location) && (
            <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 10, padding: '12px 16px', marginTop: 16 }}>
              <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>Your request</div>
              {reqForm.sessionType && <div style={{ color: '#bdbdbd', fontSize: '0.88rem', marginBottom: 2 }}>{reqForm.sessionType}</div>}
              {reqForm.preferredDate && <div style={{ color: '#e0e0e0' }}>{fmtDate(reqForm.preferredDate)}</div>}
              {reqForm.preferredTime && <div style={{ color: '#bdbdbd', fontSize: '0.88rem' }}>{fmtTime(reqForm.preferredTime)}</div>}
              {reqForm.location && <div style={{ color: '#bdbdbd', fontSize: '0.88rem' }}>{reqForm.location}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 1: session type grid — dark mode
  if (step === 'type' && sessionTypes.length > 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#13131c', padding: '3.5rem 2rem 5rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 0 0.25rem' }}>{studioName}</h1>
            <p style={{ color: '#6b6b80', fontSize: '0.95rem', margin: 0 }}>Choose a session type to get started</p>
          </div>
          {error && <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '0.9rem' }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
            {sessionTypes.map(st => (
              <button key={st.id} onClick={() => selectType(st)} style={{
                background: '#1e1e28', border: '1px solid #2e2e3e', borderRadius: 12,
                cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.transform = 'translateY(-4px)'; b.style.boxShadow = '0 10px 36px rgba(124,92,255,0.25)'; b.style.borderColor = '#7c5cff'; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.transform = ''; b.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)'; b.style.borderColor = '#2e2e3e'; }}
              >
                {/* Photo */}
                <div style={{ width: '100%', aspectRatio: '4/3', background: '#0e0e18', overflow: 'hidden', flexShrink: 0 }}>
                  {st.imageUrl
                    ? <img src={st.imageUrl} alt={st.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3656', fontSize: '2.5rem' }}>📷</div>
                  }
                </div>
                {/* Info */}
                <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <div style={{ fontWeight: 700, color: '#e0e0f0', fontSize: '1.05rem', marginBottom: st.description ? 6 : 0 }}>{st.name}</div>
                  {st.description && (
                    <div style={{ color: '#8888a0', fontSize: '0.83rem', lineHeight: 1.6, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {st.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', borderTop: '1px solid #2e2e3e', paddingTop: 14, marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7070a0', fontSize: '0.82rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>{st.durationMinutes < 60 ? `${st.durationMinutes} min` : st.durationMinutes === 60 ? '1 hour' : `${(st.durationMinutes / 60).toFixed(st.durationMinutes % 60 === 0 ? 0 : 1)} hr`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7070a0', fontSize: '0.82rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 7v10M9.5 9.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-.9 2-2.5 2-2.5.9-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2"/></svg>
                      <span>{Number(st.price) > 0 ? `$${Number(st.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Free'}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {/* Show all times option */}
            <button onClick={() => selectType(null)} style={{
              background: 'transparent', border: '2px dashed #2e2e3e', borderRadius: 12,
              cursor: 'pointer', textAlign: 'center', padding: '3rem 1.5rem',
              color: '#4a4a6a', fontSize: '0.88rem', fontWeight: 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#a78bfa'; b.style.borderColor = '#7c5cff'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#4a4a6a'; b.style.borderColor = '#2e2e3e'; }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Not sure? Show all available times
            </button>
          </div>
          <div style={{ marginTop: 28, background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.22)', borderRadius: 14, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, color: '#e0e0f0', fontSize: '0.97rem', marginBottom: 4 }}>Need a specific date or time?</div>
              <div style={{ color: '#8888a0', fontSize: '0.85rem', lineHeight: 1.5 }}>Don't see a time that works? Submit a request and the studio will reach out to confirm a date, time, and details.</div>
            </div>
            <button onClick={() => setStep('request')} style={{ padding: '10px 20px', background: '#7c5cff', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', flexShrink: 0 }}>
              Request Custom Date →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={heading}>{step === 'request' ? 'Request a Session' : 'Book a Session'}</h1>
        <p style={sub}>{studioName || 'Loading…'}</p>

        {error && <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.9rem' }}>{error}</div>}

        {/* Step indicator */}
        {step !== 'request' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem' }}>
          {sessionTypes.length > 0 && (
            <div style={{ fontSize: '0.78rem', color: step === 'type' ? '#a78bfa' : '#4a4a5a', fontWeight: 700, cursor: 'pointer' }} onClick={() => setStep('type')}>
              {stepNums.type}. Session
            </div>
          )}
          <div style={{ fontSize: '0.78rem', color: step === 'slot' ? '#a78bfa' : '#4a4a5a', fontWeight: 700 }}>
            {stepNums.slot}. Time
          </div>
          <div style={{ fontSize: '0.78rem', color: step === 'form' ? '#a78bfa' : '#4a4a5a', fontWeight: 700 }}>
            {stepNums.form}. Your Info
          </div>
        </div>
        )}

        {/* Step 2: Pick date + time */}
        {step === 'slot' && (
          <div>
            {selectedType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ background: 'rgba(124,92,255,0.15)', color: '#a78bfa', padding: '3px 10px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700 }}>{selectedType.name} · {selectedType.durationMinutes} min</span>
                {sessionTypes.length > 0 && <button onClick={() => setStep('type')} style={ghostBtn}>← Change</button>}
              </div>
            )}

            {loadingSlots
              ? <div style={{ color: '#6b6b80' }}>Loading available times…</div>
              : availabilities.length === 0
                ? <div style={{ color: '#6b6b80' }}>No available times right now. Check back soon.</div>
                : (
                  <>
                    {/* Calendar */}
                    <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 12, padding: '14px', marginBottom: 16 }}>
                      {/* Month nav */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <button onClick={prevMonth} style={{ ...ghostBtn, fontSize: '1.1rem', color: '#a78bfa', padding: '2px 8px' }}>‹</button>
                        <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.9rem' }}>{MONTHS[calMonth]} {calYear}</div>
                        <button onClick={nextMonth} style={{ ...ghostBtn, fontSize: '1.1rem', color: '#a78bfa', padding: '2px 8px' }}>›</button>
                      </div>
                      {/* Day headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                        {DAYS.map(d => (
                          <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: '#4a4a5a', fontWeight: 700, padding: '2px 0' }}>{d}</div>
                        ))}
                      </div>
                      {/* Day cells */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                        {/* Empty cells for first week offset */}
                        {Array.from({ length: firstDayOfMonth }, (_, i) => (
                          <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const hasAvail = availDateSet.has(dateStr);
                          const isToday = dateStr === todayStr;
                          const isSelected = calFilter === dateStr;
                          return (
                            <button
                              key={day}
                              onClick={() => handleCalDayClick(dateStr)}
                              disabled={!hasAvail}
                              style={{
                                background: isSelected ? '#7c5cff' : hasAvail ? 'rgba(124,92,255,0.15)' : 'none',
                                border: isToday ? '1px solid #7c5cff' : isSelected ? '1px solid #7c5cff' : '1px solid transparent',
                                borderRadius: 6,
                                color: isSelected ? '#fff' : hasAvail ? '#a78bfa' : '#3a3a4a',
                                fontWeight: hasAvail ? 700 : 400,
                                fontSize: '0.82rem',
                                padding: '5px 2px',
                                cursor: hasAvail ? 'pointer' : 'default',
                                textAlign: 'center',
                                position: 'relative',
                              }}
                            >
                              {day}
                              {hasAvail && !isSelected && (
                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#7c5cff', margin: '2px auto 0' }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {calFilter && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: 600 }}>Showing {fmtDateShort(calFilter)}</span>
                          <button onClick={() => { setCalFilter(null); setSelectedAvail(null); }} style={{ ...ghostBtn, fontSize: '0.78rem' }}>Show all dates</button>
                        </div>
                      )}
                    </div>

                    {/* Availability list */}
                    <div style={{ fontWeight: 700, color: '#e0e0e0', marginBottom: 8, fontSize: '0.9rem' }} ref={listRef}>
                      {calFilter ? `Available times on ${fmtDateShort(calFilter)}` : 'All available dates'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                      {visibleAvails.map(avail => {
                        const isSelected = selectedAvail?.id === avail.id;
                        return (
                          <div key={avail.id} style={{
                            background: isSelected ? 'rgba(124,92,255,0.1)' : '#1a1a24',
                            border: `1px solid ${isSelected ? '#7c5cff' : '#3a3656'}`,
                            borderRadius: 10, overflow: 'hidden',
                          }}>
                            <button onClick={() => selectAvail(avail)} style={{
                              width: '100%', background: 'none', border: 'none', padding: '11px 14px',
                              cursor: 'pointer', textAlign: 'left',
                            }}>
                              <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.92rem' }}>{fmtDate(avail.date)}</div>
                              <div style={{ color: '#6b6b80', fontSize: '0.8rem', marginTop: 2 }}>
                                Window: {fmtTime(avail.windowStart)}–{fmtTime(avail.windowEnd)}
                                {avail.sessionTypeName && ` · ${avail.sessionTypeName}`}
                                {avail.location && ` · ${avail.location}`}
                                {avail.staffName && ` · ${avail.staffName}`}
                              </div>
                              {avail.availableWindows.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {avail.availableWindows.map((w, i) => (
                                    <span key={i} style={{ background: 'rgba(124,92,255,0.15)', color: '#a78bfa', fontSize: '0.72rem', padding: '2px 7px', borderRadius: 12, fontWeight: 600 }}>
                                      {fmtTime(w.from)}–{fmtTime(w.to)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </button>

                            {isSelected && (
                              <div style={{ padding: '0 14px 14px', borderTop: '1px solid #3a3656' }}>
                                <div style={{ paddingTop: 12 }}>
                                  <label style={{ ...labelStyle, marginBottom: 4 }}>
                                    Your start time *
                                    {avail.sessionDuration && <span style={{ color: '#6b6b80', fontWeight: 400 }}> ({avail.sessionDuration} min session)</span>}
                                  </label>
                                  <div style={{ color: '#6b6b80', fontSize: '0.78rem', marginBottom: 8 }}>
                                    Available: {avail.availableWindows.map(w => `${fmtTime(w.from)} – ${fmtTime(w.lastStart)}`).join(', ')}
                                  </div>
                                  <input
                                    style={{ ...inputStyle, marginBottom: timeError ? 6 : 14 }}
                                    type="time"
                                    value={selectedTime}
                                    onChange={e => { setSelectedTime(e.target.value); setTimeError(''); }}
                                  />
                                  {timeError && <div style={{ color: '#ffb3b3', fontSize: '0.8rem', marginBottom: 10 }}>{timeError}</div>}
                                  <button
                                    onClick={confirmTime}
                                    disabled={!selectedTime}
                                    style={{ ...primaryBtn, opacity: selectedTime ? 1 : 0.5, cursor: selectedTime ? 'pointer' : 'not-allowed', marginTop: 0 }}
                                  >
                                    Confirm Time →
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
            }
            {!loadingSlots && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #2e2e3e', textAlign: 'center' }}>
                <div style={{ color: '#6b6b80', fontSize: '0.82rem', marginBottom: 8 }}>Don't see a time that works for you?</div>
                <button onClick={() => setStep('request')} style={{ background: 'none', border: '1px solid #3a3656', borderRadius: 8, color: '#a78bfa', fontSize: '0.82rem', fontWeight: 600, padding: '6px 14px', cursor: 'pointer' }}>
                  Request a Custom Date →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Contact form */}
        {step === 'form' && (
          <form onSubmit={submit}>
            {selectedAvail && selectedTime && (
              <>
                <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.82rem', marginBottom: 2 }}>Selected time</div>
                  <div style={{ color: '#e0e0e0', fontSize: '0.9rem' }}>{fmtDate(selectedAvail.date)} · {fmtTime(selectedTime)}</div>
                  {selectedAvail.sessionDuration && <div style={{ color: '#6b6b80', fontSize: '0.82rem' }}>{selectedAvail.sessionDuration} min session</div>}
                  {selectedAvail.location && <div style={{ color: '#6b6b80', fontSize: '0.82rem' }}>{selectedAvail.location}</div>}
                </div>
                <button type="button" onClick={() => setStep('slot')} style={{ ...ghostBtn, marginBottom: 14 }}>← Change time</button>
                <div style={divider} />
              </>
            )}
            <label style={labelStyle}>Your Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Full name" />
            <label style={labelStyle}>Email *</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="you@example.com" />
            <label style={labelStyle}>Phone <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
            <label style={labelStyle}>Notes <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything the studio should know…" />
            <button type="submit" style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Request Booking'}
            </button>
            <p style={{ color: '#4a4a5a', fontSize: '0.78rem', textAlign: 'center', marginTop: 10 }}>
              Your request will be reviewed by the studio. No payment is collected at this step.
            </p>
          </form>
        )}

        {/* Step: Custom request form */}
        {step === 'request' && (
          <form onSubmit={submitRequest}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => setStep(sessionTypes.length > 0 ? 'type' : 'slot')} style={ghostBtn}>← Back</button>
              <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.9rem' }}>Custom Session Request</span>
            </div>
            <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.8rem', marginBottom: 3 }}>How it works</div>
              <div style={{ color: '#8888a0', fontSize: '0.82rem', lineHeight: 1.55 }}>Tell us what you're looking for and when. The studio will review your request and reach out to confirm the date, time, and payment details.</div>
            </div>
            {reqError && <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.9rem' }}>{reqError}</div>}
            <label style={labelStyle}>Your Name *</label>
            <input style={inputStyle} value={reqForm.name} onChange={e => setReqForm(f => ({ ...f, name: e.target.value }))} required placeholder="Full name" />
            <label style={labelStyle}>Email *</label>
            <input style={inputStyle} type="email" value={reqForm.email} onChange={e => setReqForm(f => ({ ...f, email: e.target.value }))} required placeholder="you@example.com" />
            <label style={labelStyle}>Phone <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} type="tel" value={reqForm.phone} onChange={e => setReqForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
            <label style={labelStyle}>Type of session <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} value={reqForm.sessionType} onChange={e => setReqForm(f => ({ ...f, sessionType: e.target.value }))} placeholder="e.g. Family portraits, headshots, graduation…" />
            <label style={labelStyle}>Preferred date <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={{ ...inputStyle, colorScheme: 'dark' }} type="date" value={reqForm.preferredDate} onChange={e => setReqForm(f => ({ ...f, preferredDate: e.target.value }))} />
            <label style={labelStyle}>Preferred time <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={{ ...inputStyle, colorScheme: 'dark' }} type="time" value={reqForm.preferredTime} onChange={e => setReqForm(f => ({ ...f, preferredTime: e.target.value }))} />
            <label style={labelStyle}>Preferred location <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} value={reqForm.location} onChange={e => setReqForm(f => ({ ...f, location: e.target.value }))} placeholder="Studio, outdoor park, specific address…" />
            <label style={labelStyle}>Notes <span style={{ color: '#4a4a5a', fontWeight: 400 }}>(optional)</span></label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} value={reqForm.notes} onChange={e => setReqForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything else the studio should know…" />
            <button type="submit" style={{ ...primaryBtn, opacity: reqSubmitting ? 0.6 : 1, cursor: reqSubmitting ? 'not-allowed' : 'pointer' }} disabled={reqSubmitting}>
              {reqSubmitting ? 'Submitting…' : 'Send Request'}
            </button>
            <p style={{ color: '#4a4a5a', fontSize: '0.78rem', textAlign: 'center', marginTop: 10 }}>
              No payment is collected now. The studio will reach out to confirm details.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
