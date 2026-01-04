import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

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














