import { rota } from '@/server/http';
import { previa } from '@/server/pedidos';

export const POST = rota(['garcom'], async ({ db, corpo }) => previa(db, corpo as never));
