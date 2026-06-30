import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query, columnExists } = mssql;
import { authRequired } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';
import { uploadImageBufferToAzure, getSignedReadUrl } from '../services/azureStorage.js';

// Returns a usable image URL: signs Azure blob paths, passes through local /uploads paths
function resolveImageUrl(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('/') || rawUrl.startsWith('http')) return rawUrl; // local or already full URL
  try { return getSignedReadUrl(rawUrl); } catch { return rawUrl; }
}

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

const APP_URL = () =>
  String(process.env.APP_BASE_URL || process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com').trim().replace(/\/$/, '');

// ─── Time helpers ─────────────────────────────────────────────────────────────
function toMin(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toTimeStr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/**
 * Given an availability window and existing bookings, return the free sub-windows
 * in which a new session of `durationMin` minutes can start.
 * Each booking's blocked zone = [bookingStart - bufferBefore, bookingEnd + bufferAfter].
 */
function computeAvailableWindows(windowStart, windowEnd, durationMin, bufferBefore, bufferAfter, bookings) {
  const wStart = toMin(windowStart);
  const wEnd   = toMin(windowEnd);
  if (wEnd - wStart < durationMin) return [];

  // Build and merge blocked intervals
  const blocked = bookings
    .map(b => ({ start: toMin(b.startTime) - bufferBefore, end: toMin(b.endTime) + bufferAfter }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const blk of blocked) {
    if (!merged.length || blk.start >= merged[merged.length - 1].end) merged.push({ ...blk });
    else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, blk.end);
  }

  // Subtract blocked from window to get free intervals
  const free = [];
  let cursor = wStart;
  for (const blk of merged) {
    if (blk.start > cursor) free.push({ start: cursor, end: Math.min(blk.start, wEnd) });
    cursor = Math.max(cursor, blk.end);
  }
  if (cursor < wEnd) free.push({ start: cursor, end: wEnd });

  // Only keep windows that can fit a full session; return start range
  return free
    .filter(w => w.end - w.start >= durationMin)
    .map(w => ({ from: toTimeStr(w.start), to: toTimeStr(w.end), lastStart: toTimeStr(w.end - durationMin) }));
}

function canManageStudio(user, studioId) {
  return user.role === 'super_admin' ||
    (user.role === 'studio_admin' && Number(user.studio_id) === Number(studioId));
}

// ─── SESSION TYPES ────────────────────────────────────────────────────────────

// Module-level flags for optional columns
let imageUrlColumnReady = false;
let retainerColumnsReady = false;

(async () => {
  // image_url on session types
  try {
    if (!await columnExists('scheduling_session_types', 'image_url')) {
      await query(`ALTER TABLE scheduling_session_types ADD image_url NVARCHAR(1024) NULL`);
      console.log('[scheduling] image_url column added');
    }
    imageUrlColumnReady = true;
  } catch (e) { console.warn('[scheduling] image_url migration failed:', e.message); }

  // Fix: re-activate session types accidentally set to is_active=0
  try {
    await query(`UPDATE scheduling_session_types SET is_active = 1 WHERE is_active = 0 OR is_active IS NULL`);
  } catch (e) { console.warn('[scheduling] session type reactivation skipped:', e.message); }

  // Retainer / balance columns
  try {
    if (!await columnExists('scheduling_session_types', 'retainer_amount'))
      await query(`ALTER TABLE scheduling_session_types ADD retainer_amount DECIMAL(10,2) NULL`);
    if (!await columnExists('scheduling_bookings', 'balance_amount'))
      await query(`ALTER TABLE scheduling_bookings ADD balance_amount DECIMAL(10,2) NULL`);
    if (!await columnExists('scheduling_bookings', 'balance_payment_status'))
      await query(`ALTER TABLE scheduling_bookings ADD balance_payment_status NVARCHAR(50) NULL`);
    if (!await columnExists('scheduling_bookings', 'balance_payment_method'))
      await query(`ALTER TABLE scheduling_bookings ADD balance_payment_method NVARCHAR(50) NULL`);
    if (!await columnExists('scheduling_bookings', 'balance_stripe_session_id'))
      await query(`ALTER TABLE scheduling_bookings ADD balance_stripe_session_id NVARCHAR(255) NULL`);
    retainerColumnsReady = true;
    console.log('[scheduling] retainer columns ready');
  } catch (e) { console.warn('[scheduling] retainer migrations failed:', e.message); }
})();

router.get('/studios/:studioId/session-types', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const imgCol = imageUrlColumnReady ? ', image_url as imageUrl' : ', NULL as imageUrl';
    const retCol = retainerColumnsReady ? ', retainer_amount as retainerAmount' : ', NULL as retainerAmount';
    const types = await queryRows(
      `SELECT id, name, description, duration_minutes as durationMinutes, price, is_active as isActive${imgCol}${retCol}, created_at as createdAt
       FROM scheduling_session_types WHERE studio_id = $1 ORDER BY name`,
      [studioId]
    );
    res.json(types.map(t => ({ ...t, imageUrl: resolveImageUrl(t.imageUrl) })));
  } catch (err) {
    console.error('[scheduling] session-types list:', err);
    res.status(500).json({ error: 'Failed to fetch session types' });
  }
});

router.post('/studios/:studioId/session-types', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { name, description, durationMinutes, price, retainerAmount } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const retCol = retainerColumnsReady ? ', retainer_amount' : '';
    const retVal = retainerColumnsReady ? ', $6' : '';
    const params = [studioId, name, description || null, durationMinutes || 60, price || 0];
    if (retainerColumnsReady) params.push(retainerAmount > 0 ? retainerAmount : null);
    const row = await queryRow(
      `INSERT INTO scheduling_session_types (studio_id, name, description, duration_minutes, price${retCol})
       VALUES ($1, $2, $3, $4, $5${retVal}) RETURNING id`,
      params
    );
    res.status(201).json({ id: row.id, name, description, durationMinutes: durationMinutes || 60, price: price || 0, isActive: true, retainerAmount: retainerAmount || null });
  } catch (err) {
    console.error('[scheduling] session-type create:', err);
    res.status(500).json({ error: 'Failed to create session type' });
  }
});

