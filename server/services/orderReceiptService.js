import nodemailer from 'nodemailer';

const smtpHost = String(process.env.SMTP_HOST || '').trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || '').trim();
const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const smtpFrom = String(process.env.SMTP_FROM || '').trim() || 'Photo Lab <no-reply@photolab.local>';
const smtpReplyTo = String(process.env.SMTP_REPLY_TO || '').trim() || undefined;
const appBaseUrl = String(process.env.APP_BASE_URL || '').trim();

let transporterPromise = null;

const currency = (amount) => `$${Number(amount || 0).toFixed(2)}`;
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const isConfigured = () => Boolean(smtpHost && smtpUser && smtpPassword);

const getTransporter = async () => {
  if (!isConfigured()) return null;
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      })
    );
  }
  return transporterPromise;
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

export const orderReceiptService = {
  isConfigured,

  async sendCustomerReceipt({ to, customerName, order, items }) {
    const transporter = await getTransporter();
    if (!transporter || !to) return false;

    const html = wrapHtml(
      `Your receipt for Order #${order.id}`,
      `Thanks${customerName ? ` ${esc(customerName)}` : ''}! Your order has been received.`,
      `${summaryBlock(order)}${renderItemsTable(items)}`
    );

    await transporter.sendMail({
      from: smtpFrom,
      to,
      replyTo: smtpReplyTo,
      subject: `Photo Lab receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nTotal charged: ${currency(order.totalAmount)}\nSubtotal: ${currency(order.subtotal)}\nShipping: ${currency(order.shippingCost)}\nTax: ${currency(order.taxAmount)}`,
    });
    return true;
  },

  async sendStudioReceipt({ to, studioName, order, items, customerEmail }) {
    const transporter = await getTransporter();
    if (!transporter || !to) return false;

    const html = wrapHtml(
      `Studio receipt for Order #${order.id}`,
      `A new order was placed${customerEmail ? ` by ${esc(customerEmail)}` : ''}.`,
      `${summaryBlock(order, { includeInternal: true, studioName })}${renderItemsTable(items, { includeCosts: true })}`
    );

    await transporter.sendMail({
      from: smtpFrom,
      to,
      replyTo: smtpReplyTo,
      subject: `Studio receipt — Order #${order.id}`,
      html,
      text: `Order #${order.id}\nStudio: ${studioName || 'Unknown'}\nCustomer: ${customerEmail || 'Unknown'}\nTotal charged: ${currency(order.totalAmount)}\nStripe fee: ${currency(order.stripeFeeAmount)}\nStudio net profit: ${currency(order.studioProfitNet)}\nSuper admin profit: ${currency(order.superAdminProfit)}`,
    });
    return true;
  },
};

export default orderReceiptService;
