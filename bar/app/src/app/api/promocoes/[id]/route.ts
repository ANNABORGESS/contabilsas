import { param, rota } from '@/server/http';
import { excluirPromocao, salvarPromocao } from '@/server/promocoes';

export const PATCH = rota(['cardapio'], async ({ db, u, req, corpo }) => salvarPromocao(db, u, param(req), corpo));
export const DELETE = rota(['cardapio'], async ({ db, u, req }) => excluirPromocao(db, u, param(req)));
