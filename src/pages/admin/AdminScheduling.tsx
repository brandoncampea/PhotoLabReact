import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';

const card: React.CSSProperties = { background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.3)', padding: '1.75rem 2rem', marginBottom: '1.5rem' };
const sectionTitle: React.CSSProperties = { margin: '0 0 0.2rem 0', fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const label: React.CSSProperties = { display: 'block', marginBottom: 5, fontWeight: 600, color: '#bdbdbd', fontSize: '0.88rem' };
const inputStyle: React.CSSProperties = { width: '100%', background: '#18181f', border: '1px solid #3a3656', borderRadius: 8, color: '#e0e0e0', padding: '8px 12px', fontSize: '0.92rem', boxSizing: 'border-box' };
const btn = (color = '#7c5cff', disabled = false): React.CSSProperties => ({
  padding: '7px 16px', background: disabled ? '#333' : color, color: '#fff', border: 'none', borderRadius: 8,
  fontWeight: 700, fontSize: '0.82rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});
const dangerBtn: React.CSSProperties = { ...btn(), background: 'rgba(255,107,107,0.15)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)' };
const badge = (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: color + '22', color });

type SessionType = { id: number; name: string; description: string | null; durationMinutes: number; price: number; isActive: boolean; imageUrl?: string };
type AvailWindow = { from: string; to: string; lastStart: string };
type Slot = { id: number; date: string; startTime: string; endTime: string; location: string | null; staffName: string | null; notes: string | null; isActive: boolean; sessionTypeId: number | null; sessionTypeName: string | null; sessionTypeDuration: number | null; bufferBeforeMinutes: number; bufferAfterMinutes: number; availableWindows: AvailWindow[] };
type Booking = { id: number; customerName: string; customerEmail: string; customerPhone: string | null; customerNotes: string | null; status: string; requiresPayment: boolean; paymentAmount: number | null; paymentStatus: string | null; slotDate: string | null; startTime: string | null; endTime: string | null; location: string | null; staffName: string | null; sessionTypeName: string | null; sessionTypePrice: number | null; durationMinutes: number | null; rejectionReason: string | null; approvedAt: string | null; createdAt: string; studioPayoutAmount: number | null; platformFeeAmount: number | null; stripeFeeAmount: number | null };


const TABS = ['Session Types', 'Availability', 'Bookings'] as const;
type Tab = typeof TABS[number];

const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtDate = (d: string) => { const s = d ? d.split('T')[0] : ''; return s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

const statusColor: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444', cancelled: '#6b6b80' };

export default function AdminScheduling() {
  const { user } = useAuth();
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const studioId = user?.studioId || (user?.role === 'super_admin' ? Number(localStorage.getItem('viewAsStudioId')) || null : null);

  const [tab, setTab] = useState<Tab>('Bookings');
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Session type form
  const [stForm, setStForm] = useState({ name: '', description: '', durationMinutes: 60, price: 0, imageUrl: '' });
  const [editingSt, setEditingSt] = useState<SessionType | null>(null);
  const [showStForm, setShowStForm] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [feeConfig, setFeeConfig] = useState<{ feeType: string; feeValue: number } | null>(null);

  // Slot form — dates is an array so multiple dates can be added at once
  const emptySlotForm = { dates: [''], startTime: '', endTime: '', location: '', staffName: '', notes: '', sessionTypeId: '', bufferBefore: 0, bufferAfter: 0 };
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [showSlotForm, setShowSlotForm] = useState(false);

  // Manual booking form
  const emptyManualForm = { customerName: '', customerEmail: '', customerPhone: '', customerNotes: '', sessionTypeId: '', bookingDate: '', startTime: '', endTime: '', location: '', staffName: '', status: 'approved' };
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [showManualBooking, setShowManualBooking] = useState(false);

  // Booking actions
  const [approving, setApproving] = useState<number | null>(null);
  const [approveForm, setApproveForm] = useState({ requiresPayment: false, paymentAmount: '' });
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bookingFilter, setBookingFilter] = useState<string>('all');

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed
  const [calDay, setCalDay] = useState<string | null>(null); // 'YYYY-MM-DD'

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    try {
      const [stRes, slotRes, bkRes, feeRes] = await Promise.all([
        fetch(`/api/scheduling/studios/${studioId}/session-types`, { headers }),
        fetch(`/api/scheduling/studios/${studioId}/availability`, { headers }),
        fetch(`/api/scheduling/studios/${studioId}/bookings`, { headers }),
        fetch(`/api/scheduling/admin/fee-config`, { headers }),
      ]);
      if (stRes.ok) setSessionTypes(await stRes.json());
      if (slotRes.ok) setSlots(await slotRes.json());
      if (bkRes.ok) setBookings(await bkRes.json());
      if (feeRes.ok) { const fc = await feeRes.json(); setFeeConfig({ feeType: fc.feeType, feeValue: Number(fc.feeValue) }); }
    } catch { setError('Failed to load scheduling data'); }
    finally { setLoading(false); }
  }, [studioId]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  // ── Session Types ──
  const saveSt = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingSt ? 'PUT' : 'POST';
    const url = editingSt
      ? `/api/scheduling/studios/${studioId}/session-types/${editingSt.id}`
      : `/api/scheduling/studios/${studioId}/session-types`;
    const res = await fetch(url, { method, headers, body: JSON.stringify(stForm) });
    if (!res.ok) { const d = await res.json(); flash(d.error || 'Failed to save', true); return; }
    const saved = await res.json();
    const savedId = editingSt?.id ?? saved.id;
    // Upload pending image if any
    if (pendingImageFile && savedId) {
      setImageUploading(true);
      try {
        const fd = new FormData();
        fd.append('image', pendingImageFile);
        const imgRes = await fetch(`/api/scheduling/studios/${studioId}/session-types/${savedId}/image`, { method: 'POST', headers: { Authorization: headers.Authorization }, body: fd });
        if (!imgRes.ok) {
          const errData = await imgRes.json().catch(() => ({}));
          flash(`Image upload failed: ${errData.error || imgRes.status}`, true);
        }
      } finally { setImageUploading(false); }
    }
    flash('Session type saved');
    setShowStForm(false);
    setEditingSt(null);
    setStForm({ name: '', description: '', durationMinutes: 60, price: 0, imageUrl: '' });
    setPendingImageFile(null);
    load();
  };

  const deleteSt = async (id: number) => {
    if (!confirm('Delete this session type?')) return;
    const res = await fetch(`/api/scheduling/studios/${studioId}/session-types/${id}`, { method: 'DELETE', headers });
    if (res.ok) { load(); flash('Deleted'); } else flash('Failed to delete', true);
  };

  const editSt = (st: SessionType & { imageUrl?: string }) => {
    setEditingSt(st);
    setStForm({ name: st.name, description: st.description || '', durationMinutes: st.durationMinutes, price: st.price, imageUrl: (st as any).imageUrl || '' });
    setPendingImageFile(null);
    setShowStForm(true);
  };

  // ── Slots ──
  const saveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const base = {
      ...slotForm,
      sessionTypeId: slotForm.sessionTypeId ? Number(slotForm.sessionTypeId) : null,
      isActive: true,
      bufferBeforeMinutes: slotForm.bufferBefore,
      bufferAfterMinutes: slotForm.bufferAfter,
    };

    if (editingSlot) {
      const body = { ...base, date: slotForm.dates[0] };
      const res = await fetch(`/api/scheduling/studios/${studioId}/availability/${editingSlot.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) { flash('Slot updated'); setShowSlotForm(false); setEditingSlot(null); setSlotForm(emptySlotForm); load(); }
      else { const d = await res.json(); flash(d.error || 'Failed to save', true); }
      return;
    }

    const validDates = slotForm.dates.filter(d => d.trim());
    if (validDates.length === 0) { flash('At least one date is required', true); return; }

    let failed = 0;
    await Promise.all(validDates.map(date =>
      fetch(`/api/scheduling/studios/${studioId}/availability`, {
        method: 'POST', headers, body: JSON.stringify({ ...base, date }),
      }).then(r => { if (!r.ok) failed++; })
    ));
    if (failed > 0) flash(`${failed} window(s) failed to save`, true);
    else flash(`${validDates.length} availability window${validDates.length !== 1 ? 's' : ''} added`);

    setShowSlotForm(false);
    setSlotForm(emptySlotForm);
    load();
  };

  const deleteSlot = async (id: number) => {
    if (!confirm('Delete this slot?')) return;
    const res = await fetch(`/api/scheduling/studios/${studioId}/availability/${id}`, { method: 'DELETE', headers });
    if (res.ok) { load(); flash('Deleted'); } else { const d = await res.json(); flash(d.error || 'Failed to delete', true); }
  };

  const editSlot = (slot: Slot) => {
    setEditingSlot(slot);
    setSlotForm({ dates: [slot.date?.split('T')[0] || ''], startTime: slot.startTime, endTime: slot.endTime, location: slot.location || '', staffName: slot.staffName || '', notes: slot.notes || '', sessionTypeId: slot.sessionTypeId ? String(slot.sessionTypeId) : '', bufferBefore: slot.bufferBeforeMinutes || 0, bufferAfter: slot.bufferAfterMinutes || 0 });
    setShowSlotForm(true);
  };

  // ── Manual booking ──
  const submitManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.customerName || !manualForm.customerEmail) return;
    const res = await fetch(`/api/scheduling/studios/${studioId}/bookings`, {
      method: 'POST', headers,
      body: JSON.stringify({
        customerName: manualForm.customerName,
        customerEmail: manualForm.customerEmail,
        customerPhone: manualForm.customerPhone || null,
        customerNotes: manualForm.customerNotes || null,
        sessionTypeId: manualForm.sessionTypeId ? Number(manualForm.sessionTypeId) : null,
        bookingDate: manualForm.bookingDate || null,
        startTime: manualForm.startTime || null,
        endTime: manualForm.endTime || null,
        location: manualForm.location || null,
        staffName: manualForm.staffName || null,
        status: manualForm.status,
      }),
    });
    if (res.ok) { flash('Booking created'); setShowManualBooking(false); setManualForm(emptyManualForm); load(); }
    else { const d = await res.json(); flash(d.error || 'Failed to create booking', true); }
  };

  // ── Bookings ──
  const approveBooking = async (id: number) => {
    const res = await fetch(`/api/scheduling/studios/${studioId}/bookings/${id}/approve`, {
      method: 'POST', headers,
      body: JSON.stringify({ requiresPayment: approveForm.requiresPayment, paymentAmount: approveForm.requiresPayment ? Number(approveForm.paymentAmount) : 0 }),
    });
    const d = await res.json();
    if (res.ok) { flash('Booking approved' + (d.checkoutUrl ? ' — payment link sent to customer' : '')); setApproving(null); load(); }
    else flash(d.error || 'Failed to approve', true);
  };

  const rejectBooking = async (id: number) => {
    const res = await fetch(`/api/scheduling/studios/${studioId}/bookings/${id}/reject`, {
      method: 'POST', headers, body: JSON.stringify({ reason: rejectReason }),
    });
    if (res.ok) { flash('Booking rejected'); setRejecting(null); setRejectReason(''); load(); }
    else { const d = await res.json(); flash(d.error || 'Failed to reject', true); }
  };

  const filteredBookings = bookingFilter === 'all' ? bookings : bookings.filter(b => b.status === bookingFilter);
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  // Build day-keyed lookup for calendar (key = 'YYYY-MM-DD')
  const calSlotsByDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const k = s.date?.split('T')[0];
    if (k) { acc[k] = acc[k] || []; acc[k].push(s); }
    return acc;
  }, {});
  const calBookingsByDay = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    const k = b.slotDate?.split('T')[0];
    if (k) { acc[k] = acc[k] || []; acc[k].push(b); }
    return acc;
  }, {});

  if (!studioId) {
    return <AdminLayout><div style={{ padding: 40, color: '#a1a1aa' }}>No studio selected.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div style={{ minHeight: '100vh', background: '#181a1b', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={sectionTitle}>Scheduling</h1>
            <p style={{ color: '#a1a1aa', fontSize: '0.92rem', margin: '0.2rem 0 0 0' }}>
              Manage session types, available times, and booking requests
            </p>
          </div>

          {error && <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: '#1a2d1e', color: '#a3ffb3', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>{success}</div>}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '1px solid #3a3656', paddingBottom: 0 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '9px 20px', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #7c5cff' : '2px solid transparent',
                color: tab === t ? '#a78bfa' : '#6b6b80', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', marginBottom: -1, position: 'relative',
              }}>
                {t}
                {t === 'Bookings' && pendingCount > 0 && (
                  <span style={{ marginLeft: 6, background: '#7c5cff', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: '0.72rem' }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? <div style={{ color: '#a1a1aa' }}>Loading…</div> : (

            <>
              {/* ── SESSION TYPES TAB ── */}
              {tab === 'Session Types' && (
                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#e0e0e0', fontSize: '1.05rem' }}>Session Types</div>
                      <div style={{ color: '#6b6b80', fontSize: '0.82rem' }}>Define what kinds of sessions you offer</div>
                    </div>
                    <button style={btn()} onClick={() => { setEditingSt(null); setStForm({ name: '', description: '', durationMinutes: 60, price: 0, imageUrl: '' }); setPendingImageFile(null); setShowStForm(v => !v); }}>
                      + Add Type
                    </button>
                  </div>

                  {showStForm && (
                    <form onSubmit={saveSt} style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 12 }}>{editingSt ? 'Edit Session Type' : 'New Session Type'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div><label style={label}>Name *</label><input style={inputStyle} value={stForm.name} onChange={e => setStForm(f => ({ ...f, name: e.target.value }))} required /></div>
                        <div><label style={label}>Price ($)</label><input style={inputStyle} type="number" min="0" step="0.01" value={stForm.price} onChange={e => setStForm(f => ({ ...f, price: Number(e.target.value) }))} /></div>
                        <div><label style={label}>Duration (min)</label><input style={inputStyle} type="number" min="15" value={stForm.durationMinutes} onChange={e => setStForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} /></div>
                        <div><label style={label}>Description</label><input style={inputStyle} value={stForm.description} onChange={e => setStForm(f => ({ ...f, description: e.target.value }))} /></div>
                      </div>
                      {/* Image upload */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={label}>Cover Photo</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {(pendingImageFile ? URL.createObjectURL(pendingImageFile) : stForm.imageUrl) && (
                            <img
                              src={pendingImageFile ? URL.createObjectURL(pendingImageFile) : stForm.imageUrl}
                              alt="preview"
                              style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #3a3656' }}
                            />
                          )}
                          <label style={{ cursor: 'pointer', ...btn('#3a3656') }}>
                            {imageUploading ? 'Uploading…' : (stForm.imageUrl || pendingImageFile) ? 'Change Photo' : 'Upload Photo'}
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) setPendingImageFile(f);
                            }} />
                          </label>
                          {(stForm.imageUrl || pendingImageFile) && (
                            <button type="button" style={{ ...btn('#444'), fontSize: '0.75rem' }} onClick={() => { setStForm(f => ({ ...f, imageUrl: '' })); setPendingImageFile(null); }}>Remove</button>
                          )}
                        </div>
                        {!editingSt && pendingImageFile && <div style={{ color: '#6b6b80', fontSize: '0.75rem', marginTop: 4 }}>Image will be uploaded after saving.</div>}
                      </div>
                      {stForm.price > 0 && (() => {
                        const price = stForm.price;
                        const stripeFee = Math.round((price * 0.029 + 0.30) * 100) / 100;
                        const platformFee = feeConfig
                          ? (feeConfig.feeType === 'percentage'
                              ? Math.round(price * feeConfig.feeValue / 100 * 100) / 100
                              : Number(feeConfig.feeValue))
                          : 0;
                        const studioNet = Math.max(0, price - stripeFee - platformFee);
                        return (
                          <div style={{ background: '#13131c', border: '1px solid #3a3656', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.83rem' }}>
                            <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 8 }}>Fee Breakdown</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}>
                              <span style={{ color: '#bdbdbd' }}>Customer pays</span>
                              <span style={{ color: '#e0e0e0', fontWeight: 700, textAlign: 'right' }}>${price.toFixed(2)}</span>
                              <span style={{ color: '#6b6b80' }}>Stripe fee (est. 2.9% + $0.30)</span>
                              <span style={{ color: '#f59e0b', textAlign: 'right' }}>−${stripeFee.toFixed(2)}</span>
                              {platformFee > 0 && <>
                                <span style={{ color: '#6b6b80' }}>Platform fee ({feeConfig?.feeType === 'percentage' ? `${feeConfig.feeValue}%` : `$${feeConfig?.feeValue?.toFixed(2)}`})</span>
                                <span style={{ color: '#f59e0b', textAlign: 'right' }}>−${platformFee.toFixed(2)}</span>
                              </>}
                              <span style={{ color: '#bdbdbd', borderTop: '1px solid #3a3656', paddingTop: 6, marginTop: 2 }}>Studio net</span>
                              <span style={{ color: '#22c55e', fontWeight: 700, textAlign: 'right', borderTop: '1px solid #3a3656', paddingTop: 6, marginTop: 2 }}>${studioNet.toFixed(2)}</span>
                            </div>
                            {feeConfig === null && <div style={{ color: '#6b6b80', fontSize: '0.75rem', marginTop: 6 }}>No platform fee configured.</div>}
                          </div>
                        );
                      })()}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={btn()} disabled={imageUploading}>{imageUploading ? 'Saving…' : 'Save'}</button>
                        <button type="button" style={btn('#444')} onClick={() => { setShowStForm(false); setEditingSt(null); setPendingImageFile(null); }}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {sessionTypes.length === 0
                    ? <div style={{ color: '#6b6b80', fontSize: '0.9rem' }}>No session types yet. Add one above.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sessionTypes.map(st => (
                          <div key={st.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#29293a', borderRadius: 10, border: '1px solid #3a3656', padding: '10px 14px', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {st.imageUrl && <img src={st.imageUrl} alt={st.name} style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, border: '1px solid #3a3656', flexShrink: 0 }} />}
                              <div>
                                <div style={{ fontWeight: 700, color: '#e0e0e0' }}>{st.name}
                                  {!st.isActive && <span style={{ ...badge('#6b6b80'), marginLeft: 8 }}>Inactive</span>}
                                </div>
                                <div style={{ color: '#6b6b80', fontSize: '0.8rem', marginTop: 2 }}>
                                  {st.durationMinutes} min · ${Number(st.price).toFixed(2)}{st.description && ` · ${st.description}`}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button style={btn('#3a3656')} onClick={() => editSt(st)}>Edit</button>
                              <button style={dangerBtn} onClick={() => deleteSt(st.id)}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              )}

              {/* ── AVAILABILITY TAB ── */}
              {tab === 'Availability' && (
                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#e0e0e0', fontSize: '1.05rem' }}>Available Time Slots</div>
                      <div style={{ color: '#6b6b80', fontSize: '0.82rem' }}>Dates and times customers can request</div>
                    </div>
                    <button style={btn()} onClick={() => { setEditingSlot(null); setSlotForm(emptySlotForm); setShowSlotForm(v => !v); }}>
                      + Add Slot
                    </button>
                  </div>

                  {showSlotForm && (
                    <form onSubmit={saveSlot} style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 12 }}>{editingSlot ? 'Edit Slot' : 'New Slot'}</div>
                      {/* Dates — shown as a list when creating multiple slots */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={label}>
                          {editingSlot ? 'Date *' : 'Dates *'}
                          {!editingSlot && <span style={{ color: '#6b6b80', fontWeight: 400, marginLeft: 6 }}>one slot per date</span>}
                        </label>
                        {slotForm.dates.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <input
                              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                              type="date"
                              value={d}
                              onChange={e => setSlotForm(f => { const dates = [...f.dates]; dates[i] = e.target.value; return { ...f, dates }; })}
                              required={i === 0}
                            />
                            {!editingSlot && slotForm.dates.length > 1 && (
                              <button type="button" onClick={() => setSlotForm(f => ({ ...f, dates: f.dates.filter((_, j) => j !== i) }))}
                                style={{ background: '#2d1a1a', border: '1px solid #5a2a2a', color: '#ffb3b3', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.82rem' }}>
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        {!editingSlot && (
                          <button type="button" onClick={() => setSlotForm(f => ({ ...f, dates: [...f.dates, ''] }))}
                            style={{ background: 'none', border: '1px dashed #3a3656', color: '#7c5cff', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.82rem', marginTop: 2 }}>
                            + Add another date
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div><label style={label}>Window Start *</label><input style={inputStyle} type="time" value={slotForm.startTime} onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))} required /></div>
                        <div><label style={label}>Window End *</label><input style={inputStyle} type="time" value={slotForm.endTime} onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))} required /></div>
                        <div><label style={label}>Session Type</label>
                          <select style={inputStyle} value={slotForm.sessionTypeId} onChange={e => setSlotForm(f => ({ ...f, sessionTypeId: e.target.value }))}>
                            <option value="">Any / Not specified</option>
                            {sessionTypes.map(st => <option key={st.id} value={st.id}>{st.name} ({st.durationMinutes} min)</option>)}
                          </select>
                        </div>
                        <div><label style={label}>Buffer Before (min)</label><input style={inputStyle} type="number" min="0" step="5" value={slotForm.bufferBefore} onChange={e => setSlotForm(f => ({ ...f, bufferBefore: Number(e.target.value) }))} /></div>
                        <div><label style={label}>Buffer After (min)</label><input style={inputStyle} type="number" min="0" step="5" value={slotForm.bufferAfter} onChange={e => setSlotForm(f => ({ ...f, bufferAfter: Number(e.target.value) }))} /></div>
                        <div />
                        <div><label style={label}>Location</label><input style={inputStyle} value={slotForm.location} onChange={e => setSlotForm(f => ({ ...f, location: e.target.value }))} placeholder="Studio, park, etc." /></div>
                        <div><label style={label}>Assigned Staff</label><input style={inputStyle} value={slotForm.staffName} onChange={e => setSlotForm(f => ({ ...f, staffName: e.target.value }))} placeholder="Photographer name" /></div>
                        <div><label style={label}>Notes (internal)</label><input style={inputStyle} value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={btn()}>Save</button>
                        <button type="button" style={btn('#444')} onClick={() => { setShowSlotForm(false); setEditingSlot(null); }}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {slots.length === 0
                    ? <div style={{ color: '#6b6b80', fontSize: '0.9rem' }}>No slots added yet.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {slots.map(slot => (
                          <div key={slot.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#29293a', borderRadius: 10, border: '1px solid #3a3656', padding: '10px 14px', gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.92rem' }}>
                                {fmtDate(slot.date)} · {slot.startTime}–{slot.endTime}
                                {!slot.isActive && <span style={{ ...badge('#6b6b80'), marginLeft: 8 }}>Inactive</span>}
                              </div>
                              <div style={{ color: '#6b6b80', fontSize: '0.78rem', marginTop: 2 }}>
                                {[slot.sessionTypeName, slot.location, slot.staffName && `Staff: ${slot.staffName}`, (slot.bufferBeforeMinutes || slot.bufferAfterMinutes) && `${slot.bufferBeforeMinutes}m/${slot.bufferAfterMinutes}m buffer`, slot.availableWindows.length > 0 ? `${slot.availableWindows.length} window${slot.availableWindows.length !== 1 ? 's' : ''} available` : 'Fully booked'].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button style={btn('#3a3656')} onClick={() => editSlot(slot)}>Edit</button>
                              <button style={dangerBtn} onClick={() => deleteSlot(slot.id)}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              )}

              {/* ── BOOKINGS TAB ── */}
              {tab === 'Bookings' && (
                <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {['pending', 'approved', 'rejected', 'all'].map(f => (
                      <button key={f} onClick={() => setBookingFilter(f)} style={{
                        padding: '5px 14px', background: bookingFilter === f ? '#7c5cff' : '#23232a',
                        color: bookingFilter === f ? '#fff' : '#a1a1aa', border: '1px solid #3a3656',
                        borderRadius: 20, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                      }}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                        {f === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button style={btn()} onClick={() => setShowManualBooking(v => !v)}>+ Add Booking</button>
                  </div>

                  {/* Manual booking form */}
                  {showManualBooking && (
                    <form onSubmit={submitManualBooking} style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 12 }}>New Booking</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div><label style={label}>Customer Name *</label><input style={inputStyle} value={manualForm.customerName} onChange={e => setManualForm(f => ({ ...f, customerName: e.target.value }))} required placeholder="Full name" /></div>
                        <div><label style={label}>Customer Email *</label><input style={inputStyle} type="email" value={manualForm.customerEmail} onChange={e => setManualForm(f => ({ ...f, customerEmail: e.target.value }))} required placeholder="email@example.com" /></div>
                        <div><label style={label}>Phone</label><input style={inputStyle} type="tel" value={manualForm.customerPhone} onChange={e => setManualForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="(555) 000-0000" /></div>
                        <div><label style={label}>Date</label><input style={inputStyle} type="date" value={manualForm.bookingDate} onChange={e => setManualForm(f => ({ ...f, bookingDate: e.target.value }))} /></div>
                        <div><label style={label}>Start Time</label><input style={inputStyle} type="time" value={manualForm.startTime} onChange={e => setManualForm(f => ({ ...f, startTime: e.target.value }))} /></div>
                        <div><label style={label}>End Time</label><input style={inputStyle} type="time" value={manualForm.endTime} onChange={e => setManualForm(f => ({ ...f, endTime: e.target.value }))} /></div>
                        <div><label style={label}>Session Type</label>
                          <select style={inputStyle} value={manualForm.sessionTypeId} onChange={e => setManualForm(f => ({ ...f, sessionTypeId: e.target.value }))}>
                            <option value="">None</option>
                            {sessionTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                          </select>
                        </div>
                        <div><label style={label}>Location</label><input style={inputStyle} value={manualForm.location} onChange={e => setManualForm(f => ({ ...f, location: e.target.value }))} placeholder="Studio, park, etc." /></div>
                        <div><label style={label}>Staff</label><input style={inputStyle} value={manualForm.staffName} onChange={e => setManualForm(f => ({ ...f, staffName: e.target.value }))} placeholder="Photographer name" /></div>
                        <div style={{ gridColumn: '1 / 3' }}><label style={label}>Notes</label><input style={inputStyle} value={manualForm.customerNotes} onChange={e => setManualForm(f => ({ ...f, customerNotes: e.target.value }))} placeholder="Any notes…" /></div>
                        <div><label style={label}>Status</label>
                          <select style={inputStyle} value={manualForm.status} onChange={e => setManualForm(f => ({ ...f, status: e.target.value }))}>
                            <option value="approved">Approved</option>
                            <option value="pending">Pending</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={btn()}>Create Booking</button>
                        <button type="button" style={btn('#444')} onClick={() => { setShowManualBooking(false); setManualForm(emptyManualForm); }}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {filteredBookings.length === 0
                    ? <div style={{ ...card, color: '#6b6b80', textAlign: 'center', padding: '2rem' }}>No {bookingFilter === 'all' ? '' : bookingFilter + ' '}bookings.</div>
                    : filteredBookings.map(bk => (
                        <div key={bk.id} style={{ ...card, padding: '1.25rem 1.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#e0e0e0', fontSize: '1rem' }}>{bk.customerName}</span>
                                <span style={badge(statusColor[bk.status] || '#a1a1aa')}>{bk.status}</span>
                                {bk.paymentStatus && <span style={badge(bk.paymentStatus === 'paid' ? '#22c55e' : '#f59e0b')}>{bk.paymentStatus}</span>}
                                {bk.requiresPayment && bk.paymentStatus === 'pending' && (
                                  <button style={{ background: 'none', border: '1px solid #3a3656', borderRadius: 6, color: '#6b6b80', fontSize: '0.72rem', padding: '2px 8px', cursor: 'pointer' }}
                                    onClick={async () => {
                                      const res = await fetch(`/api/scheduling/studios/${studioId}/bookings/${bk.id}/check-payment`, { method: 'POST', headers });
                                      const d = await res.json();
                                      if (d.paid) { flash('Payment confirmed — refreshing'); load(); }
                                      else flash('Payment not yet received', true);
                                    }}>
                                    Sync Payment
                                  </button>
                                )}
                              </div>
                              <div style={{ color: '#6b6b80', fontSize: '0.82rem', marginTop: 4 }}>
                                {bk.customerEmail}{bk.customerPhone && ` · ${bk.customerPhone}`}
                              </div>
                              {bk.slotDate && (
                                <div style={{ color: '#bdbdbd', fontSize: '0.85rem', marginTop: 4 }}>
                                  {fmtDate(bk.slotDate)} · {bk.startTime}{bk.endTime && `–${bk.endTime}`}
                                  {bk.location && ` · ${bk.location}`}
                                  {bk.staffName && ` · ${bk.staffName}`}
                                </div>
                              )}
                              {bk.sessionTypeName && <div style={{ color: '#a78bfa', fontSize: '0.8rem', marginTop: 2 }}>{bk.sessionTypeName}{bk.durationMinutes && ` · ${bk.durationMinutes} min`}</div>}
                              {bk.customerNotes && <div style={{ color: '#6b6b80', fontSize: '0.8rem', marginTop: 4, fontStyle: 'italic' }}>"{bk.customerNotes}"</div>}
                              {bk.studioPayoutAmount != null && (
                                <div style={{ color: '#6b6b80', fontSize: '0.75rem', marginTop: 4 }}>
                                  Payout: ${Number(bk.studioPayoutAmount).toFixed(2)}
                                  {bk.platformFeeAmount != null && ` · Platform: $${Number(bk.platformFeeAmount).toFixed(2)}`}
                                  {bk.stripeFeeAmount != null && ` · Stripe: $${Number(bk.stripeFeeAmount).toFixed(2)}`}
                                </div>
                              )}
                              <div style={{ color: '#4a4a5a', fontSize: '0.72rem', marginTop: 4 }}>Requested {fmt(bk.createdAt)}</div>
                            </div>

                            {bk.status === 'pending' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                <button style={btn('#22c55e')} onClick={() => { setApproving(bk.id); setApproveForm({ requiresPayment: false, paymentAmount: String(bk.sessionTypePrice || '') }); setRejecting(null); }}>Approve</button>
                                <button style={dangerBtn} onClick={() => { setRejecting(bk.id); setApproving(null); setRejectReason(''); }}>Reject</button>
                              </div>
                            )}
                          </div>

                          {/* Approve panel */}
                          {approving === bk.id && (
                            <div style={{ marginTop: 14, background: '#1a2d1e', border: '1px solid #22c55e44', borderRadius: 10, padding: '1rem' }}>
                              <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: 10 }}>Approve Booking</div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                                <input type="checkbox" checked={approveForm.requiresPayment} onChange={e => setApproveForm(f => ({ ...f, requiresPayment: e.target.checked }))} />
                                <span style={{ color: '#bdbdbd', fontSize: '0.9rem' }}>Require payment before confirming</span>
                              </label>
                              {approveForm.requiresPayment && (
                                <div style={{ marginBottom: 10 }}>
                                  <label style={label}>Payment Amount ($)</label>
                                  <input style={{ ...inputStyle, width: 160 }} type="number" min="0" step="0.01" value={approveForm.paymentAmount} onChange={e => setApproveForm(f => ({ ...f, paymentAmount: e.target.value }))} />
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button style={btn('#22c55e')} onClick={() => approveBooking(bk.id)}>Confirm Approval</button>
                                <button style={btn('#444')} onClick={() => setApproving(null)}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {/* Reject panel */}
                          {rejecting === bk.id && (
                            <div style={{ marginTop: 14, background: '#2d1a1a', border: '1px solid #ef444444', borderRadius: 10, padding: '1rem' }}>
                              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 10 }}>Reject Booking</div>
                              <label style={label}>Reason (optional — sent to customer)</label>
                              <input style={{ ...inputStyle, marginBottom: 10 }} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Slot no longer available" />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button style={btn('#ef4444')} onClick={() => rejectBooking(bk.id)}>Confirm Reject</button>
                                <button style={btn('#444')} onClick={() => setRejecting(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                  }
                </div>
              )}

            </>
          )}

          {/* ── CALENDAR (always visible below tabs) ── */}
          {!loading && (() => {
            const pad = (n: number) => String(n).padStart(2, '0');
            const firstDay = new Date(calYear, calMonth, 1).getDay();
            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
            const monthName = new Date(calYear, calMonth, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
            const cells: Array<string | null> = [
              ...Array(firstDay).fill(null),
              ...Array.from({ length: daysInMonth }, (_, i) => `${calYear}-${pad(calMonth + 1)}-${pad(i + 1)}`),
            ];
            while (cells.length % 7 !== 0) cells.push(null);
            const daySlots = calDay ? (calSlotsByDay[calDay] || []) : [];
            const dayBookings = calDay ? (calBookingsByDay[calDay] || []) : [];
            return (
              <div style={card}>
                <div style={{ fontWeight: 800, color: '#e0e0e0', fontSize: '1rem', marginBottom: 14 }}>Calendar</div>

                {/* Month nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <button style={btn('#3a3656')} onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setCalDay(null); }}>‹</button>
                  <span style={{ fontWeight: 700, color: '#a78bfa', flex: 1, textAlign: 'center' }}>{monthName}</span>
                  <button style={btn('#3a3656')} onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setCalDay(null); }}>›</button>
                </div>

                {/* Day-of-week headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ textAlign: 'center', color: '#6b6b80', fontSize: '0.75rem', fontWeight: 700, padding: '4px 0' }}>{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {cells.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dayNum = parseInt(day.split('-')[2]);
                    const hasSlots = !!calSlotsByDay[day]?.length;
                    const bks = calBookingsByDay[day] || [];
                    const hasPending = bks.some(b => b.status === 'pending');
                    const hasApproved = bks.some(b => b.status === 'approved');
                    const isSelected = calDay === day;
                    const isToday = day === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                    return (
                      <button key={day} onClick={() => setCalDay(isSelected ? null : day)} style={{
                        background: isSelected ? '#3a2a6a' : isToday ? '#1e1a2e' : '#1a1a24',
                        border: `1px solid ${isSelected ? '#7c5cff' : isToday ? '#4a3a7a' : '#2a2a3a'}`,
                        borderRadius: 8, padding: '6px 4px', cursor: 'pointer', textAlign: 'center', minHeight: 52,
                      }}>
                        <div style={{ color: isToday ? '#a78bfa' : '#e0e0e0', fontWeight: isToday ? 800 : 400, fontSize: '0.85rem', marginBottom: 4 }}>{dayNum}</div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
                          {hasSlots && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c5cff', display: 'inline-block' }} title="Available slots" />}
                          {hasPending && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} title="Pending bookings" />}
                          {hasApproved && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} title="Approved bookings" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
                  {[['#7c5cff', 'Available slots'], ['#f59e0b', 'Pending bookings'], ['#22c55e', 'Approved bookings']].map(([color, lbl]) => (
                    <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b6b80' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {lbl}
                    </div>
                  ))}
                </div>

                {/* Day detail panel */}
                {calDay && (daySlots.length > 0 || dayBookings.length > 0) && (
                  <div style={{ marginTop: 20, borderTop: '1px solid #3a3656', paddingTop: 16 }}>
                    <div style={{ fontWeight: 800, color: '#a78bfa', marginBottom: 12 }}>
                      {new Date(calDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    {daySlots.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, color: '#bdbdbd', fontSize: '0.82rem', marginBottom: 6 }}>Available Slots</div>
                        {daySlots.map(s => (
                          <div key={s.id} style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: '0.85rem', color: '#e0e0e0' }}>
                            {s.startTime}–{s.endTime}
                            {s.sessionTypeName && <span style={{ color: '#a78bfa', marginLeft: 6 }}>· {s.sessionTypeName}</span>}
                            {s.location && <span style={{ color: '#6b6b80', marginLeft: 6 }}>· {s.location}</span>}
                            {s.staffName && <span style={{ color: '#6b6b80', marginLeft: 6 }}>· {s.staffName}</span>}
                            <span style={{ color: '#4a4a5a', marginLeft: 6 }}>· {s.availableWindows.length > 0 ? `${s.availableWindows.length} window${s.availableWindows.length !== 1 ? 's' : ''} open` : 'Fully booked'}</span>
                            {!s.isActive && <span style={{ ...badge('#6b6b80'), marginLeft: 8 }}>Inactive</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {dayBookings.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, color: '#bdbdbd', fontSize: '0.82rem', marginBottom: 6 }}>Bookings</div>
                        {dayBookings.map(b => (
                          <div key={b.id} style={{ background: '#1a1a24', border: `1px solid ${statusColor[b.status] || '#3a3656'}44`, borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#e0e0e0' }}>{b.customerName}</span>
                              <span style={badge(statusColor[b.status] || '#a1a1aa')}>{b.status}</span>
                              {b.paymentStatus && <span style={badge(b.paymentStatus === 'paid' ? '#22c55e' : '#f59e0b')}>{b.paymentStatus}</span>}
                            </div>
                            <div style={{ color: '#6b6b80', fontSize: '0.78rem', marginTop: 3 }}>
                              {b.customerEmail}{b.customerPhone && ` · ${b.customerPhone}`}
                              {b.startTime && ` · ${b.startTime}${b.endTime ? '–' + b.endTime : ''}`}
                              {b.sessionTypeName && ` · ${b.sessionTypeName}`}
                            </div>
                            {b.customerNotes && <div style={{ color: '#6b6b80', fontSize: '0.75rem', fontStyle: 'italic', marginTop: 2 }}>"{b.customerNotes}"</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {calDay && daySlots.length === 0 && dayBookings.length === 0 && (
                  <div style={{ marginTop: 20, borderTop: '1px solid #3a3656', paddingTop: 16, color: '#6b6b80', fontSize: '0.88rem' }}>
                    No slots or bookings on this day.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </AdminLayout>
  );
}
