import { atualizarFuncionario, recusarConta } from '@/server/cadastros';
import { param, rota } from '@/server/http';

export const PATCH = rota(['admin'], async ({ db, u, req, corpo }) => atualizarFuncionario(db, u, param(req), corpo));
/** Recusa (apaga) uma conta que ainda aguarda aprovação. */
export const DELETE = rota(['admin'], async ({ db, u, req }) => recusarConta(db, u, param(req)));
