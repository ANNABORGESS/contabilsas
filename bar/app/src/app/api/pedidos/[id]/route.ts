import { ErroRegra } from '@/server/erros';
import { param, rota } from '@/server/http';
import { detalhePedido } from '@/server/pedidos';

export const GET = rota(['garcom'], async ({ db, req }) => {
  const p = await detalhePedido(db, param(req));
  if (!p) throw new ErroRegra('Pedido não encontrado.', 404);
  return { pedido: p };
});
