import { atualizarMesa } from '@/server/cadastros';
import { param, rota } from '@/server/http';

export const PATCH = rota(['admin'], async ({ db, u, req, corpo }) => atualizarMesa(db, u, param(req), corpo));
