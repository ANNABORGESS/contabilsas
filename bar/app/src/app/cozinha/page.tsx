import PainelPreparo from '@/cliente/PainelPreparo';
import { paginaPara } from '@/server/pagina';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cozinha · Bar' };

export default async function Cozinha() {
  const u = await paginaPara('cozinha');
  return <PainelPreparo setor="cozinha" usuario={{ nome: u.nome, papel: u.papel }} />;
}
