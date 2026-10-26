import { NextResponse } from 'next/server';
import { sair } from '@/server/auth';

export async function POST() {
  await sair();
  return NextResponse.json({ ok: true });
}
