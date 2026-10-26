import { param, rota } from '@/server/http';
import { mudarStatus } from '@/server/preparo';

export const PATCH = rota(['cozinha', 'bar', 'garcom'], async ({ db, u, req, corpo }) => mudarStatus(db, u, param(req), corpo.status));
