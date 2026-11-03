import { NextRequest, NextResponse } from 'next/server';
import { customerTrackingSnapshot } from '@/lib/logistics/customer-tracking';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (token.length < 8 || token.length > 200) return NextResponse.json({ success: false, stage: 'unavailable', message: 'Link de acompanhamento inválido.' }, { status: 400, headers });
    return NextResponse.json(await customerTrackingSnapshot(token), { headers });
  } catch {
    return NextResponse.json({ success: false, stage: 'unavailable', message: 'Aguardando conexão para atualizar o acompanhamento.', driverLocation: null, destination: null, route: null }, { status: 503, headers });
  }
}
