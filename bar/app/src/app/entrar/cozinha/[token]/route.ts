// Link secreto da cozinha: entra sem usuário e senha e vai direto para o painel.
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db';
import { entrarPeloLinkDaCozinha } from '@/server/acessoTela';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await entrarPeloLinkDaCozinha(await getDb(), token);
  return NextResponse.redirect(new URL(ok ? '/cozinha' : '/login/cozinha?link=invalido', req.url));
}
