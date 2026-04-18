
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

const renderItemsRows = (items) => items.map((item) => {
  const photoName = item.photoFileName || `Photo #${item.photoId}`;
  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
  const quantity = Number(item.quantity || 0);
  const lineTotal = unitPrice * quantity;
  return `<tr>
    <td style="padding:10px 8px;border-bottom:1px solid #343b45;color:#e7edf6;">${esc(item.productName || 'Product')}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #343b45;color:#d0d8e3;">${esc(photoName)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#d0d8e3;">${currency(unitPrice)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#d0d8e3;">${quantity}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #343b45;text-align:right;color:#fff;">${currency(lineTotal)}</td>
  </tr>`;
}).join('');

const renderCustomerReceiptHtml = ({ customerName, order, items, digitalDownloads }) => {
  const downloadSection = Array.isArray(digitalDownloads) && digitalDownloads.length > 0
    ? `<div style="margin-top:20px;padding:16px;border:1px solid #3f4957;border-radius:10px;background:#141922;">
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px;">Digital Downloads</div>
        <div style="font-size:13px;color:#b8c2d1;margin-bottom:10px;">Use your unique links below to download your digital products.</div>
        ${digitalDownloads.map((entry) => `
          <div style="margin-bottom:8px;">
            <a href="${esc(entry.url)}" style="display:inline-block;padding:9px 12px;background:#6ee7b7;color:#0f172a;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;">Download ${esc(entry.productName || 'Digital Product')}</a>
            <div style="font-size:12px;color:#95a3b8;margin-top:4px;">${esc(entry.photoFileName || '')}</div>
          </div>
        `).join('')}
      </div>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:760px;margin:0 auto;padding:20px;border:1px solid #2e3642;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-size:14px;color:#9fb0c6;">Photo Lab</div>
          <div style="font-size:28px;font-weight:700;color:#fff;">Customer Invoice</div>
          <div style="font-size:13px;color:#9fb0c6;margin-top:6px;">Order #${esc(order.id)} • ${esc(formatDateTime(order.createdAt))}</div>
        </div>
      </div>

      <div style="margin-top:16px;font-size:14px;color:#d3dceb;">Thanks${customerName ? ` ${esc(customerName)}` : ''}! Your order has been received.</div>

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
          <tr><td style="padding:4px 0;">Item(s) Subtotal:</td><td style="padding:4px 0;text-align:right;">${currency(order.subtotal)}</td></tr>
          <tr><td style="padding:4px 0;">Shipping:</td><td style="padding:4px 0;text-align:right;">${currency(order.shippingCost)}</td></tr>
          <tr><td style="padding:4px 0;">Sales Tax:</td><td style="padding:4px 0;text-align:right;">${currency(order.taxAmount)}</td></tr>
          <tr><td style="padding:8px 0 0 0;font-weight:700;color:#fff;">Grand Total:</td><td style="padding:8px 0 0 0;text-align:right;font-weight:700;color:#fff;">${currency(order.totalAmount)}</td></tr>
        </table>
      </div>

      ${appBaseUrl ? `<div style="margin-top:18px;font-size:13px;"><a href="${esc(appBaseUrl)}" style="color:#7cc7ff;">Open Photo Lab</a></div>` : ''}
    </div>
  `;
};

