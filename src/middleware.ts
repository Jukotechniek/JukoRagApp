import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  
  // Skip middleware for API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next();
  }
  
  // Skip redirects in development (localhost)
  const isDevelopment = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  if (isDevelopment) {
    return NextResponse.next();
  }
  
  // Check if we're on the app subdomain
  const isAppSubdomain = hostname.startsWith('app.');
  
  // Check if we're on the main domain
  const isMainDomain = !isAppSubdomain;
  
  // App routes that should only be accessible on app subdomain
  const appRoutes = ['/dashboard', '/auth'];
  const isAppRoute = appRoutes.some(route => pathname.startsWith(route));
  
  // If on main domain and trying to access app routes, redirect to app subdomain
  if (isMainDomain && isAppRoute) {
    const url = request.nextUrl.clone();
    const mainDomain = hostname.replace('www.', '');
    url.protocol = request.nextUrl.protocol;
    url.host = `app.${mainDomain}`;
    return NextResponse.redirect(url);
  }
  
  // If on app subdomain and trying to access landing page, redirect to main domain
  if (isAppSubdomain && pathname === '/') {
    const url = request.nextUrl.clone();
    const mainDomain = hostname.replace('app.', '').replace('www.', '');
    url.protocol = request.nextUrl.protocol;
    url.host = mainDomain;
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

