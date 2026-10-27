import { lancarDespesa } from '@/server/financeiro';
import { rota } from '@/server/http';

export const POST = rota(['admin'], async ({ db, u, corpo }) => ({ despesa: await lancarDespesa(db, u, corpo) }));
