'use client';

/**
 * Global Error Handler voor Next.js App Router
 * 
 * Dit bestand vangt alle React rendering errors op die niet door andere
 * error boundaries worden opgevangen. Het is de laatste verdedigingslinie
 * voor errors in je applicatie.
 * 
 * Wat vangt het op:
 * - React rendering errors (errors tijdens het renderen van componenten)
 * - Errors in root layout, template, of server components
 * - Unhandled errors die door andere error boundaries heen glippen
 * - Errors in de Providers component of andere root-level componenten
 * 
 * Belangrijk:
 * - Dit MOET een client component zijn ('use client')
 * - Het MOET <html> en <body> zelf renderen (overschrijft root layout)
 * - Alle errors worden automatisch naar Sentry gestuurd
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Stuur error naar Sentry met context
    Sentry.captureException(error, {
      tags: {
        error_boundary: 'global_error',
        error_type: 'react_rendering_error',
      },
      contexts: {
        error: {
          message: error.message,
          stack: error.stack,
          digest: error.digest,
        },
      },
      level: 'fatal', // Global errors zijn meestal kritiek
    });

    // Log ook naar console voor development
    console.error('Global error caught:', error);
  }, [error]);

  return (
    <html lang="nl">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-muted p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Er is een fout opgetreden</CardTitle>
              </div>
              <CardDescription>
                Er is een onverwachte fout opgetreden in de applicatie. 
                De fout is automatisch gerapporteerd aan ons team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-semibold">Development Error Details:</p>
                  <p className="mt-1 text-muted-foreground">{error.message}</p>
                  {error.digest && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Error ID: {error.digest}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={reset}
                  className="w-full"
                  variant="default"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Probeer opnieuw
                </Button>
                
                <Button
                  asChild
                  variant="outline"
                  className="w-full"
                >
                  <Link href="/">
                    <Home className="mr-2 h-4 w-4" />
                    Terug naar home
                  </Link>
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Als dit probleem aanhoudt, neem dan contact op met support.
              </p>
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  );
}
