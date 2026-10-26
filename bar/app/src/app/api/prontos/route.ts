import { rota } from '@/server/http';
import { prontosParaEntrega } from '@/server/preparo';

export const GET = rota(['garcom'], async ({ db }) => ({ prontos: await prontosParaEntrega(db) }));
