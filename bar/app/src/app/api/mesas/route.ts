import { criarMesas, listarMesas } from '@/server/cadastros';
import { rota } from '@/server/http';

export const GET = rota([], async ({ db, u, req }) => ({ mesas: await listarMesas(db, u.papel === 'admin' && req.nextUrl.searchParams.get('todas') === '1') }));
export const POST = rota(['admin'], async ({ db, u, corpo }) => ({ criadas: await criarMesas(db, u, corpo.de, corpo.ate) }));
