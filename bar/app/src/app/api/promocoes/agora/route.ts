import { rota } from '@/server/http';
import { combosAgora, promocoesAgora } from '@/server/promocoes';

/** Promoções valendo agora, com a hora de encerramento (contagem regressiva no celular). */
export const GET = rota([], async ({ db }) => ({ promocoes: await promocoesAgora(db), combos: await combosAgora(db), agora: new Date().toISOString() }));
