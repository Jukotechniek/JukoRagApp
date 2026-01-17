'use client';

/**
 * Error Boundary voor Next.js App Router
 * 
 * Dit bestand vangt errors op in specifieke route segments.
 * Het is een "lokaal" error boundary dat errors vangt binnen
 * een route segment, maar NIET in de root layout.
 * 
 * Verschil met global-error.tsx:
 * - error.tsx: vangt errors in route segments (pages, components)
 * - global-error.tsx: vangt errors in root layout (laatste verdedigingslinie)
 * 
 * Wat vangt het op:
 * - Errors in page components
 * - Errors in route segment components
 * - Errors die niet door component-level error boundaries worden opgevangen
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
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
        error_boundary: 'segment_error',
        error_type: 'react_component_error',
      },
      contexts: {
        error: {
          message: error.message,
          stack: error.stack,
          digest: error.digest,
        },
      },
      level: 'error',
    });

    // Log ook naar console voor development
    console.error('Segment error caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Er is een fout opgetreden</CardTitle>
          </div>
          <CardDescription>
            Er is een fout opgetreden bij het laden van deze pagina. 
            De fout is automatisch gerapporteerd.
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
        </CardContent>
      </Card>
    </div>
  );
}
