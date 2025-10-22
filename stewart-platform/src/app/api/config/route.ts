import { StewartPlatform } from '@/lib/stewart/knematics';
import { NextRequest, NextResponse } from 'next/server';

let platform = new StewartPlatform();

export async function GET() {
  return NextResponse.json({
    h0: platform.h0,
    strokeMin: platform.strokeMin,
    strokeMax: platform.strokeMax,
  });
}

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();
    platform = new StewartPlatform(config.h0, config.strokeMin, config.strokeMax);
    return NextResponse.json({ message: 'Configuration updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid configuration' }, { status: 400 });
  }
}
