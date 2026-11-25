import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';
import { listarCombos, listarPromocoes, salvarPromocao } from '@/server/promocoes';

export const GET = rota(['cardapio', 'relatorios'], async ({ db, req }) => {
  const q = req.nextUrl.searchParams;
  const de = dataValida(q.get('de')) ? q.get('de')! : hoje();
  const ate = dataValida(q.get('ate')) ? q.get('ate')! : de;
  return { ...(await listarPromocoes(db, de, ate)), combos: await listarCombos(db) };
});

export const POST = rota(['cardapio'], async ({ db, u, corpo }) => salvarPromocao(db, u, null, corpo));