router.put('/studios/:studioId/session-types/:id', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { name, description, durationMinutes, price, isActive, retainerAmount } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const retSet = retainerColumnsReady ? ', retainer_amount = $8' : '';
    const params = [name, description || null, Number(durationMinutes) || 60, Number(price) || 0, isActive ? 1 : 0, id, studioId];
    if (retainerColumnsReady) params.push(retainerAmount > 0 ? Number(retainerAmount) : null);
    await query(
      `UPDATE scheduling_session_types SET name = $1, description = $2, duration_minutes = $3, price = $4, is_active = $5${retSet}
       WHERE id = $6 AND studio_id = $7`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] session-type update:', err);
    res.status(500).json({ error: 'Failed to update session type' });
  }
});

router.post('/studios/:studioId/session-types/:id/image', authRequired, imageUpload.single('image'), async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  try {
    // Resize to 400px wide thumbnail before storing
    const resized = await sharp(req.file.buffer)
      .resize(400, null, { withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    let imageUrl;
    // Try Azure Storage first, fall back to local disk
    try {
      const blobName = `session-types/${studioId}/${id}-${Date.now()}.jpg`;
      imageUrl = await uploadImageBufferToAzure(resized, blobName, 'image/jpeg');
    } catch (azureErr) {
      console.warn('[scheduling] Azure upload failed, falling back to local disk:', azureErr.message);
      const { promises: fs } = await import('fs');
      const { dirname, join } = await import('path');
      const { fileURLToPath } = await import('url');
      const routeDir = dirname(fileURLToPath(import.meta.url));
      const dir = join(routeDir, '..', 'uploads', 'session-types');
      await fs.mkdir(dir, { recursive: true });
      const filename = `${studioId}-${id}-${Date.now()}.jpg`;
      await fs.writeFile(join(dir, filename), resized);
      imageUrl = `/uploads/session-types/${filename}`;
    }
    // Ensure column exists before UPDATE (in case startup migration hadn't run yet)
    if (!imageUrlColumnReady) {
      try {
        const exists = await columnExists('scheduling_session_types', 'image_url');
        if (!exists) {
          await query(`ALTER TABLE scheduling_session_types ADD image_url NVARCHAR(1024) NULL`);
        }
        imageUrlColumnReady = true;
      } catch (ddlErr) {
        console.warn('[scheduling] DDL warn in image upload:', ddlErr.message);
        imageUrlColumnReady = true; // Optimistically try UPDATE anyway
      }
    }
    await query(
      `UPDATE scheduling_session_types SET image_url = $1 WHERE id = $2 AND studio_id = $3`,
      [imageUrl, id, studioId]
    );
    res.json({ imageUrl: resolveImageUrl(imageUrl) });
  } catch (err) {
    console.error('[scheduling] session-type image upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload image' });
  }
});

router.delete('/studios/:studioId/session-types/:id', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await query('DELETE FROM scheduling_session_types WHERE id = $1 AND studio_id = $2', [id, studioId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] session-type delete:', err);
    res.status(500).json({ error: 'Failed to delete session type' });
  }
});

// ─── AVAILABILITY SLOTS ───────────────────────────────────────────────────────

