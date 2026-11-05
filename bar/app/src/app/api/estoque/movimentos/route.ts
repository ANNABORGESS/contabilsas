import { listarMovimentos } from '@/server/estoque';
import { rota } from '@/server/http';

/** Histórico de entradas, saídas, vendas e cancelamentos do estoque (só administrador). */
export const GET = rota(['estoque'], async ({ db }) => ({ movimentos: await listarMovimentos(db) }));
