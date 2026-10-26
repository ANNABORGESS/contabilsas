// Proteção das telas: sem login, ou com usuário de outro perfil, abre a entrada do perfil certo.
import 'server-only';
import { redirect } from 'next/navigation';
import { pode, type Papel } from '@/domain/papeis';
import { usuarioAtual, type Usuario } from './auth';

export async function paginaPara(...papeis: Papel[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect(papeis.length ? `/login/${papeis[0]}` : '/login');
  // aparelho com outra pessoa logada: abre a entrada do perfil certo para trocar de usuário
  if (papeis.length && !pode(u.papel, ...papeis)) redirect(`/login/${papeis[0]}`);
  return u;
}
