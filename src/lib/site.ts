/**
 * Where the site, and with it the image API at /api/face, is served. Set
 * NEXT_PUBLIC_SITE_URL for a custom domain; on Vercel the production domain
 * is used otherwise.
 */
const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (vercel ? `https://${vercel}` : 'http://localhost:3000');
