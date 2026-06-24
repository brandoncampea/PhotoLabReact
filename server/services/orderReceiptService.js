/**
 * Send a cancellation email to the customer with order info and reason.
 * @param {object} opts
 * @param {string} opts.to - recipient email
 * @param {string} [opts.customerName]
 * @param {object} opts.order - order object
 * @param {Array} opts.items - order items
 * @param {string} opts.cancelReason - reason for cancellation
 */
export async function sendOrderCancellationEmail({ to, customerName, order, items, cancelReason, replyTo }) {
  if (!isConfigured()) {
    console.warn('[CANCELLATION EMAIL] Email not configured (Mailtrap not set up)');
    return false;
  }
  if (!to) {
    console.warn('[CANCELLATION EMAIL] No recipient email provided');
    return false;
  }
  
  try {
    console.log('[CANCELLATION EMAIL] Sending cancellation email to:', to, 'for order:', order?.id);
    const html = renderOrderCancellationHtml({ customerName, order, items, cancelReason });
    
    // Build reply_to object - Mailtrap requires it to be an object, not a string
    let replyToObj = null;
    if (replyTo) {
      replyToObj = { email: replyTo };
    } else if (smtpReplyTo) {
      replyToObj = { email: smtpReplyTo };
    }
    
    const mailPayload = {
      from: {
        email: mailtrapSenderEmail,
        name: mailtrapSenderName,
      },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      subject: `Order #${order.id} Cancelled — Photo Lab`,
      html,
      text: `Your order #${order.id} has been cancelled.\nReason: ${cancelReason}\nTotal: ${currency(order.totalAmount)}\nIf you have questions, please contact support.`,
      category: 'Order Cancelled',
    };
    
    if (replyToObj) {
      mailPayload.reply_to = replyToObj;
    }
    
    const response = await mailtrapClient.send(mailPayload);
    console.log('[CANCELLATION EMAIL] Email sent successfully to:', to, 'response:', response?.success || response?.id);
    return true;
  } catch (err) {
    console.error('[CANCELLATION EMAIL] Failed to send cancellation email to:', to, 'Error:', err?.message || err);
    return false;
  }
}

function renderOrderCancellationHtml({ customerName, order, items, cancelReason }) {
  return `
    <div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:760px;margin:0 auto;padding:20px;border:2px solid #e11d48;border-radius:12px;">
      <div style="font-size:24px;font-weight:700;color:#fff;">Order Cancelled</div>
      <div style="margin-top:10px;font-size:15px;color:#fca5a5;">We're sorry, but your order has been cancelled.</div>
      <div style="margin-top:10px;font-size:14px;color:#fff;">Reason: <span style="color:#f87171;">${esc(cancelReason)}</span></div>
      <div style="margin-top:18px;font-size:14px;color:#d3dceb;">Order #${esc(order.id)}${customerName ? ` for ${esc(customerName)}` : ''}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:18px;background:#111722;border:1px solid #303846;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#1a2330;color:#b9c7da;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;">
            <th style="text-align:left;padding:10px 8px;">Product</th>
            <th style="text-align:left;padding:10px 8px;">Image Name</th>
            <th style="text-align:right;padding:10px 8px;">Unit Price</th>
            <th style="text-align:right;padding:10px 8px;">Qty</th>
            <th style="text-align:right;padding:10px 8px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${renderItemsRows(items)}
        </tbody>
      </table>
      <div style="margin-top:18px;display:flex;justify-content:flex-end;">
        <table style="width:300px;border-collapse:collapse;color:#d3dceb;">
          <tr><td style="padding:4px 0;">Item(s) Subtotal:</td><td style="padding:4px 0;text-align:right;">${currency(order.subtotal)}</td></tr>
          <tr><td style="padding:4px 0;">Shipping:</td><td style="padding:4px 0;text-align:right;">${currency(order.shippingCost)}</td></tr>
          <tr><td style="padding:4px 0;">Sales Tax:</td><td style="padding:4px 0;text-align:right;">${currency(order.taxAmount)}</td></tr>
          <tr><td style="padding:8px 0 0 0;font-weight:700;color:#fff;">Grand Total:</td><td style="padding:8px 0 0 0;text-align:right;font-weight:700;color:#fff;">${currency(order.totalAmount)}</td></tr>
        </table>
      </div>
      <div style="margin-top:18px;font-size:13px;color:#b8c2d1;">If you have questions, please reply to this email.</div>
      ${appBaseUrl ? `<div style="margin-top:18px;font-size:13px;"><a href="${esc(appBaseUrl)}" style="color:#7cc7ff;">Open Photo Lab</a></div>` : ''}
    </div>
  `;
}

import { MailtrapClient } from 'mailtrap';

const mailtrapToken = String(process.env.MAILTRAP_API_KEY || '').trim();
const mailtrapSenderEmail = String(process.env.MAILTRAP_SENDER_EMAIL || '').trim();
const mailtrapSenderName = String(process.env.MAILTRAP_SENDER_NAME || '').trim() || 'Photo Lab';
const mailtrapClient = mailtrapToken ? new MailtrapClient({ token: mailtrapToken }) : null;

