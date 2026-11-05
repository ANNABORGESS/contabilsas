import { dataValida } from '@/domain/turno';
import { movimentarCaixa } from '@/server/caixa';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';

/** Abertura (troco), suprimento ou sangria do caixa do turno. */
export const POST = rota(['fechamento'], async ({ db, u, corpo }) => movimentarCaixa(db, u, dataValida(corpo.data) ? String(corpo.data) : hoje(), corpo));
