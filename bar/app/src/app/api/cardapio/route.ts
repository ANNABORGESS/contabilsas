import { criarProduto, listarProdutos } from '@/server/cadastros';
import { rota } from '@/server/http';

export const GET = rota([], async ({ db, u, req }) => ({ produtos: await listarProdutos(db, u.papel === 'admin' && req.nextUrl.searchParams.get('todos') === '1') }));
export const POST = rota(['admin'], async ({ db, u, corpo }) => ({ produto: await criarProduto(db, u, corpo) }));
