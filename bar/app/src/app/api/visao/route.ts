import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';
import { visaoGeral } from '@/server/relatorios';

export const GET = rota(['admin'], async ({ db, req }) => {
  const d = req.nextUrl.searchParams.get('data');
  return visaoGeral(db, dataValida(d) ? d : hoje());
});
