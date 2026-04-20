import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: 'Kiosk API is online. Use POST /api/kiosk/register to pair a device.',
  });
}
