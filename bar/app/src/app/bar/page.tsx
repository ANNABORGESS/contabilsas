import { redirect } from 'next/navigation';
import PainelPreparo from '@/cliente/PainelPreparo';
import { pode } from '@/domain/papeis';
import { usuarioAtual } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bar · Vikings' };

/** Não usa senha: sem ninguém do bar (ou administrador) entrado, entra direto. */
export default async function Bar() {
  const u = await usuarioAtual();
  if (!u || !pode(u.papel, 'bar')) redirect('/entrar/bar');
  return <PainelPreparo setor="bar" usuario={{ nome: u.nome, papel: u.papel }} />;
}
