import { param, rota } from '@/server/http';
import { finalizarPedido } from '@/server/preparo';

/** Administrador dá o pedido como entregue (cozinha e bar de uma vez). */
export const POST = rota(['admin'], async ({ db, u, req }) => finalizarPedido(db, u, param(req, 1)));
