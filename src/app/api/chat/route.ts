import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as Sentry from '@sentry/nextjs';

// Determine Python API URL based on environment
// In Docker: use service name 'python-api'
// In local dev: use 'localhost'
const getPythonApiUrl = () => {
  // If explicitly set in environment, use that (highest priority)
  if (process.env.PYTHON_API_URL) {
    return process.env.PYTHON_API_URL;
  }
  
  // Check if we're running in Docker container
  // Docker containers have /.dockerenv file (this works server-side in Node.js)
  let isDocker = false;
  try {
    isDocker = fs.existsSync('/.dockerenv');
  } catch {
    // If fs check fails, assume local development
    isDocker = false;
  }
  
  // Also check for DOCKER_ENV environment variable (can be set in docker-compose)
  if (process.env.DOCKER_ENV === 'true') {
    isDocker = true;
  }
  
  // In Docker, use service name; in local dev, use localhost
  return isDocker ? 'http://python-api:8000' : 'http://localhost:8000';
};

const PYTHON_API_URL = getPythonApiUrl();

export async function POST(req: NextRequest) {
  // Ensure server-side Sentry config is loaded
  if (typeof window === 'undefined') {
    try {
      await import('../../../../sentry.server.config');
    } catch (e) {
      // Ignore if already loaded
    }
  }
  
  // Parse URL outside try block so it's available in catch
  const url = new URL(req.url);
  const stream = url.searchParams.get('stream') === 'true';
  
  try {
    // Check if streaming is requested
    
    // Get the request body
    const body = await req.json();
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (stream) {
      // Forward streaming request to Python API
      const response = await fetch(`${PYTHON_API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { 'Authorization': authHeader }),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Capture error in Sentry
        const apiError = new Error(errorData.detail || errorData.error || 'Python API error');
        Sentry.captureException(apiError, {
          tags: {
            endpoint: '/api/chat',
            api_type: 'python_proxy',
            stream: 'true',
          },
          contexts: {
            request: {
              python_api_url: PYTHON_API_URL,
              method: 'POST',
              status_code: response.status,
            },
            response: errorData,
          },
          level: 'error',
        });
        
        return NextResponse.json(
          { 
            success: false, 
            error: errorData.detail || errorData.error || 'Python API error',
            details: errorData 
          },
          { status: response.status }
        );
      }

      // Return streaming response
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Forward regular request to Python API
      const response = await fetch(`${PYTHON_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { 'Authorization': authHeader }),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        // Capture error in Sentry
        const apiError = new Error(data.detail || data.error || 'Python API error');
        Sentry.captureException(apiError, {
          tags: {
            endpoint: '/api/chat',
            api_type: 'python_proxy',
            stream: 'false',
          },
          contexts: {
            request: {
              python_api_url: PYTHON_API_URL,
              method: 'POST',
              status_code: response.status,
            },
            response: data,
          },
          level: 'error',
        });
        
        return NextResponse.json(
          { 
            success: false, 
            error: data.detail || data.error || 'Python API error',
            details: data 
          },
          { status: response.status }
        );
      }

      return NextResponse.json(data);
    }
  } catch (error: any) {
    console.error('Error proxying to Python API:', error);
    
    // Always try to capture error in Sentry, even if initialization check fails
    try {
      // Create a proper Error object if it's not already one
      const errorToCapture = error instanceof Error 
        ? error 
        : new Error(error?.message || 'Failed to connect to Python API');
      
      // Add additional context to the error
      (errorToCapture as any).pythonApiUrl = PYTHON_API_URL;
      (errorToCapture as any).isStream = stream;
      
      // Capture error in Sentry with detailed context
      Sentry.captureException(errorToCapture, {
        tags: {
          endpoint: '/api/chat',
          api_type: 'python_proxy',
          error_type: error?.name || 'NetworkError',
          stream: stream ? 'true' : 'false',
        },
        contexts: {
          request: {
            python_api_url: PYTHON_API_URL,
            method: 'POST',
            stream: stream,
            url: url.toString(),
          },
          error: {
            code: (error as any)?.code || 'UNKNOWN',
            message: error?.message || 'Unknown error',
            stack: error?.stack,
            name: error?.name || 'Error',
          },
          network: {
            error_code: (error as any)?.code,
            errno: (error as any)?.errno,
            syscall: (error as any)?.syscall,
          },
        },
        level: 'error',
        extra: {
          error_details: {
            type: typeof error,
            constructor: error?.constructor?.name,
            keys: error ? Object.keys(error) : [],
          },
        },
      });
      
      console.log('[Sentry] Error captured and sent to Sentry:', {
        message: errorToCapture.message,
        pythonApiUrl: PYTHON_API_URL,
      });
    } catch (sentryError) {
      // Even if Sentry capture fails, log it
      console.error('[Sentry] Failed to capture exception:', sentryError);
      console.error('[Sentry] Original error:', error);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to Python API',
        details: error?.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}