router.get('/studios/:studioId/availability', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const slots = await queryRows(
      `SELECT a.id, a.slot_date as date, a.start_time as startTime, a.end_time as endTime,
              a.location, a.staff_name as staffName, a.max_bookings as maxBookings,
              a.notes, a.is_active as isActive, a.session_type_id as sessionTypeId,
              a.buffer_before_minutes as bufferBeforeMinutes, a.buffer_after_minutes as bufferAfterMinutes,
              t.name as sessionTypeName, t.duration_minutes as sessionTypeDuration,
              (SELECT COUNT(*) FROM scheduling_bookings b
               WHERE b.availability_id = a.id AND b.status NOT IN ('rejected','cancelled')) as bookedCount
       FROM scheduling_availability a
       LEFT JOIN scheduling_session_types t ON t.id = a.session_type_id
       WHERE a.studio_id = $1
       ORDER BY a.slot_date DESC, a.start_time`,
      [studioId]
    );

    if (slots.length > 0) {
      const ids = slots.map(s => s.id);
      const bookingRows = await queryRows(
        `SELECT availability_id, booking_start_time as startTime, booking_end_time as endTime
         FROM scheduling_bookings
         WHERE availability_id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})
           AND status NOT IN ('rejected','cancelled')
           AND booking_start_time IS NOT NULL`,
        ids
      );
      const bBySlot = {};
      for (const b of bookingRows) {
        if (!bBySlot[b.availability_id]) bBySlot[b.availability_id] = [];
        bBySlot[b.availability_id].push(b);
      }
      for (const slot of slots) {
        const dur = Number(slot.sessionTypeDuration) || 60;
        const bef = Number(slot.bufferBeforeMinutes) || 0;
        const aft = Number(slot.bufferAfterMinutes) || 0;
        slot.availableWindows = computeAvailableWindows(slot.startTime, slot.endTime, dur, bef, aft, bBySlot[slot.id] || []);
      }
    }

    res.json(slots);
  } catch (err) {
    console.error('[scheduling] availability list:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

router.post('/studios/:studioId/availability', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { date, startTime, endTime, location, staffName, maxBookings, notes, sessionTypeId, bufferBeforeMinutes, bufferAfterMinutes } = req.body;
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'Date, start time, and end time are required' });
  try {
    const row = await queryRow(
      `INSERT INTO scheduling_availability (studio_id, session_type_id, slot_date, start_time, end_time, location, staff_name, max_bookings, notes, buffer_before_minutes, buffer_after_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [studioId, sessionTypeId || null, date, startTime, endTime, location || null, staffName || null, Number(maxBookings) || 1, notes || null, Number(bufferBeforeMinutes) || 0, Number(bufferAfterMinutes) || 0]
    );
    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error('[scheduling] availability create:', err);
    res.status(500).json({ error: 'Failed to create availability slot' });
  }
});

router.put('/studios/:studioId/availability/:id', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { date, startTime, endTime, location, staffName, maxBookings, notes, sessionTypeId, isActive, bufferBeforeMinutes, bufferAfterMinutes } = req.body;
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'Date, start time, and end time are required' });
  try {
    await query(
      `UPDATE scheduling_availability
       SET session_type_id = $1, slot_date = $2, start_time = $3, end_time = $4,
           location = $5, staff_name = $6, max_bookings = $7, notes = $8, is_active = $9,
           buffer_before_minutes = $10, buffer_after_minutes = $11
       WHERE id = $12 AND studio_id = $13`,
      [sessionTypeId || null, date, startTime, endTime, location || null, staffName || null, Number(maxBookings) || 1, notes || null, isActive ? 1 : 0, Number(bufferBeforeMinutes) || 0, Number(bufferAfterMinutes) || 0, id, studioId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] availability update:', err);
    res.status(500).json({ error: 'Failed to update slot' });
  }
});

router.delete('/studios/:studioId/availability/:id', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const booked = await queryRow(
      `SELECT COUNT(*) as count FROM scheduling_bookings WHERE availability_id = $1 AND status = 'approved'`,
      [id]
    );
    if (Number(booked?.count) > 0) return res.status(400).json({ error: 'Cannot delete a slot with approved bookings' });
    await query('DELETE FROM scheduling_availability WHERE id = $1 AND studio_id = $2', [id, studioId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] availability delete:', err);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
});

// ─── BOOKINGS (Studio Admin) ──────────────────────────────────────────────────

router.get('/studios/:studioId/bookings', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const bookings = await queryRows(
      `SELECT b.id, b.customer_name as customerName, b.customer_email as customerEmail,
              b.customer_phone as customerPhone, b.customer_notes as customerNotes,
              b.status, b.requires_payment as requiresPayment, b.payment_amount as paymentAmount,
              b.payment_status as paymentStatus, b.rejection_reason as rejectionReason,
              b.approved_at as approvedAt, b.rejected_at as rejectedAt, b.created_at as createdAt,
              b.platform_fee_amount as platformFeeAmount, b.stripe_fee_amount as stripeFeeAmount,
              b.studio_payout_amount as studioPayoutAmount,
              b.session_type_id as sessionTypeId,
              b.manual_date as manualDate, b.manual_start_time as manualStartTime,
              b.manual_end_time as manualEndTime, b.manual_location as manualLocation,
              b.manual_staff_name as manualStaffName,
              COALESCE(a.slot_date, b.manual_date) as slotDate,
              COALESCE(b.booking_start_time, b.manual_start_time) as startTime,
              COALESCE(b.booking_end_time, b.manual_end_time) as endTime,
              COALESCE(a.location, b.manual_location) as location,
              COALESCE(a.staff_name, b.manual_staff_name) as staffName,
              b.source as source, COALESCE(t.name, b.session_type_name_text) as sessionTypeName, t.price as sessionTypePrice, t.duration_minutes as durationMinutes,
              ${retainerColumnsReady ? 't.retainer_amount as retainerAmount, b.balance_amount as balanceAmount, b.balance_payment_status as balancePaymentStatus, b.balance_payment_method as balancePaymentMethod' : 'NULL as retainerAmount, NULL as balanceAmount, NULL as balancePaymentStatus, NULL as balancePaymentMethod'}
       FROM scheduling_bookings b
       LEFT JOIN scheduling_availability a ON a.id = b.availability_id
       LEFT JOIN scheduling_session_types t ON t.id = b.session_type_id
       WHERE b.studio_id = $1
       ORDER BY b.created_at DESC`,
      [studioId]
    );
    res.json(bookings);
  } catch (err) {
    console.error('[scheduling] bookings list:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.post('/studios/:studioId/bookings', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { customerName, customerEmail, customerPhone, customerNotes, sessionTypeId,
          bookingDate, startTime, endTime, location, staffName, status } = req.body;
  if (!customerName || !customerEmail) return res.status(400).json({ error: 'Customer name and email are required' });
  const validStatuses = ['pending', 'approved', 'cancelled'];
  const bookingStatus = validStatuses.includes(status) ? status : 'approved';
  const approvedAt = bookingStatus === 'approved' ? new Date().toISOString() : null;
  try {
    const row = await queryRow(
      `INSERT INTO scheduling_bookings
       (studio_id, session_type_id, customer_name, customer_email, customer_phone, customer_notes,
        manual_date, manual_start_time, manual_end_time, manual_location, manual_staff_name,
        status, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [studioId, sessionTypeId || null, customerName, customerEmail, customerPhone || null, customerNotes || null,
       bookingDate || null, startTime || null, endTime || null, location || null, staffName || null,
       bookingStatus, approvedAt]
    );
    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error('[scheduling] manual booking create:', err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

router.post('/studios/:studioId/bookings/:id/approve', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { requiresPayment, paymentAmount, balanceAmount } = req.body;

  try {
    const booking = await queryRow(
      `SELECT b.*, COALESCE(a.slot_date, b.manual_date) as slotDate,
              COALESCE(b.booking_start_time, b.manual_start_time) as startTime,
              t.name as sessionTypeName,
              s.name as studioName, COALESCE(NULLIF(s.email,''), pc.email) as studioEmail
       FROM scheduling_bookings b
       LEFT JOIN scheduling_availability a ON a.id = b.availability_id
       LEFT JOIN scheduling_session_types t ON t.id = b.session_type_id
       LEFT JOIN studios s ON s.id = b.studio_id
       LEFT JOIN profile_config pc ON pc.studio_id = b.studio_id
       WHERE b.id = $1 AND b.studio_id = $2`,
      [id, studioId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Booking is not pending' });

    const amount = Number(paymentAmount || booking.payment_amount || 0);
    let checkoutUrl = null;
    let stripeSessionId = null;
    let platformFeeAmount = 0;
    let stripeFeeAmount = 0;
    let studioPayout = amount;

    if (requiresPayment && amount > 0) {
      const feeConfig = await queryRow(`SELECT TOP 1 fee_type, fee_value FROM scheduling_fee_config ORDER BY id DESC`);
      if (feeConfig) {
        platformFeeAmount = feeConfig.fee_type === 'percentage'
          ? Math.round(amount * Number(feeConfig.fee_value) / 100 * 100) / 100
          : Number(feeConfig.fee_value);
      }
      stripeFeeAmount = Math.round((amount * 0.029 + 0.30) * 100) / 100;
      studioPayout = Math.round((amount - platformFeeAmount - stripeFeeAmount) * 100) / 100;

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: 'Stripe not configured' });
      const stripe = (await import('stripe')).default(stripeKey);

      const dateLabel = booking.slotDate
        ? new Date(booking.slotDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: booking.sessionTypeName || 'Photography Session',
              description: [dateLabel, booking.startTime].filter(Boolean).join(' · '),
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: booking.customer_email,
        success_url: `${APP_URL()}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL()}/booking-payment-cancelled`,
        metadata: { booking_id: String(booking.id), studio_id: String(studioId) },
      });
      checkoutUrl = session.url;
      stripeSessionId = session.id;
    }

    const storedBalance = retainerColumnsReady && Number(balanceAmount) > 0 ? Number(balanceAmount) : null;
    const balanceCol = retainerColumnsReady ? ', balance_amount = $9, balance_payment_status = $10' : '';
    const baseParams = [
      requiresPayment ? 1 : 0,
      amount || null,
      stripeSessionId || null,
      requiresPayment && amount > 0 ? 'pending' : null,
      platformFeeAmount || null,
      stripeFeeAmount || null,
      studioPayout || null,
      id,
    ];
    if (retainerColumnsReady) {
      baseParams.push(storedBalance);
      baseParams.push(storedBalance ? 'pending' : null);
    }
    await query(
      `UPDATE scheduling_bookings
       SET status = 'approved', requires_payment = $1, payment_amount = $2,
           stripe_checkout_session_id = $3, payment_status = $4,
           platform_fee_amount = $5, stripe_fee_amount = $6, studio_payout_amount = $7${balanceCol},
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      baseParams
    );

    const dateLabel = booking.slotDate
      ? new Date(booking.slotDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    await sendEmail({
      to: booking.customer_email,
      subject: `Your booking is approved — ${booking.studioName || 'Photo Session'}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 12px 0">Booking Approved!</h2>
          <p style="color:#bdbdbd">Hi ${booking.customer_name},</p>
          <p style="color:#bdbdbd">Your booking with <strong style="color:#e0e0e0">${booking.studioName || 'the studio'}</strong> has been approved.</p>
          ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Date:</strong> ${dateLabel}</p>` : ''}
          ${booking.startTime ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Time:</strong> ${booking.startTime}</p>` : ''}
          ${requiresPayment && checkoutUrl
            ? `<p style="color:#bdbdbd">To confirm your session, please pay your <strong style="color:#e0e0e0">${storedBalance ? 'retainer/deposit' : 'session fee'} of $${amount.toFixed(2)}</strong>:</p>
               <a href="${checkoutUrl}" style="display:inline-block;padding:12px 28px;background:#7c5cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;margin:8px 0">Pay ${storedBalance ? 'Retainer' : 'Now'}</a>
               ${storedBalance ? `<p style="color:#6b6b80;font-size:0.85rem;margin-top:4px">Remaining balance of <strong style="color:#bdbdbd">$${storedBalance.toFixed(2)}</strong> is due before your session.</p>` : ''}
               <p style="color:#6b6b80;font-size:0.85rem;margin-top:4px">This link expires after payment or after 24 hours.</p>`
            : `<p style="color:#a3ffb3;font-weight:700;margin-top:12px">Your session is confirmed — no payment required.</p>`
          }
        </div>
      `,
      text: `Your booking with ${booking.studioName || 'the studio'} has been approved.${dateLabel ? `\nDate: ${dateLabel}` : ''}${booking.startTime ? `\nTime: ${booking.startTime}` : ''}${requiresPayment && checkoutUrl ? `\n\nPay $${amount.toFixed(2)} to confirm: ${checkoutUrl}` : '\n\nYour session is confirmed — no payment required.'}`,
    }).catch(err => console.error('[scheduling] approval email failed:', err));

    res.json({ success: true, checkoutUrl });
  } catch (err) {
    console.error('[scheduling] approve error:', err);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
});

router.post('/studios/:studioId/bookings/:id/reject', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { reason } = req.body;
  try {
    const booking = await queryRow(
      `SELECT b.customer_name, b.customer_email, b.status, s.name as studioName
       FROM scheduling_bookings b LEFT JOIN studios s ON s.id = b.studio_id
       WHERE b.id = $1 AND b.studio_id = $2`,
      [id, studioId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Booking is not pending' });

    await query(
      `UPDATE scheduling_bookings SET status = 'rejected', rejection_reason = $1, rejected_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reason || null, id]
    );

    await sendEmail({
      to: booking.customer_email,
      subject: `Booking update — ${booking.studioName || 'Photo Session'}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 12px 0">Booking Update</h2>
          <p style="color:#bdbdbd">Hi ${booking.customer_name},</p>
          <p style="color:#bdbdbd">Unfortunately your booking request with <strong style="color:#e0e0e0">${booking.studioName || 'the studio'}</strong> could not be accommodated at this time.</p>
          ${reason ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Note:</strong> ${reason}</p>` : ''}
          <p style="color:#bdbdbd">Please feel free to request another available time slot.</p>
        </div>
      `,
      text: `Your booking request with ${booking.studioName || 'the studio'} was not approved.${reason ? `\n\nNote: ${reason}` : ''}\n\nFeel free to request another time.`,
    }).catch(err => console.error('[scheduling] rejection email failed:', err));

    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] reject error:', err);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});

// ─── PUBLIC BOOKING ───────────────────────────────────────────────────────────

router.get('/public/:studioSlug/info', async (req, res) => {
  try {
    const studio = await queryRow(
      `SELECT id, name FROM studios WHERE public_slug = $1`,
      [req.params.studioSlug]
    );
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    let sessionTypes = [];
    if (imageUrlColumnReady) {
      try {
        const retCol2 = retainerColumnsReady ? ', retainer_amount as retainerAmount' : ', NULL as retainerAmount';
        const rows = await queryRows(
          `SELECT id, name, description, duration_minutes as durationMinutes, price, image_url as imageUrl${retCol2}
           FROM scheduling_session_types WHERE studio_id = $1 AND is_active = 1 ORDER BY name`,
          [studio.id]
        );
        sessionTypes = rows.map(t => ({ ...t, imageUrl: resolveImageUrl(t.imageUrl) }));
      } catch {
        const rows = await queryRows(
          `SELECT id, name, description, duration_minutes as durationMinutes, price
           FROM scheduling_session_types WHERE studio_id = $1 AND is_active = 1 ORDER BY name`,
          [studio.id]
        );
        sessionTypes = rows.map(t => ({ ...t, imageUrl: null, retainerAmount: null }));
      }
    } else {
      const rows = await queryRows(
        `SELECT id, name, description, duration_minutes as durationMinutes, price
         FROM scheduling_session_types WHERE studio_id = $1 AND is_active = 1 ORDER BY name`,
        [studio.id]
      );
      sessionTypes = rows.map(t => ({ ...t, imageUrl: null, retainerAmount: null }));
    }

    res.json({ id: studio.id, name: studio.name, sessionTypes });
  } catch (err) {
    console.error('[scheduling] public info error:', err);
    res.status(500).json({ error: 'Failed to load studio info' });
  }
});

router.get('/public/:studioSlug/slots', async (req, res) => {
  try {
    const { sessionTypeId } = req.query;
    const studio = await queryRow(`SELECT id FROM studios WHERE public_slug = $1`, [req.params.studioSlug]);
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const today = new Date().toISOString().split('T')[0];
    const params = [studio.id, today];
    let typeFilter = '';
    if (sessionTypeId) {
      params.push(sessionTypeId);
      typeFilter = `AND a.session_type_id = $${params.length}`;
    }

    const avails = await queryRows(
      `SELECT a.id, a.slot_date as date, a.start_time as windowStart, a.end_time as windowEnd,
              a.location, a.staff_name as staffName,
              a.session_type_id as sessionTypeId,
              a.buffer_before_minutes as bufferBefore, a.buffer_after_minutes as bufferAfter,
              t.name as sessionTypeName, t.duration_minutes as sessionDuration
       FROM scheduling_availability a
       LEFT JOIN scheduling_session_types t ON t.id = a.session_type_id
       WHERE a.studio_id = $1 AND a.is_active = 1 AND a.slot_date >= $2 ${typeFilter}
       ORDER BY a.slot_date, a.start_time`,
      params
    );

    if (!avails.length) return res.json([]);

    // Fetch existing bookings to compute remaining windows
    const ids = avails.map(a => a.id);
    const bookingRows = await queryRows(
      `SELECT availability_id, booking_start_time as startTime, booking_end_time as endTime
       FROM scheduling_bookings
       WHERE availability_id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})
         AND status NOT IN ('rejected','cancelled')
         AND booking_start_time IS NOT NULL`,
      ids
    );
    const bByAvail = {};
    for (const b of bookingRows) {
      if (!bByAvail[b.availability_id]) bByAvail[b.availability_id] = [];
      bByAvail[b.availability_id].push(b);
    }

    const result = avails.map(a => {
      const dur = Number(a.sessionDuration) || 60;
      const bef = Number(a.bufferBefore) || 0;
      const aft = Number(a.bufferAfter) || 0;
      const windows = computeAvailableWindows(a.windowStart, a.windowEnd, dur, bef, aft, bByAvail[a.id] || []);
      return { ...a, sessionDuration: dur, availableWindows: windows };
    }).filter(a => a.availableWindows.length > 0);

    res.json(result);
  } catch (err) {
    console.error('[scheduling] public slots:', err);
    res.status(500).json({ error: 'Failed to load available slots' });
  }
});

router.post('/public/:studioSlug/book', async (req, res) => {
  try {
    const { availabilityId, sessionTypeId, startTime, customerName, customerEmail, customerPhone, customerNotes } = req.body;
    if (!customerName || !customerEmail) return res.status(400).json({ error: 'Name and email are required' });
    if (!availabilityId || !startTime) return res.status(400).json({ error: 'Availability and start time are required' });

    const studio = await queryRow(
      `SELECT s.id, s.name, COALESCE(NULLIF(s.email,''), pc.email) as email
       FROM studios s LEFT JOIN profile_config pc ON pc.studio_id = s.id
       WHERE s.public_slug = $1`,
      [req.params.studioSlug]
    );
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    // Load the availability window and its session type
    const avail = await queryRow(
      `SELECT a.id, a.start_time as windowStart, a.end_time as windowEnd, a.slot_date as slotDate,
              a.buffer_before_minutes as bufferBefore, a.buffer_after_minutes as bufferAfter,
              a.session_type_id as sessionTypeId,
              t.duration_minutes as sessionDuration, t.name as sessionTypeName
       FROM scheduling_availability a
       LEFT JOIN scheduling_session_types t ON t.id = a.session_type_id
       WHERE a.id = $1 AND a.studio_id = $2 AND a.is_active = 1`,
      [availabilityId, studio.id]
    );
    if (!avail) return res.status(404).json({ error: 'Availability not found' });

    const duration  = Number(avail.sessionDuration) || 60;
    const bufBefore = Number(avail.bufferBefore) || 0;
    const bufAfter  = Number(avail.bufferAfter) || 0;

    // Load existing bookings for this window and recompute available windows
    const existingBookings = await queryRows(
      `SELECT booking_start_time as startTime, booking_end_time as endTime
       FROM scheduling_bookings
       WHERE availability_id = $1 AND status NOT IN ('rejected','cancelled') AND booking_start_time IS NOT NULL`,
      [availabilityId]
    );
    const windows = computeAvailableWindows(avail.windowStart, avail.windowEnd, duration, bufBefore, bufAfter, existingBookings);

    const startMin = toMin(startTime);
    const valid = windows.some(w => startMin >= toMin(w.from) && startMin <= toMin(w.lastStart));
    if (!valid) return res.status(409).json({ error: 'That start time is no longer available. Please choose another.' });

    const endTime = toTimeStr(startMin + duration);
    const resolvedSessionTypeId = sessionTypeId || avail.sessionTypeId || null;

    await query(
      `INSERT INTO scheduling_bookings
       (studio_id, availability_id, session_type_id, customer_name, customer_email, customer_phone, customer_notes, booking_start_time, booking_end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [studio.id, availabilityId, resolvedSessionTypeId, customerName, customerEmail, customerPhone || null, customerNotes || null, startTime, endTime]
    );

    const dateLabel = avail.slotDate
      ? new Date(String(avail.slotDate)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    // Notify studio
    if (studio.email) {
      sendEmail({
        to: studio.email,
        subject: `New booking request — ${customerName}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
            <h2 style="color:#a78bfa;margin:0 0 12px 0">New Booking Request</h2>
            <p style="color:#bdbdbd"><strong style="color:#e0e0e0">From:</strong> ${customerName} (${customerEmail})</p>
            ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Date:</strong> ${dateLabel}</p>` : ''}
            <p style="color:#bdbdbd"><strong style="color:#e0e0e0">Time:</strong> ${startTime} – ${endTime}${avail.sessionTypeName ? ` (${avail.sessionTypeName})` : ''}</p>
            ${customerPhone ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Phone:</strong> ${customerPhone}</p>` : ''}
            ${customerNotes ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Notes:</strong> ${customerNotes}</p>` : ''}
            <a href="${APP_URL()}/admin/scheduling" style="display:inline-block;padding:12px 28px;background:#7c5cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px">Review in Dashboard</a>
          </div>
        `,
        text: `New booking request from ${customerName} (${customerEmail}).${dateLabel ? `\nDate: ${dateLabel}` : ''}\nTime: ${startTime} – ${endTime}${customerNotes ? `\n\nNotes: ${customerNotes}` : ''}\n\nManage: ${APP_URL()}/admin/scheduling`,
      }).catch(() => {});
    }

    // Confirm to customer
    sendEmail({
      to: customerEmail,
      subject: `Booking request received — ${studio.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 12px 0">Request Received</h2>
          <p style="color:#bdbdbd">Hi ${customerName},</p>
          <p style="color:#bdbdbd">We received your booking request with <strong style="color:#e0e0e0">${studio.name}</strong>.</p>
          ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Date:</strong> ${dateLabel}</p>` : ''}
          <p style="color:#bdbdbd"><strong style="color:#e0e0e0">Time:</strong> ${startTime} – ${endTime}</p>
          <p style="color:#bdbdbd">You'll get a confirmation email once the studio reviews your request — usually within 24 hours.</p>
        </div>
      `,
      text: `Hi ${customerName},\n\nYour booking request with ${studio.name} has been received.${dateLabel ? `\nDate: ${dateLabel}` : ''}\nTime: ${startTime} – ${endTime}\n\nYou'll hear back soon.`,
    }).catch(() => {});

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[scheduling] book error:', err);
    res.status(500).json({ error: 'Failed to submit booking request' });
  }
});

router.post('/public/:studioSlug/request', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, sessionTypeName, preferredDate, preferredTime, preferredLocation, customerNotes, honeypot } = req.body;
    if (honeypot) return res.status(200).json({ ok: true });
    if (!customerName || !customerEmail) return res.status(400).json({ error: 'Name and email are required' });

    const studio = await queryRow(
      `SELECT s.id, s.name, COALESCE(NULLIF(s.email,''), pc.email) as email
       FROM studios s LEFT JOIN profile_config pc ON pc.studio_id = s.id
       WHERE s.public_slug = $1`,
      [req.params.studioSlug]
    );
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    await query(
      `INSERT INTO scheduling_bookings
       (studio_id, source, customer_name, customer_email, customer_phone, customer_notes,
        manual_date, manual_start_time, manual_location, session_type_name_text)
       VALUES ($1, 'request', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [studio.id, customerName, customerEmail, customerPhone || null, customerNotes || null,
       preferredDate || null, preferredTime || null, preferredLocation || null, sessionTypeName || null]
    );

    const dateLabel = preferredDate
      ? new Date(preferredDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    if (studio.email) {
      sendEmail({
        to: studio.email,
        subject: `New custom session request — ${customerName}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
            <h2 style="color:#a78bfa;margin:0 0 12px 0">New Custom Session Request</h2>
            <p style="color:#bdbdbd"><strong style="color:#e0e0e0">From:</strong> ${customerName} (${customerEmail})</p>
            ${sessionTypeName ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Session type:</strong> ${sessionTypeName}</p>` : ''}
            ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Preferred date:</strong> ${dateLabel}</p>` : ''}
            ${preferredTime ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Preferred time:</strong> ${preferredTime}</p>` : ''}
            ${preferredLocation ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Preferred location:</strong> ${preferredLocation}</p>` : ''}
            ${customerPhone ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Phone:</strong> ${customerPhone}</p>` : ''}
            ${customerNotes ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Notes:</strong> ${customerNotes}</p>` : ''}
            <a href="${APP_URL()}/admin/scheduling" style="display:inline-block;padding:12px 28px;background:#7c5cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px">Review in Dashboard</a>
          </div>
        `,
        text: `New custom session request from ${customerName} (${customerEmail}).${sessionTypeName ? `\nSession type: ${sessionTypeName}` : ''}${dateLabel ? `\nPreferred date: ${dateLabel}` : ''}${preferredTime ? `\nPreferred time: ${preferredTime}` : ''}${preferredLocation ? `\nPreferred location: ${preferredLocation}` : ''}${customerNotes ? `\n\nNotes: ${customerNotes}` : ''}\n\nManage: ${APP_URL()}/admin/scheduling`,
      }).catch(() => {});
    }

    sendEmail({
      to: customerEmail,
      subject: `Session request received — ${studio.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 12px 0">Request Received</h2>
          <p style="color:#bdbdbd">Hi ${customerName},</p>
          <p style="color:#bdbdbd">Your custom session request with <strong style="color:#e0e0e0">${studio.name}</strong> has been received.</p>
          ${sessionTypeName ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Session type:</strong> ${sessionTypeName}</p>` : ''}
          ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Preferred date:</strong> ${dateLabel}</p>` : ''}
          <p style="color:#bdbdbd">The studio will reach out within 24–48 hours to confirm details and next steps.</p>
        </div>
      `,
      text: `Hi ${customerName},\n\nYour custom session request with ${studio.name} has been received.${sessionTypeName ? `\nSession type: ${sessionTypeName}` : ''}${dateLabel ? `\nPreferred date: ${dateLabel}` : ''}\n\nThe studio will be in touch soon.`,
    }).catch(() => {});

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[scheduling] request error:', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// ─── PAYMENT VERIFICATION (called from success redirect — webhook fallback) ────

router.post('/public/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.json({ paid: false });
    const stripe = (await import('stripe')).default(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const bookingId = Number(session.metadata?.booking_id);
      if (bookingId) {
        await query(
          `UPDATE scheduling_bookings SET payment_status = 'paid', payment_intent_id = $1 WHERE id = $2`,
          [session.payment_intent || null, bookingId]
        );
      }
    }
    res.json({ paid: session.payment_status === 'paid' });
  } catch (err) {
    console.error('[scheduling] verify-payment error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

router.post('/studios/:studioId/bookings/:id/check-payment', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const booking = await queryRow(
      `SELECT stripe_checkout_session_id FROM scheduling_bookings WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!booking?.stripe_checkout_session_id) return res.json({ paid: false, reason: 'No Stripe session' });
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.json({ paid: false, reason: 'Stripe not configured' });
    const stripe = (await import('stripe')).default(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
    if (session.payment_status === 'paid') {
      await query(
        `UPDATE scheduling_bookings SET payment_status = 'paid', payment_intent_id = $1 WHERE id = $2`,
        [session.payment_intent || null, Number(id)]
      );
    }
    res.json({ paid: session.payment_status === 'paid' });
  } catch (err) {
    console.error('[scheduling] check-payment error:', err);
    res.status(500).json({ error: 'Failed to check payment' });
  }
});

