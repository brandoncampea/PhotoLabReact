/**
 * One-time seed script: populate release_notes table from recent git history.
 * Run with: node server/scripts/seedReleaseNotes.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const mssqlModule = await import('../mssql.cjs', { assert: { type: 'commonjs' } }).catch(() => import('../mssql.cjs'));
const { queryRow, queryRows, query } = mssqlModule.default || mssqlModule;

// ─── Release notes data ───────────────────────────────────────────────────────
const notes = [
  {
    title: 'Release Notes & Studio Announcements',
    version: 'v2.9',
    date: '2026-06-24',
    summary: 'Super admins can now publish release notes and email feature announcements directly to all studio admins.',
    content: `A new Release Notes system has been added to the platform. Super admins can create detailed release notes for any new feature or improvement, mark them as published, and send them directly to all studio admins as a styled email announcement.

Studio admins will see a "What's New" link in their sidebar that displays all published release notes in a clean, timeline-style layout. Each note shows the version badge, date, a short summary, and the full detailed explanation when expanded.

For super admins, the Release Notes management page (under the Super Admin menu) allows creating and editing notes with a title, optional version tag, one-line summary, and full detailed content. Multiple notes can be selected via checkbox, then sent as a single combined email to all studio admins via BCC — keeping individual email addresses private. The email is professionally styled with the platform branding and each feature section clearly separated.

This means studios will always know what new tools are available to them and how to use them, without needing to ask or discover features by accident.`,
  },
  {
    title: 'Studio Dashboard: Share Link, Favorites & Package Analytics',
    version: 'v2.9',
    date: '2026-06-24',
    summary: 'Three new analytics sections on the studio dashboard: Share Link performance, Saved Photo favorites, and Package sales stats.',
    content: `The admin dashboard at /admin/dashboard now includes three new analytics panels that surface data from recently-launched features.

Share Link Analytics shows how many referral links have been created for your albums, how many visits those links have generated, how many orders came directly from share links, the visit-to-order conversion rate, and breakdowns by top albums and individual link performance. This helps you understand which sharing channels are driving traffic and sales.

Saved Photos (Favorites) Analytics tracks how many photos customers have saved across all your albums, unique session counts, email captures from the save prompt, and the conversion rate from saved photos to purchases. The top saved photos, top albums by favorites count, and top players are listed with thumbnails and counts. If you use the player and school watchlist features, a separate "Tracked Players & Schools" panel shows how many fans are watching specific players or schools, with top watched players, schools, and sport categories.

Package Sales Analytics shows the adoption rate of packages in orders (what percentage of orders included at least one package), package revenue vs. individual product revenue, and a ranked list of your top-selling packages by order count and total revenue.

All three panels only appear when relevant data exists, so they won't clutter the dashboard for studios that haven't used those features yet.`,
  },
  {
    title: 'WHCC Live Pass-Through Shipping',
    version: 'v2.7',
    date: '2026-06-23',
    summary: 'Customers now see a real-time WHCC shipping quote before paying, and studios see a full cost breakdown per order.',
    content: `When a customer places an order for WHCC-fulfilled print products, the checkout now fetches a live shipping quote from WHCC before payment is collected. This means customers are charged the actual WHCC shipping rate rather than an estimated flat fee — eliminating overcharges and undercharges.

During checkout, the shipping line item updates in real time as the quote is retrieved. If the quote fails for any reason, the system falls back to your configured flat shipping rate so checkout is never blocked.

On the admin side, each WHCC order now shows a full cost breakdown: the WHCC shipping amount actually billed to your account, your configured customer-facing shipping charge, and the resulting shipping margin (the difference you keep or absorb). This breakdown is visible in the order details panel so you can always see exactly how shipping costs flow.

The shipping quote is retrieved using a dry-run OrderImport call to WHCC — it calculates the exact shipping cost for the items in the cart without placing the order, then the real order is submitted at payment completion. Product photos for WHCC catalog items are also displayed in the cart and admin panels for easier identification.`,
  },
  {
    title: 'Performance & Caching Improvements',
    version: 'v2.7',
    date: '2026-06-23',
    summary: 'Significantly faster page loads across admin orders, albums, and photo tagging pages via caching and query optimization.',
    content: `Several major performance improvements were made to address slow load times across admin pages.

The admin orders page previously ran a database schema check (DDL query) on every single request to verify column existence — this was a significant source of latency. All DDL checks have been moved to server startup and cached in memory, so they run once rather than per request. The same optimization applies across all routes that were checking for optional columns.

Photo assets and auth token validation are now cached with short TTLs (30 seconds for assets, 5 minutes for auth). This prevents redundant database lookups when the same user or photo is accessed repeatedly in a short window, which is common when loading a grid of photos.

The admin orders page previously had an "auth stampede" problem — when multiple requests arrived simultaneously for the same session, each would independently query the database to validate the session token. These are now deduplicated so only one database call is made per session per TTL window.

N+1 query patterns on the admin orders page (where each order triggered a separate query for its line items) have been replaced with a single batch query that fetches all order items in one round trip.

The result is noticeably faster load times on the orders page, album management page, and photo tagging workflows, especially when managing large albums or high order volumes.`,
  },
  {
    title: 'Pinnable Sidebar Navigation',
    version: 'v2.6',
    date: '2026-06-22',
    summary: 'The admin sidebar can now be pinned open so it stays visible as you navigate between pages.',
    content: `The admin sidebar previously closed automatically whenever you navigated to a new page. It now has a pin toggle (📌 icon in the sidebar header) that locks it open across page navigation.

When pinned, the sidebar sits flush below the top navigation bar and remains visible as you move between albums, orders, settings, and any other admin section. The sidebar's position is calculated dynamically based on the actual height of the navbar, so it aligns correctly regardless of content or viewport size.

When unpinned (the default), the sidebar behaves as before — it opens on hamburger click and closes when you navigate away or click outside. Your pin preference is remembered within your session.

This is particularly useful when managing multiple sections in sequence, like checking orders and then updating album settings, without needing to re-open the sidebar each time.`,
  },
  {
    title: 'SmugMug Photo Import',
    version: 'v2.6',
    date: '2026-06-21',
    summary: 'Import photos directly from your SmugMug account into any album — full resolution, with watermark-safe handling.',
    content: `Studios with a SmugMug account can now import photos directly into PhotoLab albums from the Vendor Integrations page. Connect by entering your SmugMug API key and secret in the Vendor Integrations settings — the integration automatically fetches your SmugMug nickname and confirms the connection.

Once connected, you can browse your SmugMug albums and select photos to import. The import resolves full-size original URLs from SmugMug's API (not the display-size versions), so the photos imported into PhotoLab are the same resolution as your originals. Album cover images are mapped from SmugMug's cover photo.

The import flow handles OAuth authentication with SmugMug, downloads originals through a watermark-safe path, and adds them to the target album with proper file naming. Imported photos are immediately available for tagging, ordering, and watermarking just like photos uploaded directly.

Setup requires a SmugMug API key with read access, which you can generate from your SmugMug account's API settings. Once the API key and secret are saved in Vendor Integrations, the connection persists and no re-authentication is needed for subsequent imports.`,
  },
  {
    title: 'Studio Trial System & Onboarding Checklist',
    version: 'v2.5',
    date: '2026-06-17',
    summary: 'New studios start on a free trial with a guided onboarding checklist to help them get set up quickly.',
    content: `New studio accounts now begin with a free trial period. During the trial, all features are available without restriction so studios can fully evaluate the platform before subscribing.

An onboarding checklist appears on the dashboard for new studios, guiding them through the key setup steps: uploading their studio logo, creating their first album, setting up a price list, configuring shipping, and connecting a payment method. Each step can be checked off as it's completed, and the checklist collapses once all steps are done.

Super admins can view and manage all studios' trial status, subscription state, and billing from the Studio Admins and Studio Payments pages. When a trial expires, the studio is notified and prompted to select a subscription plan. Super admins receive notifications when new studios sign up or when trials expire.

The subscription management page at /admin/subscription allows studio admins to view their current plan, upgrade, and manage their billing. Subscription plans are configurable by super admins and support multiple tiers.`,
  },
  {
    title: 'Package Ordering',
    version: 'v2.5',
    date: '2026-06-17',
    summary: 'Customers can now order pre-built packages of prints and digitals, with full cart, receipt, and accounting support.',
    content: `Studios can now create and sell photo packages — bundled collections of print sizes and digital downloads sold at a single package price. Packages are configured in the Packages section of the admin menu and can include any combination of products and sizes.

When a customer browses a photo and selects a package, all items in the package are added to the cart as a group. The cart groups package items together visually under the package name so customers clearly see what they're getting. Package pricing is shown as the total package price, not individual item prices.

On the checkout and order receipt, packages are listed with their name and the included items. Order confirmation emails clearly distinguish package items from individually-ordered items.

On the admin side, package orders appear in the orders list with the package name visible on each grouped line item. Revenue accounting correctly attributes package revenue to the studio and handles package-level pricing for profit calculations.

The package flow works for both standard print orders and orders that include digital downloads within a package.`,
  },
  {
    title: 'Session Scheduling & Booking System',
    version: 'v2.4',
    date: '2026-06-15',
    summary: 'Studios can offer bookable photography sessions with availability management, customer booking, and payment collection.',
    content: `A full session scheduling system has been added to the platform. Studios can create session types (e.g. "Senior Portrait", "Team Headshots", "Family Session") with descriptions, durations, pricing, and location details. Availability slots are configured by day and time range.

Customers can book sessions directly from the studio's public page or a dedicated booking URL. They select a session type, choose an available time slot, enter their contact information, and pay the session fee through Stripe during booking. Booking confirmations are sent to both the customer and studio.

Studio admins manage bookings from the Scheduling page, which shows upcoming bookings, their payment status, and customer details. Bookings can be approved, cancelled, or marked as paid (for cash/check payments collected offline). Admins can also edit booking details and add internal notes.

The scheduling fees configuration (under Super Admin) allows setting platform fees per booking type. Customer-facing booking pages show the studio's branding and are accessible without requiring a customer login.`,
  },
  {
    title: 'Multi-Admin Team Management',
    version: 'v2.4',
    date: '2026-06-13',
    summary: 'Studio owners can now invite additional team members as co-admins with full access to the studio account.',
    content: `Studios can now have multiple administrators. From the Team page (/admin/team), the studio owner can invite additional team members by email address. Each invitation generates a unique secure link that allows the invitee to create their own account credentials and join the studio.

Invited admins have the same access level as the original studio admin — they can manage albums, orders, pricing, shipping, and all other studio settings. Team members are listed on the Team page with their name, email, and the date they joined.

Invite links expire after 7 days for security. If an invitation expires, a new one can be sent from the Team page. Studio owners can also remove team members at any time.

Email notifications are sent at each step: when an invitation is sent, when it's accepted, and when a team member is removed. This makes it easy to coordinate access for studios with multiple photographers or staff members who need to manage the account.`,
  },
  {
    title: 'Order Receipt Notifications Per Admin',
    version: 'v2.4',
    date: '2026-06-15',
    summary: 'Each admin can independently opt in to receive email notifications for new orders placed in the studio.',
    content: `Previously, order receipt emails went to a single studio email address. Now each admin on a studio account has their own notification preference — they can opt in or out of order notifications from their profile settings.

When a new order is placed, the system sends the receipt email to every admin who has opted in, regardless of how many admins the studio has. This means studios with multiple photographers or staff can each receive their own copy of order notifications without routing everything through one shared inbox.

The opt-in preference is per-user: going to /admin/profile and toggling "Receive order notifications" controls whether that admin receives emails for new orders. The studio's primary email (configured in profile settings) is also used as a fallback if no admins have opted in.

For digital-only orders, the system automatically marks the order as complete and triggers the download link in the receipt, so no manual processing is required.`,
  },
  {
    title: 'WHCC Price Audit Tool',
    version: 'v2.3',
    date: '2026-06-09',
    summary: 'Super admins can audit WHCC product prices against expected base costs to catch pricing discrepancies.',
    content: `A new WHCC Price Audit page is available to super admins at /admin/whcc-price-audit. This tool compares the current product base prices in the system against WHCC's actual catalog pricing, flagging any items where the stored base cost doesn't match what WHCC charges.

The audit runs a live comparison for all WHCC-mapped products. Each row shows the product name, the current base price stored in the system, the expected WHCC cost from the catalog, and the difference. Items with discrepancies are highlighted so they can be corrected.

The audit results are collapsible by product group for easier navigation, and results are persisted after running so you can review them without re-running the audit. WHCC lab tax is factored into the cost comparison — WHCC's tax on print orders reduces the studio payout and is accounted for separately in the profit calculations.

Pricing discrepancies caught by this tool prevent situations where a product is sold at a price that doesn't cover the actual WHCC cost, protecting studio margins.`,
  },
  {
    title: 'Photo Download Protection',
    version: 'v2.3',
    date: '2026-06-06',
    summary: 'Full-resolution photos are now protected by signed tokens and right-click saving is disabled across the platform.',
    content: `Two layers of photo protection have been added to prevent unauthorized downloading of full-resolution images.

Full-resolution photo access is now gated by signed, time-limited tokens. Direct URL access to high-resolution photos without a valid token is blocked — this prevents customers or visitors from sharing direct links to original files or accessing them without going through the normal order flow. Tokens are scoped to the specific photo and expire after a short window.

Additionally, right-click saving, iOS long-press saving, and drag-to-desktop have all been disabled on every image rendered through the WatermarkedImage component. This applies to thumbnails, photo grids, order previews, and all public-facing album views.

These protections apply to all photos across the platform. Photographers' work is protected from casual downloading whether customers are browsing albums, viewing order previews, or looking at saved favorites. Purchased digital downloads are still delivered normally through the secure download link in order receipts.`,
  },
  {
    title: 'Player & School Watchlists',
    version: 'v2.3',
    date: '2026-06-10',
    summary: 'Customers can watch for specific players or schools and be prompted to enable notifications when new photos are uploaded.',
    content: `Customers browsing albums can now follow specific players or schools to be notified when new photos are published. When a customer taps a player tag on a photo, they're prompted to add that player to their watchlist. Similarly, customers can follow a school from the album listing.

Watchlists are tied to the customer's session or account. When new photos are tagged with a watched player's name or from a watched school, the platform can trigger notifications to subscribed customers.

Studio admins can see watchlist activity on the dashboard — the Favorites panel now includes a "Tracked Players & Schools" section showing how many unique fans are watching specific players and schools, which players have the most watchers, and which sport categories are most followed.

This feature helps studios understand demand for specific content and can drive re-engagement when new albums are published for popular teams or players.`,
  },
  {
    title: 'Super Admin Pricing: Bulk Markup & Drag-to-Reorder',
    version: 'v2.2',
    date: '2026-06-05',
    summary: 'Apply bulk markup percentages across an entire price list at once, and drag product sizes between products.',
    content: `Two significant improvements to the Super Admin pricing management tool.

Bulk markup now calculates and stores the actual final price when applied, not just the markup percentage. This means the price list always reflects real dollar amounts after markup is applied, making it predictable and auditable. When you apply a 40% markup to a price list, each variant's price is updated to base_cost × 1.40 and stored directly. The UI refreshes from the server after each bulk apply to confirm what was saved.

Drag-and-drop reordering of product sizes is now supported. In the pricing editor, product size rows can be dragged to different products within the same price list. This is useful for reorganizing product structures — for example, moving a size that was added under the wrong product category to the correct one without having to delete and recreate it.

WHCC variant assignments have also been improved: the correct WHCC attributes are preserved when editing variants, and the studio visibility rules for WHCC products have been tightened so only appropriately configured products are shown to studio admins.`,
  },
  {
    title: 'Player Search Across Albums',
    version: 'v2.1',
    date: '2026-05-27',
    summary: 'Customers can now search by player name across all albums, with whole-name, case-insensitive matching.',
    content: `The album search functionality now supports searching for players by name across your entire album catalog. When a customer searches for a player's name, the results include photos tagged with that player from any album they have access to.

The search uses whole-name, case-insensitive matching — searching "Smith" returns photos tagged with "Smith", "John Smith", and "Smith Johnson". Partial single-name matches are avoided to reduce false positives. The search checkbox on the Albums page allows customers to filter their search specifically to player names.

Search results show which album each photo belongs to and link directly to that photo in its album context. This makes it easy for parents and fans to find all photos of a specific player across multiple events, teams, or sessions without browsing each album individually.

Player names are sourced from the photo tagging system — photos with manually entered or auto-suggested player tags are indexed for search.`,
  },
  {
    title: 'Album Social Sharing Previews',
    version: 'v2.1',
    date: '2026-05-20',
    summary: 'Albums now generate rich social media previews (Open Graph) when shared on Facebook, Twitter, or iMessage.',
    content: `When the URL for a PhotoLab album is shared on social media or messaging apps, it now displays a rich preview card with the album cover photo, album name, and studio name. This works on Facebook, Twitter/X, iMessage, Slack, Discord, and any platform that reads Open Graph meta tags.

The preview image is the album's cover photo. The preview title is the album name. The preview description shows the studio name and a brief description of the album.

This makes shared album links significantly more compelling — instead of a bare URL, contacts see a visual preview that immediately shows what the album is about, encouraging more click-throughs from shares. This is especially useful for the referral share link feature, where studio admins create trackable links to share on social media and with customers.`,
  },
  {
    title: 'Auto Photo Tagging & Face Recognition',
    version: 'v2.0',
    date: '2026-05-08',
    summary: 'Photos are automatically analyzed for faces and matched to player names to speed up bulk photo tagging.',
    content: `When photos are uploaded to an album, the platform now automatically analyzes them for faces using a client-side face detection model (BlazeFace). Detected faces are compared against previously tagged photos in the same album to suggest player name matches.

Suggested tags are surfaced in the admin photo management panel, where studio admins can review each suggestion and accept or reject it with a single click. Accepted suggestions are written to the photo's player name metadata and become searchable. Rejected suggestions are discarded.

Face detection runs in the browser (no photos are sent to an external AI service) using the BlazeFace model, which is optimized for detecting multiple faces at varying scales in sports action photos. The detection threshold is tuned to balance recall (finding all faces) with precision (avoiding false detections).

This feature significantly reduces the time required to tag large batches of sports photos. Instead of manually identifying and typing every player name, admins review machine-generated suggestions and confirm correct ones — turning a typing task into a review task.`,
  },
  {
    title: 'Digital Album Downloads',
    version: 'v2.0',
    date: '2026-05-01',
    summary: 'Customers can purchase and download a complete digital album — all photos in full resolution as a zip file.',
    content: `Albums can now be configured to offer a full digital album download as a purchasable product. When the "Buy Album" option is enabled on an album, customers see a "Download All Photos" option at the top of the album. Clicking it adds the full album download to their cart at the configured album price.

After purchase, the customer receives a download link in their order confirmation email. The link delivers all full-resolution photos in the album as a zip file. Download links are time-limited and tied to the specific order, so they can't be shared to provide unlimited free access.

Studio admins can enable or disable the album purchase option per album from the album settings. The album price is set separately from individual photo prices.

For studios that primarily sell digital files rather than prints, this feature allows customers to purchase an entire album at once rather than ordering photos individually — a common expectation for event photographers and school photography studios.`,
  },
  {
    title: 'School Tags & Public Album Search',
    version: 'v2.0',
    date: '2026-05-01',
    summary: 'Albums can be tagged with schools, and customers can search for albums by school name on the public album browser.',
    content: `Albums now support school tags — structured metadata linking an album to one or more schools. School tags include a school ID, school name, and optional sport category. Multiple schools can be tagged per album for multi-school events.

On the public albums page, customers can search and filter albums by school name. This is especially useful for high school and college sports photography where parents and fans know their school's name but not the event name. School tags also power the school watchlist feature, which lets fans follow a school to be notified when new albums are published for that school.

Studio admins add school tags from the album settings panel using a structured tag editor. Tags are stored as structured JSON so they can be used for both display and filtering without ambiguous string matching.

Search by school name on the public albums page is case-insensitive and matches partial school names, so searching "Lincoln" returns both "Abraham Lincoln High School" and "Lincoln Middle School" if both are tagged on albums.`,
  },
  {
    title: 'Studio Social Links & Branding',
    version: 'v2.0',
    date: '2026-04-30',
    summary: 'Studios can add Instagram and Facebook links to their profile, which appear in the navbar and on the studio public page.',
    content: `Studio admins can now add Instagram and Facebook profile URLs to their Studio Profile settings. Once configured, social media icons appear in the site navbar next to the studio name, and on the studio's public landing page.

This gives studios a direct presence alongside their photography work — customers browsing albums can immediately find and follow the studio's social media accounts. The icons link directly to the studio's profiles in a new tab.

Studio logo persistence has also been improved — uploaded logos are now reliably saved and displayed consistently across all admin and public-facing pages. The studio's branding (logo, name, colors) is shown correctly throughout the platform including on booking pages, order receipts, and the studio public page.`,
  },
];

// ─── Insert ───────────────────────────────────────────────────────────────────

async function ensureTable() {
  const exists = await queryRow(
    `SELECT CASE WHEN OBJECT_ID('release_notes','U') IS NOT NULL THEN 1 ELSE 0 END AS v`
  );
  if (!Number(exists?.v)) {
    await query(`
      CREATE TABLE release_notes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        version NVARCHAR(50) NULL,
        summary NVARCHAR(500) NULL,
        content NVARCHAR(MAX) NOT NULL,
        published BIT NOT NULL DEFAULT 0,
        published_at DATETIME2 NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created release_notes table.');
  }
}

async function seed() {
  await ensureTable();

  const existing = await queryRows(`SELECT title FROM release_notes`);
  const existingTitles = new Set(existing.map(r => r.title));

  let inserted = 0;
  let skipped = 0;

  for (const note of notes) {
    if (existingTitles.has(note.title)) {
      console.log(`  skip  "${note.title}"`);
      skipped++;
      continue;
    }
    const publishedAt = note.date;
    await query(`
      INSERT INTO release_notes (title, version, summary, content, published, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 1, $5, $5, $5)
    `, [note.title, note.version, note.summary, note.content, publishedAt]);
    console.log(`  insert "${note.title}"`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
