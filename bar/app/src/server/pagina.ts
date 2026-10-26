// Proteção das telas: sem login vai para /login; papel errado vai para a própria tela.
import 'server-only';
import { redirect } from 'next/navigation';
import { INICIO, pode, type Papel } from '@/domain/papeis';
import { usuarioAtual, type Usuario } from './auth';

export async function paginaPara(...papeis: Papel[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  if (papeis.length && !pode(u.papel, ...papeis)) redirect(INICIO[u.papel]);
  return u;
}
