import { rota } from '@/server/http';
import { lerSite, salvarSite } from '@/server/site';

export const GET = rota(['admin'], async ({ db }) => ({ site: await lerSite(db) }));
export const PATCH = rota(['admin'], async ({ db, u, corpo }) => ({ site: await salvarSite(db, u, corpo) }));
