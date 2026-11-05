import { alterarEstoque } from '@/server/estoque';
import { param, rota } from '@/server/http';

/** Entrada, ajuste ou desligar o controle de estoque de um produto (só administrador). */
export const POST = rota(['admin'], async ({ db, u, req, corpo }) => alterarEstoque(db, u, param(req), corpo.acao, corpo.quantidade));