const smtpReplyTo = String(process.env.SMTP_REPLY_TO || '').trim() || undefined;
const appBaseUrl = String(process.env.APP_BASE_URL || '').trim();

let transporterPromise = null;

const currency = (amount) => `$${Number(amount || 0).toFixed(2)}`;
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const isConfigured = () => Boolean(mailtrapClient && mailtrapSenderEmail);

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const resolveDiscountDetails = (order = {}) => {
  const code = String(order?.discountCode ?? order?.discount_code ?? '').trim();
  if (!code) return { code: '', amount: 0, hasDiscount: false };

  const subtotal = Number(order?.subtotal || 0);
  const taxAmount = Number(order?.taxAmount || 0);
  const shippingCost = Number(order?.shippingCost || 0);
  const totalAmount = Number(order?.totalAmount || 0);

  const preferredComputed = (subtotal + taxAmount) - totalAmount;
  const fallbackComputed = (subtotal + taxAmount + shippingCost) - totalAmount;

  let amount = 0;
  if (Number.isFinite(preferredComputed) && preferredComputed > 0) {
    amount = preferredComputed;
  } else if (Number.isFinite(fallbackComputed) && fallbackComputed > 0) {
    amount = fallbackComputed;
  }

  return {
    code,
    amount: Number(amount.toFixed(2)),
    hasDiscount: Boolean(code) || amount > 0,
  };
};

const renderItemsRows = (items) => {
  // Separate package groups from standalone items
  const packageGroups = new Map();
  const standaloneItems = [];
  for (const item of items) {
    if (item.packageGroupId) {
      const group = packageGroups.get(item.packageGroupId) || [];
      group.push(item);
      packageGroups.set(item.packageGroupId, group);
    } else {
      standaloneItems.push(item);
    }
  }

  const rows = [];

  // Render each package group as a header row + sub-rows
  for (const [, groupItems] of packageGroups) {
    const pkgName = groupItems[0].packageName || 'Package';
    const pkgPrice = Number(groupItems[0].packagePrice) || 0;
    rows.push(`<tr>
      <td colspan="2" style="padding:10px 8px;border-bottom:1px solid #343b45;color:#c4b5fd;font-weight:600;">
        📦 ${esc(pkgName)}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#c4b5fd;font-weight:600;">${currency(pkgPrice)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#d0d8e3;">1</td>
      <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#fff;font-weight:600;">${currency(pkgPrice)}</td>
    </tr>`);
    for (const item of groupItems) {
      const photoName = item.photoFileName || item.fileName || item.filename || `Photo #${item.photoId}`;
      const productName = item.productName || item.name || 'Product';
      rows.push(`<tr>
        <td style="padding:6px 8px 6px 24px;border-bottom:1px solid #2a3140;color:#d0d8e3;font-size:13px;">↳ ${esc(productName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #2a3140;color:#9ca3af;font-size:13px;">${esc(photoName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #2a3140;text-align:right;color:#6b7280;font-size:13px;">Included</td>
        <td style="padding:6px 8px;border-bottom:1px solid #2a3140;text-align:right;color:#6b7280;font-size:13px;">1</td>
        <td style="padding:6px 8px;border-bottom:1px solid #2a3140;text-align:right;color:#6b7280;font-size:13px;">—</td>
      </tr>`);
    }
  }

  // Render standalone items normally
  for (const item of standaloneItems) {
    const photoName = item.photoFileName || item.fileName || item.filename || `Photo #${item.photoId}`;
    const productName = item.productName || item.name || 'Product';
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const quantity = Number(item.quantity || 0);
    const lineTotal = unitPrice * quantity;
    let attrHtml = '';
    if (item.attributes) {
      if (Array.isArray(item.attributes)) {
        attrHtml = item.attributes.map(attr => `<div style=\"font-size:12px;color:#7b61ff;\">${esc(attr)}</div>`).join('');
      } else {
        attrHtml = `<div style=\"font-size:12px;color:#7b61ff;\">${esc(item.attributes)}</div>`;
      }
    }
    rows.push(`<tr>
      <td style=\"padding:10px 8px;border-bottom:1px solid #343b45;color:#e7edf6;\">${esc(productName)}${attrHtml ? `<div>${attrHtml}</div>` : ''}</td>
      <td style=\"padding:10px 8px;border-bottom:1px solid #343b45;color:#d0d8e3;\">${esc(photoName)}</td>
      <td style=\"padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#d0d8e3;\">${currency(unitPrice)}</td>
      <td style=\"padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#d0d8e3;\">${quantity}</td>
      <td style=\"padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#fff;\">${currency(lineTotal)}</td>
    </tr>`);
  }

  return rows.join('');
};

const isDigitalLikeItem = (item) => {
  const options = (() => {
    try {
      return typeof item?.productOptions === 'string' ? JSON.parse(item.productOptions) : (item?.productOptions || {});
    } catch {
      return {};
    }
  })();
  const category = String(item?.productCategory || '').toLowerCase();
  const name = String(item?.productName || '').toLowerCase();
  return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
};

