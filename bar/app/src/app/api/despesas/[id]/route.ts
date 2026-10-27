import { excluirDespesa } from '@/server/financeiro';
import { param, rota } from '@/server/http';

export const DELETE = rota(['admin'], async ({ db, u, req }) => excluirDespesa(db, u, param(req)));
