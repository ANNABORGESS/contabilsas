import { NextResponse, type NextRequest } from 'next/server';
import { INICIO } from '@/domain/papeis';
import { entrar } from '@/server/auth';
import { erro } from '@/server/http';

export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return erro('Envio inválido.', 415);
  const { usuario, senha } = (await req.json().catch(() => ({}))) as { usuario?: string; senha?: string };
  if (!usuario || !senha) return erro('Informe usuário e senha.');
  const u = await entrar(String(usuario), String(senha));
  if (!u) return erro('Usuário ou senha incorretos.', 401);
  return NextResponse.json({ usuario: u, destino: INICIO[u.papel] });
}
