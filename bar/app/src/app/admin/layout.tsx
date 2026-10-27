import { paginaPara } from '@/server/pagina';
import Lateral from './Lateral';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administração · Vikings' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await paginaPara('admin');
  return <Lateral nome={u.nome}>{children}</Lateral>;
}
