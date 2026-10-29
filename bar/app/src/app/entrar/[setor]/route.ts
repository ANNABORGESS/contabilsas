// Abre a tela da cozinha ou do bar sem usuário e senha e volta para o painel de pedidos.
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db';
import { ehSetor } from '@/domain/pedido';
import { entrarNaTela } from '@/server/acessoTela';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ setor: string }> }) {
  const { setor } = await params;
  if (!ehSetor(setor)) return NextResponse.redirect(new URL('/login', req.url));
  await entrarNaTela(await getDb(), setor);
  return NextResponse.redirect(new URL(`/${setor}`, req.url));
}