const normalizeReceiptAmounts = (order = {}, items = []) => {
  const storedSubtotal = Number(order?.subtotal ?? order?.sub_total ?? 0) || 0;
  const storedShipping = Number(order?.shippingCost ?? order?.shipping_cost ?? 0) || 0;
  const storedTax = Number(order?.taxAmount ?? order?.tax_amount ?? 0) || 0;
  const storedTotal = Number(order?.totalAmount ?? order?.total ?? 0) || 0;

  const hasItems = Array.isArray(items) && items.length > 0;
  const itemSubtotal = hasItems ? (() => {
    const seenGroups = new Set();
    return Number(items.reduce((sum, item) => {
      if (item.packageGroupId) {
        if (!seenGroups.has(item.packageGroupId)) {
          seenGroups.add(item.packageGroupId);
          return sum + (Number(item.packagePrice) || 0);
        }
        return sum;
      }
      return sum + ((Number(item.unitPrice ?? item.price ?? 0) || 0) * (Number(item.quantity || 0) || 0));
    }, 0) || 0);
  })() : null;

  let subtotal = storedSubtotal;
  let shipping = storedShipping;
  const tax = storedTax;
  let total = storedTotal;

  if (itemSubtotal !== null && Number.isFinite(itemSubtotal)) {
    const expectedSubtotal = Number(itemSubtotal.toFixed(2));
    const looksDoubleShipping =
      Math.abs(storedSubtotal - Number((expectedSubtotal + storedShipping).toFixed(2))) < 0.01 &&
      Math.abs(storedTotal - Number((storedSubtotal + storedShipping + storedTax).toFixed(2))) < 0.01;
    const subtotalMismatch = Math.abs(storedSubtotal - expectedSubtotal) >= 0.01;

    if (looksDoubleShipping || subtotalMismatch) {
      subtotal = expectedSubtotal;
      total = Number((subtotal + shipping + tax).toFixed(2));
    }
  }

  if (hasItems && items.every((item) => isDigitalLikeItem(item))) {
    shipping = 0;
    subtotal = Number((itemSubtotal || 0).toFixed(2));
    total = Number((subtotal + tax).toFixed(2));
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
};

function getDigitalDownloadFileName(entry) {
  // Prefer actual filename, fallback to productName or a generic label
  return entry.photoFileName || entry.fileName || entry.filename || entry.productName || 'Digital Product';
}

const renderCustomerReceiptHtml = ({ customerName, order, items, digitalDownloads, customMessage, isUpdate }) => {
  const discount = resolveDiscountDetails(order);
  // Only show discount code/amount if there is a real discount (amount > 0 and code is not empty)
  let discountCodeRow = '';
  let discountAmountRow = '';
  if (discount.amount > 0 && discount.code) {
    discountCodeRow = `<tr><td style="padding:4px 0;">Discount code</td><td style="padding:4px 0;text-align:right;">${esc(discount.code)}</td></tr>`;
    discountAmountRow = `<tr><td style="padding:4px 0;">Discount</td><td style="padding:4px 0;text-align:right;color:#86efac;">-${currency(discount.amount)}</td></tr>`;
  }
  const downloadSection = Array.isArray(digitalDownloads) && digitalDownloads.length > 0
    ? `<div style="margin-top:20px;padding:16px;border:1px solid #3f4957;border-radius:10px;background:#141922;">
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px;">Digital Downloads</div>
        <div style="font-size:13px;color:#b8c2d1;margin-bottom:10px;">Use your unique links below to download your digital products.</div>
        ${digitalDownloads.map((entry) => `
          <div style="margin-bottom:8px;">
            <a href="${esc(entry.url)}" download="${esc(getDigitalDownloadFileName(entry))}" style="display:inline-block;padding:9px 12px;background:#6ee7b7;color:#0f172a;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;">Download ${esc(getDigitalDownloadFileName(entry))}</a>
            <div style="font-size:12px;color:#95a3b8;margin-top:4px;">${esc(getDigitalDownloadFileName(entry))}</div>
          </div>
        `).join('')}
      </div>`
    : '';

  const normalizedAmounts = normalizeReceiptAmounts(order, items);
  const computedSubtotal = normalizedAmounts.subtotal;
  const computedShipping = normalizedAmounts.shipping;
  const computedTax = normalizedAmounts.tax;
  const computedTotal = normalizedAmounts.total;

  return `
    <div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:760px;margin:0 auto;padding:20px;border:1px solid #2e3642;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-size:14px;color:#9fb0c6;">Photo Lab</div>
          <div style="font-size:28px;font-weight:700;color:#fff;">Customer Invoice</div>
          <div style="font-size:13px;color:#9fb0c6;margin-top:6px;">Order #${esc(order.id)} • ${esc(formatDateTime(order.createdAt))}</div>
        </div>
      </div>

      <div style="margin-top:16px;font-size:14px;color:#d3dceb;">Thanks${customerName ? ` ${esc(customerName)}` : ''}! Your order has been ${isUpdate ? 'updated' : 'received'}.</div>

      <div style="margin-top:10px;font-size:15px;color:#b8c2d1;">
        <strong>Status:</strong> ${
          order.approval_status && order.approval_status !== 'approved'
            ? 'Pending Review'
            : esc(order.status || 'processing')
        }
      </div>
      ${customMessage ? `<div style=\"margin-top:10px;font-size:15px;color:#7cc7ff;\"><strong>Message:</strong> ${esc(customMessage)}</div>` : ''}

      <table style="width:100%;border-collapse:collapse;margin-top:18px;background:#111722;border:1px solid #303846;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#1a2330;color:#b9c7da;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;">
            <th style="text-align:left;padding:10px 8px;">Product</th>
            <th style="text-align:left;padding:10px 8px;">Image Name</th>
            <th style="text-align:right;padding:10px 8px;">Unit Price</th>
            <th style="text-align:right;padding:10px 8px;">Qty</th>
            <th style="text-align:right;padding:10px 8px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${renderItemsRows(items)}
        </tbody>
      </table>

      ${downloadSection}

      <div style="margin-top:18px;display:flex;justify-content:flex-end;">
        <table style="width:300px;border-collapse:collapse;color:#d3dceb;">
          <tr><td style="padding:4px 0;">Item(s) Subtotal:</td><td style="padding:4px 0;text-align:right;">${currency(computedSubtotal)}</td></tr>
          <tr><td style="padding:4px 0;">Shipping:</td><td style="padding:4px 0;text-align:right;">${currency(computedShipping)}</td></tr>
          <tr><td style="padding:4px 0;">Sales Tax:</td><td style="padding:4px 0;text-align:right;">${currency(computedTax)}</td></tr>
          ${discountCodeRow}
          ${discountAmountRow}
          <tr><td style="padding:8px 0 0 0;font-weight:700;color:#fff;">Grand Total:</td><td style="padding:8px 0 0 0;text-align:right;font-weight:700;color:#fff;">${currency(computedTotal)}</td></tr>
        </table>
      </div>

      ${appBaseUrl ? `<div style=\"margin-top:18px;font-size:13px;\"><a href=\"${esc(appBaseUrl)}\" style=\"color:#7cc7ff;\">Open Photo Lab</a></div>` : ''}
    </div>
  `;
};

const renderStudioSaleHtml = ({ order, items, customerEmail, studioName }) => {
  const normalizedAmounts = normalizeReceiptAmounts(order, items);
  const computedSubtotal = normalizedAmounts.subtotal;
  const computedShipping = normalizedAmounts.shipping;
  const computedTax = normalizedAmounts.tax;
  const computedTotal = normalizedAmounts.total;

  const discount = resolveDiscountDetails(order);
  const discountCodeRow = discount.code
    ? `<tr><td style="padding:4px 0;">Discount code:</td><td style="padding:4px 0;text-align:right;">${esc(discount.code)}</td></tr>`
    : '';
  const discountAmountRow = discount.amount > 0
    ? `<tr><td style="padding:4px 0;">Discount:</td><td style="padding:4px 0;text-align:right;color:#86efac;">-${currency(discount.amount)}</td></tr>`
    : '';
  const orderUrl = order?.orderUrl ? String(order.orderUrl) : null;
  // Try to extract customer name/address from order.shippingAddress (JSON string) or fallback
  let shipping = {};
  try {
    if (order.shippingAddress) shipping = JSON.parse(order.shippingAddress);
  } catch {}
  const customerName = shipping.fullName || order.customerName || '';
  const addressLines = [
    shipping.addressLine1,
    shipping.addressLine2,
    [shipping.city, shipping.state, shipping.zipCode].filter(Boolean).join(', '),
    shipping.country
  ].filter(Boolean);

  return `
    <div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:760px;margin:0 auto;padding:20px;border:1px solid #84cc16;border-radius:12px;">
      <div style="font-size:44px;line-height:1;">💸</div>
      <div style="font-size:44px;line-height:1;">🔥</div>
      <div style="font-size:42px;font-weight:800;color:#fff;margin-top:8px;">Cha-ching! You just made a sale.</div>
      <div style="margin-top:14px;font-size:16px;color:#c7d2e3;">${studioName ? `${esc(studioName)} — ` : ''}New order${customerEmail ? ` from <strong style=\"color:#a3e635;\">${esc(customerEmail)}</strong>` : ''}.</div>

      <div style="margin-top:18px;padding:14px 18px;background:#181e29;border-radius:8px;max-width:420px;">
        <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:2px;">Customer Info</div>
        <div style="font-size:14px;color:#eaf1fb;">${esc(customerName)}</div>
        ${addressLines.length > 0 ? `<div style=\"font-size:13px;color:#b8c2d1;margin-top:2px;\">${addressLines.map(esc).join('<br/>')}</div>` : ''}
      </div>

      ${orderUrl ? `<div style=\"margin-top:14px;\"><a href=\"${esc(orderUrl)}\" style=\"display:inline-block;padding:10px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;\">View Order</a></div>` : ''}

      <div style="margin-top:18px;font-size:24px;font-weight:700;color:#fff;">Here's what they ordered</div>
      <table style="width:100%;border-collapse:collapse;margin-top:14px;">
        <thead>
          <tr style="color:#9fb0c6;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;">
            <th style="text-align:left;padding:8px 6px;">Quantity</th>
            <th style="text-align:left;padding:8px 6px;">Item Description</th>
            <th style="text-align:right;padding:8px 6px;">Line Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const qty = Number(item.quantity || 0);
            const line = (Number(item.unitPrice ?? item.price ?? 0) * qty);
            return `<tr>
              <td style=\"padding:8px 6px;border-bottom:1px solid #313a47;\">${qty}</td>
              <td style=\"padding:8px 6px;border-bottom:1px solid #313a47;\">${esc(item.productName || 'Product')}<div style=\"font-size:12px;color:#95a3b8;\">${esc(item.photoFileName || '')}</div></td>
              <td style=\"padding:8px 6px;border-bottom:1px solid #313a47;text-align:right;\">${currency(line)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <table style="width:300px;border-collapse:collapse;color:#d3dceb;">
          <tr><td style="padding:4px 0;">Order Subtotal:</td><td style="padding:4px 0;text-align:right;">${currency(computedSubtotal)}</td></tr>
          <tr><td style="padding:4px 0;">Taxes:</td><td style="padding:4px 0;text-align:right;">${currency(computedTax)}</td></tr>
          ${discountCodeRow}
          ${discountAmountRow}
          <tr><td style="padding:8px 0 0 0;font-weight:700;color:#fff;">Total:</td><td style="padding:8px 0 0 0;text-align:right;font-weight:700;color:#fff;">${currency(computedTotal)}</td></tr>
        </table>
      </div>
    </div>
  `;
};

const renderItemsTable = (items, { includeCosts = false } = {}) => {
  const rows = items.map((item) => {
    const photoName = item.photoFileName || `Photo #${item.photoId}`;
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const quantity = Number(item.quantity || 0);
    const lineTotal = unitPrice * quantity;
    const costCell = includeCosts
      ? `<td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency(item.basePrice)}</td>
         <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency(item.cost)}</td>`
      : '';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(photoName)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(item.productName || 'Product')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency(unitPrice)}</td>
      ${costCell}
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency(lineTotal)}</td>
    </tr>`;
  }).join('');

  const costHeaders = includeCosts
    ? '<th style="text-align:right;padding:8px;">Base</th><th style="text-align:right;padding:8px;">Cost</th>'
    : '';

  return `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:#f8f8f8;">
        <th style="text-align:left;padding:8px;">Photo</th>
        <th style="text-align:left;padding:8px;">Product</th>
        <th style="text-align:right;padding:8px;">Qty</th>
        <th style="text-align:right;padding:8px;">Unit</th>
        ${costHeaders}
        <th style="text-align:right;padding:8px;">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

const summaryBlock = (order, { includeInternal = false, studioName } = {}) => {
  const stripeFeeRow = includeInternal
    ? `<tr><td style="padding:4px 0;">Stripe fee</td><td style="padding:4px 0;text-align:right;">${currency(order.stripeFeeAmount)}</td></tr>`
    : '';
  const studioProfitRow = includeInternal
    ? `<tr><td style="padding:4px 0;">Studio net profit</td><td style="padding:4px 0;text-align:right;">${currency(order.studioProfitNet)}</td></tr>`
    : '';
  const superAdminRow = includeInternal
    ? `<tr><td style="padding:4px 0;">Super admin profit</td><td style="padding:4px 0;text-align:right;">${currency(order.superAdminProfit)}</td></tr>`
    : '';
  const studioRow = studioName ? `<p style="margin:0 0 12px 0;color:#666;">Studio: ${esc(studioName)}</p>` : '';

  // If all items are digital, recalculate all amounts from items only
  let computedSubtotal = 0;
  let computedShipping = 0;
  let computedTax = 0;
  let computedTotal = 0;
  let computedStripeFee = 0;
  let computedStudioRevenue = 0;
  let computedGrossStudioMarkup = 0;
  let computedStudioProfit = 0;
  let computedSuperAdminProfit = 0;
  const normalizedAmounts = normalizeReceiptAmounts(order, order.items || []);
  if (order.items && order.items.length > 0 && order.items.every((item) => isDigitalLikeItem(item))) {
    computedSubtotal = normalizedAmounts.subtotal;
    computedShipping = normalizedAmounts.shipping;
    computedTax = normalizedAmounts.tax;
    computedTotal = normalizedAmounts.total;
    // Internal accounting for digital-only
    computedStripeFee = Number(order.stripeFeeAmount ?? 0);
    computedStudioRevenue = computedSubtotal;
    // For digital, markup = subtotal - total cost (should be 0 cost for digital, but if cost exists, subtract it)
    const totalCost = order.items.reduce((sum, item) => sum + (Number(item.productionCostAmount ?? 0) * Number(item.quantity || 0)), 0);
    computedGrossStudioMarkup = +(computedSubtotal - totalCost).toFixed(2);
    computedStudioProfit = +(computedGrossStudioMarkup - computedStripeFee).toFixed(2);
    computedSuperAdminProfit = 0;
  } else {
    computedSubtotal = normalizedAmounts.subtotal;
    computedShipping = normalizedAmounts.shipping;
    computedTax = normalizedAmounts.tax;
    computedTotal = normalizedAmounts.total;
    computedStripeFee = Number(order.stripeFeeAmount ?? 0);
    computedStudioRevenue = Number(order.studioRevenue ?? 0);
    computedGrossStudioMarkup = Number(order.grossStudioMarkup ?? 0);
    computedStudioProfit = Number(order.studioProfitNet ?? 0);
    computedSuperAdminProfit = Number(order.superAdminProfit ?? 0);
  }
  return `${studioRow}
    <table style="width:100%;max-width:420px;border-collapse:collapse;margin-top:16px;">
      <tr><td style="padding:4px 0;">Subtotal</td><td style="padding:4px 0;text-align:right;">${currency(computedSubtotal)}</td></tr>
      <tr><td style="padding:4px 0;">Shipping</td><td style="padding:4px 0;text-align:right;">${currency(computedShipping)}</td></tr>
      <tr><td style="padding:4px 0;">Tax</td><td style="padding:4px 0;text-align:right;">${currency(computedTax)}</td></tr>
      <tr><td style="padding:4px 0;">Total charged</td><td style="padding:4px 0;text-align:right;">${currency(computedTotal)}</td></tr>
      <tr><td style="padding:4px 0;">Studio revenue</td><td style="padding:4px 0;text-align:right;">${currency(computedStudioRevenue)}</td></tr>
      <tr><td style="padding:4px 0;">Gross studio markup</td><td style="padding:4px 0;text-align:right;">${currency(computedGrossStudioMarkup)}</td></tr>
      <tr><td style="padding:4px 0;">Stripe fee</td><td style="padding:4px 0;text-align:right;">${currency(computedStripeFee)}</td></tr>
      <tr><td style="padding:4px 0;">Estimated studio profit</td><td style="padding:4px 0;text-align:right;">${currency(computedStudioProfit)}</td></tr>
      <tr><td style="padding:4px 0;">Super admin profit</td><td style="padding:4px 0;text-align:right;">${currency(computedSuperAdminProfit)}</td></tr>
      ${stripeFeeRow}
      ${studioProfitRow}
      ${superAdminRow}
    </table>`;
};

const wrapHtml = (title, intro, content) => `
  <div style="font-family:Arial,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:24px;">
    <h1 style="margin:0 0 8px 0;">${esc(title)}</h1>
    <p style="margin:0 0 16px 0;color:#555;">${intro}</p>
    ${content}
    ${appBaseUrl ? `<p style="margin-top:24px;"><a href="${esc(appBaseUrl)}">Open Photo Lab</a></p>` : ''}
  </div>`;

const renderInternalAccounting = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const normalized = normalizeReceiptAmounts(order, items);
  const discount = (normalized.subtotal + normalized.tax) - normalized.total;

  const itemStudioRevenue = items.reduce(
    (sum, item) => sum + ((Number(item?.unitPrice ?? item?.price ?? 0) || 0) * (Number(item?.quantity || 0) || 0)),
    0
  );
  const itemBaseCost = items.reduce(
    (sum, item) => sum + ((Number(item?.productionCostAmount ?? item?.baseCost ?? item?.cost ?? 0) || 0) * (Number(item?.quantity || 0) || 0)),
    0
  );

  const studioRevenue = itemStudioRevenue > 0
    ? Number(itemStudioRevenue.toFixed(2))
    : Math.max(0, Number(order.studioRevenue) - discount);
  const baseCostTotal = Number(itemBaseCost.toFixed(2));
  const explicitStudioShippingCost = Number(order?.studioShippingCost ?? order?.studio_shipping_cost);
  // Use explicit studio shipping cost if available, otherwise 0 (no data yet)
  const studioShippingCost = Number.isFinite(explicitStudioShippingCost)
    ? Number(explicitStudioShippingCost.toFixed(2))
    : Number(0);
  const explicitShippingMargin = Number(order?.shippingMargin ?? order?.shipping_margin);
  const shippingMargin = Number.isFinite(explicitShippingMargin)
    ? Number(explicitShippingMargin.toFixed(2))
    : Number((normalized.shipping - studioShippingCost).toFixed(2));
  const whccLabTax = Number(order.whccLabTax ?? order.whcc_lab_tax ?? 0);
  const otherOrderCosts = Number((Math.max(0, studioShippingCost - normalized.shipping) + whccLabTax).toFixed(2));
  const stripeFeeAmount = Number((Number(order.stripeFeeAmount || 0)).toFixed(2));
  const grossMargin = Number((studioRevenue - baseCostTotal - otherOrderCosts - stripeFeeAmount).toFixed(2));

  return `
    <div style="margin-top:20px;padding:16px;border:1px solid #eee;border-radius:8px;background:#fafafa;">
      <h2 style="margin:0 0 12px 0;font-size:18px;">Internal accounting</h2>
      <table style="width:100%;max-width:480px;border-collapse:collapse;">
        <tr><td style="padding:4px 0;">Studio price total</td><td style="padding:4px 0;text-align:right;">${currency(studioRevenue)}</td></tr>
        <tr><td style="padding:4px 0;">Base cost total</td><td style="padding:4px 0;text-align:right;">${currency(baseCostTotal)}</td></tr>
        <tr><td style="padding:4px 0;">Customer shipping charged</td><td style="padding:4px 0;text-align:right;">${currency(normalized.shipping)}</td></tr>
        <tr><td style="padding:4px 0;">Studio shipping cost</td><td style="padding:4px 0;text-align:right;">${currency(studioShippingCost)}</td></tr>
        <tr><td style="padding:4px 0;">Shipping margin</td><td style="padding:4px 0;text-align:right;">${currency(shippingMargin)}</td></tr>
        <tr><td style="padding:4px 0;">Other order costs</td><td style="padding:4px 0;text-align:right;">${currency(otherOrderCosts)}</td></tr>
        <tr><td style="padding:4px 0;">Stripe fee</td><td style="padding:4px 0;text-align:right;">${currency(stripeFeeAmount)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Gross margin</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${currency(grossMargin)}</td></tr>
      </table>
      ${order.orderUrl ? `<p style="margin:12px 0 0 0;"><a href="${esc(order.orderUrl)}">View this order in Photo Lab</a></p>` : ''}
    </div>`;
};

// ─── Player photo notification ────────────────────────────────────────────────

const renderPlayerPhotoNotificationHtml = ({ customerName, playerName, playerNumber, albumName, albumUrl, studioName, photoCount }) => {
  const playerLabel = playerNumber ? `${playerName} (#${playerNumber})` : playerName;
  const photoWord = photoCount === 1 ? 'photo' : 'photos';
  return `
<div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:600px;margin:0 auto;padding:24px;border:1px solid #2e3642;border-radius:12px;">
  <div style="margin-bottom:20px;">
    <div style="font-size:13px;color:#9fb0c6;margin-bottom:4px;">${esc(studioName || 'Photo Lab')}</div>
    <div style="font-size:22px;font-weight:700;color:#fff;">New photo${photoCount !== 1 ? 's' : ''} added!</div>
  </div>

  <p style="color:#d0d8e3;margin:0 0 16px 0;">
    Hi ${esc(customerName || 'there')},
  </p>
  <p style="color:#d0d8e3;margin:0 0 20px 0;">
    ${photoCount} new ${photoWord} featuring <strong style="color:#fff;">${esc(playerLabel)}</strong>
    ${albumName ? `in the album <strong style="color:#fff;">${esc(albumName)}</strong>` : ''} ${photoCount === 1 ? 'has' : 'have'} just been added.
  </p>

  ${albumUrl ? `
  <div style="text-align:center;margin:24px 0;">
    <a href="${esc(albumUrl)}"
       style="display:inline-block;padding:12px 28px;background:#6ee7b7;color:#0f172a;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
      View Album
    </a>
  </div>
  ` : ''}

  <p style="font-size:12px;color:#6b7a8d;margin:24px 0 0 0;">
    You're receiving this because you added <strong>${esc(playerLabel)}</strong> to your player watchlist.
    <br/>To manage your notifications, visit your
    <a href="${esc(appBaseUrl ? `${appBaseUrl}/account` : '/account')}" style="color:#6ee7b7;">account page</a>.
  </p>
</div>`.trim();
};

export const orderReceiptService = {
  isConfigured,

  /**
   * Send a notification to a customer that new photos were tagged for a watched player.
   * @param {object} opts
   * @param {string}   opts.to            - recipient email
   * @param {string}   [opts.customerName]
   * @param {string}   opts.playerName
   * @param {string}   [opts.playerNumber]
   * @param {string}   [opts.albumName]
   * @param {string}   [opts.albumUrl]    - full URL to the album
   * @param {string}   [opts.studioName]
   * @param {number}   [opts.photoCount]  - how many photos were newly tagged
   */
  async sendPlayerPhotoNotification({ to, customerName, playerName, playerNumber, albumName, albumUrl, studioName, photoCount = 1 }) {
    if (!isConfigured() || !to) return false;
    const playerLabel = playerNumber ? `${playerName} (#${playerNumber})` : playerName;
    const albumPart = albumName ? ` in "${albumName}"` : '';
    const photoWord = photoCount === 1 ? 'photo' : 'photos';
    try {
      // Build reply_to object - Mailtrap requires it to be an object, not a string
      let replyToObj = null;
      if (this._replyTo) {
        replyToObj = { email: this._replyTo };
      } else if (smtpReplyTo) {
        replyToObj = { email: smtpReplyTo };
      }
      
      const mailPayload = {
        from: {
          email: mailtrapSenderEmail,
          name: mailtrapSenderName,
        },
        to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
        subject: `New ${photoWord} added for ${playerLabel}${albumPart}`,
        html: renderPlayerPhotoNotificationHtml({ customerName, playerName, playerNumber, albumName, albumUrl, studioName, photoCount }),
        text: `Hi ${customerName || 'there'},\n\n${photoCount} new ${photoWord} featuring ${playerLabel}${albumPart} have been added.\n${albumUrl ? `\nView the album: ${albumUrl}` : ''}\n\nManage your watchlist: ${appBaseUrl ? `${appBaseUrl}/account` : '/account'}`,
        category: 'Player Photo Notification',
      };
      
      if (replyToObj) {
        mailPayload.reply_to = replyToObj;
      }
      
      await mailtrapClient.send(mailPayload);
    } catch (emailErr) {
      // ...existing code...
      return false;
    }
    return true;
  },

  async sendCustomerReceipt({ to, customerName, order, items, digitalDownloads = [], customMessage, isUpdate, replyTo }) {
    if (!isConfigured() || !to) return false;
    const html = renderCustomerReceiptHtml({ customerName, order, items, digitalDownloads, customMessage, isUpdate });
    const discount = resolveDiscountDetails(order);
    const discountText = discount.hasDiscount
      ? `\nDiscount code: ${discount.code || 'N/A'}${discount.amount > 0 ? `\nDiscount amount: -${currency(discount.amount)}` : ''}`
      : '';
    let replyToObj = undefined;
    const replyToEmail = replyTo || smtpReplyTo;
    if (replyToEmail) {
      replyToObj = { email: replyToEmail };
    }
    await mailtrapClient.send({
      from: {
        email: mailtrapSenderEmail,
        name: mailtrapSenderName,
      },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      subject: `Photo Lab receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nStatus: ${order.status || 'processing'}${customMessage ? `\nMessage: ${customMessage}` : ''}\nTotal charged: ${currency(order.totalAmount ?? order.total ?? 0)}\nSubtotal: ${currency(order.subtotal ?? order.sub_total ?? 0)}\nShipping: ${currency(order.shippingCost ?? order.shipping_cost ?? 0)}\nTax: ${currency(order.taxAmount ?? order.tax_amount ?? 0)}${discountText}${digitalDownloads.length ? `\nDigital downloads:\n${digitalDownloads.map((entry) => `- ${getDigitalDownloadFileName(entry)}: ${entry.url}`).join('\n')}` : ''}`,
      ...(replyToObj ? { reply_to: replyToObj } : {}),
      category: 'Order Receipt',
    });
    return true;
  },

  async sendStudioReceipt({ to, bcc, studioName, order, items, customerEmail }) {
    if (!isConfigured() || !to) return false;
    // Only show studio markup, stripe fee, and studio profit in studio emails
    const html = `${renderStudioSaleHtml({ order, items, customerEmail, studioName })}${renderInternalAccounting({ ...order, items })}`;
    const discount = resolveDiscountDetails(order);
    const discountText = discount.hasDiscount
      ? `\nDiscount code: ${discount.code || 'N/A'}${discount.amount > 0 ? `\nDiscount amount: -${currency(discount.amount)}` : ''}`
      : '';
    let replyToObj = undefined;
    if (smtpReplyTo) {
      replyToObj = { email: smtpReplyTo };
    }
    await mailtrapClient.send({
      from: {
        email: mailtrapSenderEmail,
        name: mailtrapSenderName,
      },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      bcc: Array.isArray(bcc) && bcc.length > 0 ? bcc.map(email => ({ email })) : undefined,
      subject: `Studio receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nStudio: ${studioName || 'Unknown'}\nCustomer: ${customerEmail || 'Unknown'}\nTotal charged: ${currency(order.totalAmount)}\nStudio price total: ${currency(order.studioRevenue)}\nBase cost total: ${currency(order.baseRevenue ?? order.productionCost)}\nCustomer shipping charged: ${currency(order.shippingCost)}\nStudio shipping cost: ${currency(order.studioShippingCost ?? order.shippingCost)}\nOther order costs: ${currency(Math.max(0, Number(order.studioShippingCost ?? order.shippingCost ?? 0) - Number(order.shippingCost ?? 0)))}\nStripe fee: ${currency(order.stripeFeeAmount)}\nGross margin: ${currency((Number(order.studioRevenue || 0) - Number(order.baseRevenue ?? order.productionCost ?? 0) - Math.max(0, Number(order.studioShippingCost ?? order.shippingCost ?? 0) - Number(order.shippingCost ?? 0)) - Number(order.stripeFeeAmount || 0)))}${discountText}${order.orderUrl ? `\nOrder link: ${order.orderUrl}` : ''}`,
      ...(replyToObj ? { reply_to: replyToObj } : {}),
      category: 'Studio Receipt',
    });
    return true;
  },
};

export default orderReceiptService;
