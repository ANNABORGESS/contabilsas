import { param, rota } from '@/server/http';
import { salvarCombo } from '@/server/promocoes';

/** Liga/desliga, preço e horários de um combo do happy hour. */
export const PATCH = rota(['cardapio'], async ({ db, u, req, corpo }) => salvarCombo(db, u, param(req), corpo));