const renderStudioSaleHtml = ({ order, items, customerEmail, studioName }) => {
  const orderUrl = order?.orderUrl ? String(order.orderUrl) : null;
  return `
    <div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:760px;margin:0 auto;padding:20px;border:1px solid #84cc16;border-radius:12px;">
      <div style="font-size:44px;line-height:1;">💸</div>
      <div style="font-size:44px;line-height:1;">🔥</div>
      <div style="font-size:42px;font-weight:800;color:#fff;margin-top:8px;">Cha-ching! You just made a sale.</div>
      <div style="margin-top:14px;font-size:16px;color:#c7d2e3;">${studioName ? `${esc(studioName)} — ` : ''}New order${customerEmail ? ` from <strong style="color:#a3e635;">${esc(customerEmail)}</strong>` : ''}.</div>

      ${orderUrl ? `<div style="margin-top:14px;"><a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">View Order</a></div>` : ''}

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
              <td style="padding:8px 6px;border-bottom:1px solid #313a47;">${qty}</td>
              <td style="padding:8px 6px;border-bottom:1px solid #313a47;">${esc(item.productName || 'Product')}<div style="font-size:12px;color:#95a3b8;">${esc(item.photoFileName || '')}</div></td>
              <td style="padding:8px 6px;border-bottom:1px solid #313a47;text-align:right;">${currency(line)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <table style="width:300px;border-collapse:collapse;color:#d3dceb;">
          <tr><td style="padding:4px 0;">Order Subtotal:</td><td style="padding:4px 0;text-align:right;">${currency(order.subtotal)}</td></tr>
          <tr><td style="padding:4px 0;">Taxes:</td><td style="padding:4px 0;text-align:right;">${currency(order.taxAmount)}</td></tr>
          <tr><td style="padding:8px 0 0 0;font-weight:700;color:#fff;">Total:</td><td style="padding:8px 0 0 0;text-align:right;font-weight:700;color:#fff;">${currency(order.totalAmount)}</td></tr>
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

  return `${studioRow}
    <table style="width:100%;max-width:420px;border-collapse:collapse;margin-top:16px;">
      <tr><td style="padding:4px 0;">Subtotal</td><td style="padding:4px 0;text-align:right;">${currency(order.subtotal)}</td></tr>
      <tr><td style="padding:4px 0;">Shipping</td><td style="padding:4px 0;text-align:right;">${currency(order.shippingCost)}</td></tr>
      <tr><td style="padding:4px 0;">Tax</td><td style="padding:4px 0;text-align:right;">${currency(order.taxAmount)}</td></tr>
      <tr><td style="padding:4px 0;">Total charged</td><td style="padding:4px 0;text-align:right;">${currency(order.totalAmount)}</td></tr>
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

const renderInternalAccounting = (order) => `
  <div style="margin-top:20px;padding:16px;border:1px solid #eee;border-radius:8px;background:#fafafa;">
    <h2 style="margin:0 0 12px 0;font-size:18px;">Internal accounting</h2>
    <table style="width:100%;max-width:480px;border-collapse:collapse;">
      <tr><td style="padding:4px 0;">Studio revenue</td><td style="padding:4px 0;text-align:right;">${currency(order.studioRevenue)}</td></tr>
      <tr><td style="padding:4px 0;">Gross studio markup</td><td style="padding:4px 0;text-align:right;">${currency(order.grossStudioMarkup)}</td></tr>
      <tr><td style="padding:4px 0;">Stripe fee</td><td style="padding:4px 0;text-align:right;">${currency(order.stripeFeeAmount)}</td></tr>
      <tr><td style="padding:4px 0;font-weight:bold;">Estimated studio profit</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${currency(order.studioProfitNet)}</td></tr>
    </table>
    ${order.orderUrl ? `<p style="margin:12px 0 0 0;"><a href="${esc(order.orderUrl)}">View this order in Photo Lab</a></p>` : ''}
  </div>`;

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
      await mailtrapClient.send({
        from: {
          email: mailtrapSenderEmail,
          name: mailtrapSenderName,
        },
        to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
        subject: `New ${photoWord} added for ${playerLabel}${albumPart}`,
        html: renderPlayerPhotoNotificationHtml({ customerName, playerName, playerNumber, albumName, albumUrl, studioName, photoCount }),
        text: `Hi ${customerName || 'there'},\n\n${photoCount} new ${photoWord} featuring ${playerLabel}${albumPart} have been added.\n${albumUrl ? `\nView the album: ${albumUrl}` : ''}\n\nManage your watchlist: ${appBaseUrl ? `${appBaseUrl}/account` : '/account'}`,
        reply_to: smtpReplyTo,
        category: 'Player Photo Notification',
      });
    } catch (emailErr) {
      // ...existing code...
      return false;
    }
    return true;
  },

  async sendCustomerReceipt({ to, customerName, order, items, digitalDownloads = [] }) {
    if (!isConfigured() || !to) return false;
    const html = renderCustomerReceiptHtml({ customerName, order, items, digitalDownloads });
    await mailtrapClient.send({
      from: {
        email: mailtrapSenderEmail,
        name: mailtrapSenderName,
      },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      subject: `Photo Lab receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nTotal charged: ${currency(order.totalAmount)}\nSubtotal: ${currency(order.subtotal)}\nShipping: ${currency(order.shippingCost)}\nTax: ${currency(order.taxAmount)}${digitalDownloads.length ? `\nDigital downloads:\n${digitalDownloads.map((entry) => `- ${entry.productName || 'Digital product'}: ${entry.url}`).join('\n')}` : ''}`,
      reply_to: smtpReplyTo,
      category: 'Order Receipt',
    });
    return true;
  },

  async sendStudioReceipt({ to, bcc, studioName, order, items, customerEmail }) {
    if (!isConfigured() || !to) return false;
    // Only show studio markup, stripe fee, and studio profit in studio emails
    const html = `${renderStudioSaleHtml({ order, items, customerEmail, studioName })}${renderInternalAccounting(order)}`;
    await mailtrapClient.send({
      from: {
        email: mailtrapSenderEmail,
        name: mailtrapSenderName,
      },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      bcc: Array.isArray(bcc) && bcc.length > 0 ? bcc.map(email => ({ email })) : undefined,
      subject: `Studio receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nStudio: ${studioName || 'Unknown'}\nCustomer: ${customerEmail || 'Unknown'}\nTotal charged: ${currency(order.totalAmount)}\nStudio revenue: ${currency(order.studioRevenue)}\nGross studio markup: ${currency(order.grossStudioMarkup)}\nStripe fee: ${currency(order.stripeFeeAmount)}\nEstimated studio profit: ${currency(order.studioProfitNet)}${order.orderUrl ? `\nOrder link: ${order.orderUrl}` : ''}`,
      reply_to: smtpReplyTo,
      category: 'Studio Receipt',
    });
    return true;
  },
};

export default orderReceiptService;
