import { tem } from '@/domain/papeis';
import { criarMesas, listarMesas } from '@/server/cadastros';
import { rota } from '@/server/http';

export const GET = rota([], async ({ db, u, req }) => ({ mesas: await listarMesas(db, tem(u.papel, 'mesas') && req.nextUrl.searchParams.get('todas') === '1') }));
export const POST = rota(['mesas'], async ({ db, u, corpo }) => ({ criadas: await criarMesas(db, u, corpo.de, corpo.ate) }));