// ─── BOOKING EDIT / CANCEL / MARK-PAID ───────────────────────────────────────

router.put('/studios/:studioId/bookings/:id', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { customerName, customerEmail, customerPhone, customerNotes,
          sessionTypeId, bookingDate, startTime, endTime, location, staffName } = req.body;
  if (!customerName || !customerEmail) return res.status(400).json({ error: 'Customer name and email are required' });
  try {
    await query(
      `UPDATE scheduling_bookings SET
         customer_name = $1, customer_email = $2, customer_phone = $3, customer_notes = $4,
         session_type_id = $5,
         manual_date = $6, manual_start_time = $7, manual_end_time = $8,
         manual_location = $9, manual_staff_name = $10
       WHERE id = $11 AND studio_id = $12`,
      [customerName, customerEmail, customerPhone || null, customerNotes || null,
       sessionTypeId || null,
       bookingDate || null, startTime || null, endTime || null,
       location || null, staffName || null,
       Number(id), Number(studioId)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] booking edit:', err);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

router.post('/studios/:studioId/bookings/:id/cancel', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const booking = await queryRow(
      `SELECT status FROM scheduling_bookings WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });
    await query(
      `UPDATE scheduling_bookings SET status = 'cancelled' WHERE id = $1 AND studio_id = $2`,
      [Number(id), Number(studioId)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] booking cancel:', err);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Ensure payment_method column exists for cash/check tracking
let paymentMethodColumnReady = false;
(async () => {
  try {
    const exists = await columnExists('scheduling_bookings', 'payment_method');
    if (!exists) {
      await query(`ALTER TABLE scheduling_bookings ADD payment_method NVARCHAR(50) NULL`);
      console.log('[scheduling] payment_method column added');
    }
    paymentMethodColumnReady = true;
  } catch (e) {
    console.warn('[scheduling] payment_method migration failed:', e.message);
  }
})();

router.post('/studios/:studioId/bookings/:id/mark-paid', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  const { paymentMethod, amount } = req.body;
  if (!['cash', 'check'].includes(paymentMethod)) return res.status(400).json({ error: 'paymentMethod must be cash or check' });
  const paidAmount = Number(amount) || 0;
  try {
    const methodCol = paymentMethodColumnReady ? ', payment_method = $5' : '';
    const params = [paidAmount, paidAmount, Number(id), Number(studioId)];
    if (paymentMethodColumnReady) params.splice(4, 0, paymentMethod);
    await query(
      `UPDATE scheduling_bookings SET
         payment_status = 'paid', payment_amount = $1,
         platform_fee_amount = 0, stripe_fee_amount = 0, studio_payout_amount = $2${methodCol}
       WHERE id = $3 AND studio_id = $4`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] mark-paid:', err);
    res.status(500).json({ error: 'Failed to mark as paid' });
  }
});

// ─── BALANCE PAYMENT ─────────────────────────────────────────────────────────

router.post('/studios/:studioId/bookings/:id/request-balance', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  if (!retainerColumnsReady) return res.status(503).json({ error: 'Balance feature not ready — restart server' });
  try {
    const booking = await queryRow(
      `SELECT b.*, b.balance_amount as balanceAmount,
              COALESCE(a.slot_date, b.manual_date) as slotDate,
              COALESCE(b.booking_start_time, b.manual_start_time) as startTime,
              t.name as sessionTypeName,
              s.name as studioName
       FROM scheduling_bookings b
       LEFT JOIN scheduling_availability a ON a.id = b.availability_id
       LEFT JOIN scheduling_session_types t ON t.id = b.session_type_id
       LEFT JOIN studios s ON s.id = b.studio_id
       WHERE b.id = $1 AND b.studio_id = $2`,
      [id, studioId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const balance = Number(booking.balanceAmount || 0);
    if (balance <= 0) return res.status(400).json({ error: 'No balance amount set on this booking' });
    if (booking.balance_payment_status === 'paid') return res.status(400).json({ error: 'Balance already paid' });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(503).json({ error: 'Stripe not configured' });
    const stripe = (await import('stripe')).default(stripeKey);

    const dateLabel = booking.slotDate
      ? new Date(booking.slotDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Balance — ${booking.sessionTypeName || 'Photography Session'}`,
            description: [dateLabel, booking.startTime].filter(Boolean).join(' · '),
          },
          unit_amount: Math.round(balance * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: booking.customer_email,
      success_url: `${APP_URL()}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL()}/booking-payment-cancelled`,
      metadata: { booking_id: String(booking.id), studio_id: String(studioId), payment_type: 'balance' },
    });

    await query(
      `UPDATE scheduling_bookings SET balance_payment_status = 'pending', balance_stripe_session_id = $1 WHERE id = $2`,
      [session.id, Number(id)]
    );

    await sendEmail({
      to: booking.customer_email,
      subject: `Balance payment request — ${booking.studioName || 'Photo Session'}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 12px 0">Balance Payment Request</h2>
          <p style="color:#bdbdbd">Hi ${booking.customer_name},</p>
          <p style="color:#bdbdbd">The remaining balance of <strong style="color:#e0e0e0">$${balance.toFixed(2)}</strong> for your session with <strong style="color:#e0e0e0">${booking.studioName || 'the studio'}</strong> is now due.</p>
          ${dateLabel ? `<p style="color:#bdbdbd"><strong style="color:#e0e0e0">Date:</strong> ${dateLabel}</p>` : ''}
          <a href="${session.url}" style="display:inline-block;padding:12px 28px;background:#7c5cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;margin:12px 0">Pay Balance $${balance.toFixed(2)}</a>
        </div>
      `,
      text: `Balance of $${balance.toFixed(2)} due for your session with ${booking.studioName || 'the studio'}.${dateLabel ? `\nDate: ${dateLabel}` : ''}\nPay here: ${session.url}`,
    }).catch(err => console.error('[scheduling] balance email failed:', err));

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    console.error('[scheduling] request-balance:', err);
    res.status(500).json({ error: err.message || 'Failed to create balance payment request' });
  }
});

