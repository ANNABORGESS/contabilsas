import { tem } from '@/domain/papeis';
import { criarProduto, listarProdutos } from '@/server/cadastros';
import { rota } from '@/server/http';

export const GET = rota([], async ({ db, u, req }) => ({ produtos: await listarProdutos(db, (tem(u.papel, 'cardapio') || tem(u.papel, 'estoque')) && req.nextUrl.searchParams.get('todos') === '1') }));
export const POST = rota(['cardapio'], async ({ db, u, corpo }) => ({ produto: await criarProduto(db, u, corpo) }));
