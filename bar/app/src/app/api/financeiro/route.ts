import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { custosELucro } from '@/server/financeiro';
import { rota } from '@/server/http';

export const GET = rota(['admin'], async ({ db, req }) => {
  const q = req.nextUrl.searchParams;
  const h = hoje();
  const de = dataValida(q.get('de')) ? q.get('de')! : `${h.slice(0, 8)}01`;
  const ate = dataValida(q.get('ate')) && q.get('ate')! >= de ? q.get('ate')! : h;
  return custosELucro(db, de, ate);
});
