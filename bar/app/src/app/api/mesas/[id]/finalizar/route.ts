import { hoje } from '@/server/config';
import { param, rota } from '@/server/http';
import { finalizarMesa } from '@/server/preparo';

/** Administrador finaliza todos os pedidos abertos da mesa no turno. */
export const POST = rota(['admin'], async ({ db, u, req }) => finalizarMesa(db, u, param(req, 1), hoje()));
