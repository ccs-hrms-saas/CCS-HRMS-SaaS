import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Platform-level hostnames that bypass tenant lookup entirely.
// These serve the Developer Control Center and platform marketing pages.
const PLATFORM_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'ccs-hrms-saas.vercel.app',
  'ccshrms.com',
  'www.ccshrms.com',
  'app.ccshrms.com',
]);

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico
     * - /api/*        (API routes — handled directly, no tenant check needed at edge)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};

export async function middleware(request: NextRequest) {
  const url   = request.nextUrl.clone();
  const host  = request.headers.get('host') ?? '';
  // Strip port for comparison (e.g. "localhost:3001" → "localhost")
  const hostname = host.split(':')[0];

  const response = NextResponse.next();

  // Always forward the raw host so AppSettingsContext / Layout can use it
  response.headers.set('x-tenant-host', host);

  // ── Platform hosts: pass straight through ─────────────────────────────────
  if (PLATFORM_HOSTS.has(hostname)) {
    return response;
  }

  // ── Tenant hosts: verify the company exists and is active ─────────────────
  const subdomain = hostname.split('.')[0];

  // We query Supabase REST directly (no SDK at edge) to keep the middleware
  // lightweight. The anon key is safe here — RLS on `companies` is still enforced.
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/companies?or=(subdomain.eq.${encodeURIComponent(subdomain)},domain.eq.${encodeURIComponent(hostname)})&select=id,is_active&limit=1`,
      {
        headers: {
          apikey:        supabaseAnon,
          Authorization: `Bearer ${supabaseAnon}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const companies: { id: string; is_active: boolean }[] = await res.json();

    // ── Unknown domain → 404 page ──────────────────────────────────────────
    if (!companies || companies.length === 0) {
      url.pathname = '/not-found';
      return NextResponse.rewrite(url);
    }

    // ── Suspended tenant → 503 page ────────────────────────────────────────
    if (companies[0].is_active === false) {
      url.pathname = '/suspended';
      return NextResponse.rewrite(url);
    }

    // ── Active tenant → forward with company id header ─────────────────────
    response.headers.set('x-company-id', companies[0].id);
    return response;

  } catch {
    // If the DB lookup fails (e.g. cold start), let the request through.
    // AppSettingsContext will handle the error gracefully on the client.
    return response;
  }
}
