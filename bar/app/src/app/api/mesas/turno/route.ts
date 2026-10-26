import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';
import { mesasDoTurno } from '@/server/relatorios';

export const GET = rota(['garcom'], async ({ db, req }) => {
  const d = req.nextUrl.searchParams.get('data');
  const data = dataValida(d) ? d : hoje();
  return { data, mesas: await mesasDoTurno(db, data) };
});