router.post('/studios/:studioId/bookings/:id/mark-balance-paid', authRequired, async (req, res) => {
  const { studioId, id } = req.params;
  if (!canManageStudio(req.user, studioId)) return res.status(403).json({ error: 'Unauthorized' });
  if (!retainerColumnsReady) return res.status(503).json({ error: 'Balance feature not ready — restart server' });
  const { paymentMethod } = req.body;
  if (!['cash', 'check'].includes(paymentMethod)) return res.status(400).json({ error: 'paymentMethod must be cash or check' });
  try {
    await query(
      `UPDATE scheduling_bookings SET balance_payment_status = 'paid', balance_payment_method = $1 WHERE id = $2 AND studio_id = $3`,
      [paymentMethod, Number(id), Number(studioId)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] mark-balance-paid:', err);
    res.status(500).json({ error: 'Failed to mark balance as paid' });
  }
});

// ─── SUPER ADMIN FEE CONFIG ───────────────────────────────────────────────────

router.get('/admin/fee-config', authRequired, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const config = await queryRow(
      `SELECT TOP 1 fee_type as feeType, fee_value as feeValue FROM scheduling_fee_config ORDER BY id DESC`
    );
    res.json(config || { feeType: 'percentage', feeValue: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fee config' });
  }
});

router.put('/admin/fee-config', authRequired, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Unauthorized' });
  const { feeType, feeValue } = req.body;
  if (!['percentage', 'fixed'].includes(feeType)) return res.status(400).json({ error: 'feeType must be percentage or fixed' });
  if (Number(feeValue) < 0) return res.status(400).json({ error: 'feeValue must be non-negative' });
  try {
    const existing = await queryRow(`SELECT TOP 1 id FROM scheduling_fee_config ORDER BY id DESC`);
    if (existing) {
      await query(
        `UPDATE scheduling_fee_config SET fee_type = $1, fee_value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3 WHERE id = $4`,
        [feeType, feeValue, req.user.id, existing.id]
      );
    } else {
      await query(
        `INSERT INTO scheduling_fee_config (fee_type, fee_value, updated_by) VALUES ($1, $2, $3)`,
        [feeType, feeValue, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[scheduling] fee-config update:', err);
    res.status(500).json({ error: 'Failed to save fee config' });
  }
});

// ─── WEBHOOK: mark booking paid after Stripe checkout ─────────────────────────
// Called internally from the Stripe webhook handler in stripe.js
export async function handleSchedulingCheckoutCompleted(session) {
  const bookingId = Number(session.metadata?.booking_id);
  if (!bookingId) return;
  try {
    await query(
      `UPDATE scheduling_bookings SET payment_status = 'paid', payment_intent_id = $1 WHERE id = $2`,
      [session.payment_intent || null, bookingId]
    );
    console.log(`[scheduling] booking ${bookingId} marked paid`);
  } catch (err) {
    console.error('[scheduling] failed to mark booking paid:', err);
  }
}

export default router;
