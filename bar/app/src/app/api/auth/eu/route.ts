import { rota } from '@/server/http';

export const GET = rota([], async ({ u }) => ({ usuario: u }));
