import { listarSolicitacoes } from '@/server/cancelamentos';
import { rota } from '@/server/http';

export const GET = rota(['autorizar'], async ({ db, req }) => {
  const s = req.nextUrl.searchParams.get('status');
  return { solicitacoes: await listarSolicitacoes(db, s && ['pendente', 'aprovada', 'recusada'].includes(s) ? s : undefined) };
});
