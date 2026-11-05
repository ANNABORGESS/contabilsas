import { atualizarProduto, excluirProduto } from '@/server/cadastros';
import { param, rota } from '@/server/http';

export const PATCH = rota(['cardapio'], async ({ db, u, req, corpo }) => ({ produto: await atualizarProduto(db, u, param(req), corpo) }));
export const DELETE = rota(['cardapio'], async ({ db, u, req }) => excluirProduto(db, u, param(req)));
