# Custom Domains for Studio Links

Saved for later implementation.

## Goal
Allow each studio to connect a custom domain or subdomain (for example `photos.studio.com`) that resolves directly to that studio's public page instead of using the current slug-based path like `/s/{slug}`.

## Current State
- Studios currently use public slug links managed through `public_slug` on `studios`.
- Public studio pages are served through slug routes such as `/s/:slug`.
- The app does not yet map incoming request hostnames to studios.

## Suggested Implementation
1. Add a `studio_domains` table:
   - `id`
   - `studio_id`
   - `domain`
   - `is_primary`
   - `is_verified`
   - `verification_token`
   - `verified_at`
   - `created_at`
2. Add studio admin UI to:
   - enter a custom domain
   - view DNS verification instructions
   - mark one domain as primary
3. Add backend domain resolution middleware:
   - inspect `req.get('host')`
   - map host to a studio via `studio_domains`
   - serve that studio's public page at `/`
4. Support album routes under custom domains:
   - `/albums/:id`
   - optional photo deep links
5. Add domain verification flow:
   - TXT record or CNAME verification
6. Configure infrastructure for production:
   - Azure custom domains
   - SSL certificate management
   - host binding / reverse proxy support

## Fast Alternative
If true custom-domain support is not needed yet, studios can use their registrar/domain provider to redirect a custom domain to the existing public studio link.

## Notes
- True custom domains are best handled with both app-level hostname mapping and Azure/App Service or Front Door custom-domain configuration.
- Keep slug links working as a fallback even after custom domains are added.
