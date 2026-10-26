import { NextResponse, type NextRequest } from 'next/server';
import { INICIO, ehPapel } from '@/domain/papeis';
import { entrar } from '@/server/auth';
import { erro } from '@/server/http';

export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return erro('Envio inválido.', 415);
  const { usuario, senha, perfil } = (await req.json().catch(() => ({}))) as { usuario?: string; senha?: string; perfil?: string };
  if (!usuario || !senha) return erro('Informe usuário e senha.');
  const escolhido = ehPapel(perfil) ? perfil : undefined;
  const r = await entrar(String(usuario), String(senha), escolhido);
  if ('erro' in r) return erro(r.erro, 400); // não é 401: na tela de entrada mostra a mensagem em vez de redirecionar
  return NextResponse.json({ usuario: r, destino: INICIO[escolhido ?? r.papel] });
}
