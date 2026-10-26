import { paginaPara } from '@/server/pagina';
import AppGarcom from './AppGarcom';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Garçom · Bar' };

export default async function Garcom() {
  const u = await paginaPara('garcom');
  return <AppGarcom usuario={{ id: u.id, nome: u.nome, papel: u.papel }} />;
}
