import { linkCozinha, novoLinkCozinha } from '@/server/acessoTela';
import { rota } from '@/server/http';

/** Link da cozinha sem senha (só administrador). POST gera um novo e invalida o anterior. */
export const GET = rota(['admin'], async ({ db }) => ({ caminho: await linkCozinha(db) }));
export const POST = rota(['admin'], async ({ db, u }) => ({ caminho: await novoLinkCozinha(db, u) }));
