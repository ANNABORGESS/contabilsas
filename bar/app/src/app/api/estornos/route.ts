import { estornosPendentes } from '@/server/caixa';
import { rota } from '@/server/http';

/** Estornos que ainda precisam da confirmação de que a devolução foi feita. */
export const GET = rota(['autorizar', 'fechamento'], async ({ db }) => ({ estornos: await estornosPendentes(db) }));
