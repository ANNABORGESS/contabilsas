import { schema } from '@/db';
import { eq } from 'drizzle-orm';
import { encerrar, recusar } from '@/server/cancelamentos';
import { ErroRegra } from '@/server/erros';
import { param, rota } from '@/server/http';

export const POST = rota(['admin'], async ({ db, u, req, corpo }) => {
  const id = param(req);
  if (corpo.decisao === 'recusar') return recusar(db, u, id);
  if (corpo.decisao !== 'aprovar') throw new ErroRegra('Decisão inválida.');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroRegra('Solicitação não encontrada.', 404);
  const [s] = await db.select().from(schema.solicitacoes).where(eq(schema.solicitacoes.id, id));
  if (!s || s.status !== 'pendente') throw new ErroRegra('Esta solicitação já foi decidida.', 409);
  return encerrar(db, u, s.pedidoId, typeof corpo.motivo === 'string' && corpo.motivo.trim() ? corpo.motivo : s.motivo, s.id);
});
