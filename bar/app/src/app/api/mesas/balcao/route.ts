import { definirLugaresBalcao } from '@/server/cadastros';
import { rota } from '@/server/http';

/** Quantas cadeiras tem o balcão (Balcão 1, Balcão 2...). Só administrador. */
export const POST = rota(['mesas'], async ({ db, u, corpo }) => definirLugaresBalcao(db, u, corpo.cadeiras));
