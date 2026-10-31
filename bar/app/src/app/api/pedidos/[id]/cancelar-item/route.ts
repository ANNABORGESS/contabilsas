import { cancelarItem } from '@/server/cancelamentos';
import { param, rota } from '@/server/http';

/** Cancela parte do pedido (item e quantidade). Só o administrador. */
export const POST = rota(['admin'], async ({ db, u, req, corpo }) => cancelarItem(db, u, param(req, 1), corpo.itemId, corpo.quantidade, corpo.motivo));
