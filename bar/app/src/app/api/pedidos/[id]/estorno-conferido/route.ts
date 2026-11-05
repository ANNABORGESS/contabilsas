import { conferirEstorno } from '@/server/caixa';
import { param, rota } from '@/server/http';

/** "Estorno feito na maquininha": quem devolveu confirma, com nome e hora. */
export const POST = rota(['autorizar', 'fechamento'], async ({ db, u, req }) => conferirEstorno(db, u, param(req, 1)));
