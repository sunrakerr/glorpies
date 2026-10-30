/** Where the site is served: NEXT_PUBLIC_SITE_URL, else the Vercel production domain. */
const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (vercel ? `https://${vercel}` : 'http://localhost:3000');
