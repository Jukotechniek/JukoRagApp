// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    // Disabled in development to reduce console noise - set SENTRY_DEBUG=true to enable
    debug: process.env.SENTRY_DEBUG === 'true',

    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",

    // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: process.env.NODE_ENV === 'development',
  });
  
  // Only log initialization if explicitly requested
  if (process.env.SENTRY_DEBUG === 'true') {
    console.log('[Sentry] Server-side Sentry initialized successfully');
    console.log(`[Sentry] Environment: ${process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'}`);
  }
} else {
  console.warn('[Sentry] NEXT_PUBLIC_SENTRY_DSN not configured, Sentry tracking disabled for server-side');
}
