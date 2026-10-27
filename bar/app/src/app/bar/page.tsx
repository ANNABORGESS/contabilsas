import PainelPreparo from '@/cliente/PainelPreparo';
import { paginaPara } from '@/server/pagina';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bar · Vikings' };

export default async function Bar() {
  const u = await paginaPara('bar');
  return <PainelPreparo setor="bar" usuario={{ nome: u.nome, papel: u.papel }} />;
}
