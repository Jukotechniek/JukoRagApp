import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';

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
  try {
    // Check if streaming is requested
    const url = new URL(req.url);
    const stream = url.searchParams.get('stream') === 'true';
    
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
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to Python API',
        details: error.message,
      },
      { status: 500 }
    );
  }
}














