// Conexão com o banco. Com DATABASE_URL usa PostgreSQL (Supabase, Neon, servidor próprio).
// Sem ela, usa um PostgreSQL embutido (PGlite) gravado na pasta ./dados, para rodar num
// computador só, sem instalar nada. As migrações rodam sozinhas na primeira conexão.
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const PASTA_DADOS = path.resolve(process.env.ZARO_DATA_DIR || path.join(process.cwd(), 'dados'));
const MIGRACOES = path.join(process.cwd(), 'src', 'db', 'migrations');

const g = globalThis as unknown as { __zaroDb?: Promise<Db> };

async function conectar(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    // na nuvem cada função abre poucas conexões; o pooler do Supabase faz o resto
    const pool = new Pool({ connectionString: url, max: Number(process.env.ZARO_DB_CONEXOES || 3), ssl: /sslmode=disable/.test(url) || /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRACOES });
    return db as unknown as Db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const pasta = path.join(PASTA_DADOS, 'banco');
  fs.mkdirSync(pasta, { recursive: true });
  const client = new PGlite(pasta);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRACOES });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!g.__zaroDb) {
    g.__zaroDb = conectar().catch((e) => {
      g.__zaroDb = undefined;
      throw e;
    });
  }
  return g.__zaroDb;
}

export { schema };
