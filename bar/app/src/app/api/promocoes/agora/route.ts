import { rota } from '@/server/http';
import { promocoesAgora } from '@/server/promocoes';

/** Promoções valendo agora, com a hora de encerramento (contagem regressiva no celular). */
export const GET = rota([], async ({ db }) => ({ promocoes: await promocoesAgora(db), agora: new Date().toISOString() }));
