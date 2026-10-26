import { criarFuncionario, listarEquipe } from '@/server/cadastros';
import { rota } from '@/server/http';

export const GET = rota(['admin'], async ({ db }) => ({ equipe: await listarEquipe(db) }));
export const POST = rota(['admin'], async ({ db, u, corpo }) => ({ funcionario: await criarFuncionario(db, u, corpo) }));
