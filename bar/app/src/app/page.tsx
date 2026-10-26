import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { INICIO } from '@/domain/papeis';
import { semUsuarios, usuarioAtual } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  if (await semUsuarios(await getDb())) redirect('/primeiro-acesso');
  const u = await usuarioAtual();
  redirect(u ? INICIO[u.papel] : '/login');
}
