import { dataValida } from '@/domain/turno';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';
import { confirmarPagamento, listarPedidos } from '@/server/pedidos';

/** Histórico. O garçom vê o turno atual; o administrador escolhe o período. */
export const GET = rota(['garcom'], async ({ db, u, req }) => {
  const q = req.nextUrl.searchParams;
  const admin = u.papel === 'admin';
  const de = admin && dataValida(q.get('de')) ? q.get('de')! : hoje();
  const ate = admin && dataValida(q.get('ate')) ? q.get('ate')! : de;
  const uuid = (s: string | null) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);
  const status = q.get('status');
  const pedidos = await listarPedidos(db, {
    de,
    ate,
    mesaId: uuid(q.get('mesa')),
    garcomId: q.get('meus') === '1' ? u.id : admin ? uuid(q.get('garcom')) : undefined,
    status: status && ['pago', 'cancelado', 'estornado'].includes(status) ? status : undefined,
  });
  return { de, ate, pedidos };
});

/** "Pagamento confirmado": registra o pedido e envia para cozinha e bar. */
export const POST = rota(['garcom'], async ({ db, u, corpo }) => {
  const r = await confirmarPagamento(db, u, corpo as never);
  return r;
});
