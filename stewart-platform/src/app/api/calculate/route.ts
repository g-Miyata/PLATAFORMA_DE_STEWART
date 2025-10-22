import { StewartPlatform } from '@/lib/stewart/knematics';
import { NextRequest, NextResponse } from 'next/server';

const platform = new StewartPlatform();

export async function POST(request: NextRequest) {
  try {
    const pose = await request.json();
    const { L, P, valid, percentages } = platform.inverseKinematics(pose);

    const actuators = L.map((length, i) => ({
      id: i + 1,
      length,
      percentage: percentages[i],
      valid: length >= platform.strokeMin && length <= platform.strokeMax,
    }));

    return NextResponse.json({
      pose,
      actuators,
      valid,
      base_points: platform.B,
      platform_points: P,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
