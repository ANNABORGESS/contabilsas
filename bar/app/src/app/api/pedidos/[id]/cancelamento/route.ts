import { encerrar, solicitar } from '@/server/cancelamentos';
import { param, rota } from '@/server/http';

/** Administrador cancela/estorna na hora; garçom registra a solicitação para o administrador decidir. */
export const POST = rota(['garcom'], async ({ db, u, req, corpo }) => {
  const id = param(req, 1);
  if (u.papel === 'admin') return { feito: true, ...(await encerrar(db, u, id, corpo.motivo)) };
  await solicitar(db, u, id, corpo.motivo);
  return { feito: false, solicitado: true };
});
