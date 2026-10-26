import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';
import { relatorio } from '@/server/relatorios';

export const GET = rota(['admin'], async ({ db, req }) => {
  const q = req.nextUrl.searchParams;
  const de = dataValida(q.get('de')) ? q.get('de')! : hoje();
  const ate = dataValida(q.get('ate')) && q.get('ate')! >= de ? q.get('ate')! : de;
  return relatorio(db, de, ate);
});
