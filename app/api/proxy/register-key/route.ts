import { NextRequest, NextResponse } from 'next/server';
import https from 'node:https';
import { Agent } from 'node:https';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Use node-fetch implementation
    const response = await fetch('https://13.60.210.111/api/register-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // This is the correct way to specify the agent in Next.js API routes
      //@ts-ignore - Need to ignore TypeScript error for this property
      agent: new https.Agent({ 
        rejectUnauthorized: false // Ignore SSL certificate validation
      })
    });
    
    // Parse the response data
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to connect to proxy server', 
        details: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
}