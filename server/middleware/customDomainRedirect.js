import mssql from '../mssql.cjs';
const { queryRow } = mssql;

/**
 * Custom domain redirect middleware
 * Checks if the request host matches a studio's custom domain,
 * and if so, redirects to the albums page with the studioSlug parameter
 */
export const customDomainRedirect = async (req, res, next) => {
  try {
    // Skip if this is an API request or static asset
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.includes('.')) {
      return next();
    }

    const hostHeader = req.get('host');
    if (!hostHeader) {
      return next();
    }

    // Remove port from host if present
    const host = hostHeader.split(':')[0];

    // Query for a studio with this custom domain
    const studio = await queryRow(
      `SELECT id, public_slug as publicSlug, custom_domain as customDomain 
       FROM (
         SELECT s.id, s.public_slug, pc.custom_domain 
         FROM studios s
         LEFT JOIN profile_config pc ON pc.studio_id = s.id
       ) as studio_config
       WHERE custom_domain = $1 AND custom_domain IS NOT NULL`,
      [host]
    );

    if (studio && studio.publicSlug) {
      // Found a matching custom domain, redirect to landing page
      const targetUrl = `/studio/${encodeURIComponent(studio.publicSlug)}/landing`;
      return res.redirect(307, targetUrl);
    }

    // No matching custom domain, continue to next middleware
    next();
  } catch (error) {
    console.error('Custom domain redirect error:', error);
    // On error, continue to next middleware instead of failing
    next();
  }
};

export default customDomainRedirect;
