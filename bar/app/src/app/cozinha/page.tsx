import { redirect } from 'next/navigation';
import PainelPreparo from '@/cliente/PainelPreparo';
import { pode } from '@/domain/papeis';
import { usuarioAtual } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cozinha · Vikings' };

/** Não usa senha: sem ninguém da cozinha (ou administrador) entrado, entra direto. */
export default async function Cozinha() {
  const u = await usuarioAtual();
  if (!u || !pode(u.papel, 'cozinha')) redirect('/entrar/cozinha');
  return <PainelPreparo setor="cozinha" usuario={{ nome: u.nome, papel: u.papel }} />;
}
