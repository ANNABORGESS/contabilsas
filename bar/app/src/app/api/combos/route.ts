import { rota } from '@/server/http';
import { criarCombo } from '@/server/promocoes';

/** Cria um combo do happy hour. */
export const POST = rota(['cardapio'], async ({ db, u, corpo }) => criarCombo(db, u, corpo));
