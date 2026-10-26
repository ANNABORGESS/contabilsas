// Conexão com o banco. Com DATABASE_URL usa PostgreSQL (Supabase, Neon, servidor próprio).
// Sem ela, usa um PostgreSQL embutido (PGlite) gravado na pasta ./dados: o computador do
// caixa vira o servidor e os celulares acessam pela rede local. As migrações rodam sozinhas.
import fs from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const PASTA_DADOS = path.resolve(process.env.BAR_DATA_DIR || path.join(process.cwd(), 'dados'));
const MIGRACOES = path.join(process.cwd(), 'src', 'db', 'migrations');

const g = globalThis as unknown as { __barDb?: Promise<Db> };

/** Banco PGlite numa pasta ou só em memória (testes). */
export async function abrirPglite(pasta?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (pasta) fs.mkdirSync(pasta, { recursive: true });
  const db = drizzle(new PGlite(pasta), { schema });
  await migrate(db, { migrationsFolder: MIGRACOES });
  return db as unknown as Db;
}

async function conectar(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = await abrirPool(Pool, url);
    const db = drizzle(pool, { schema });
    // num banco compartilhado (ex.: o mesmo Supabase de outro sistema), o bar fica no seu schema
    await migrate(db, { migrationsFolder: MIGRACOES, migrationsSchema: SCHEMA || 'drizzle' });
    return db as unknown as Db;
  }
  // na Vercel o disco é só leitura: sem DATABASE_URL não há onde guardar os dados
  if (process.env.VERCEL) throw new Error('Falta a variável DATABASE_URL nas configurações da Vercel.');
  return abrirPglite(path.join(PASTA_DADOS, 'banco'));
}

const SCHEMA = /^[a-z_][a-z0-9_]*$/.test(process.env.BAR_DB_SCHEMA || '') ? process.env.BAR_DB_SCHEMA! : '';

type PoolCtor = typeof import('pg').Pool;

/** O pooler do Supabase fica em aws-0, aws-1 ou aws-2 conforme o projeto: tenta cada um. */
function candidatos(url: string): string[] {
  const m = url.match(/@aws-(\d)-([a-z0-9-]+)\.pooler\.supabase\.com/);
  if (!m) return [url];
  return [m[1], ...['0', '1', '2'].filter((n) => n !== m[1])].map((n) => url.replace(`@aws-${m[1]}-${m[2]}.`, `@aws-${n}-${m[2]}.`));
}

async function abrirPool(Pool: PoolCtor, url: string) {
  let ultimo: unknown;
  for (const u of candidatos(url)) {
    const local = /sslmode=disable/.test(u) || /localhost|127\.0\.0\.1/.test(u);
    const pool = new Pool({ connectionString: u, max: Number(process.env.BAR_DB_CONEXOES || 3), ssl: local ? undefined : { rejectUnauthorized: false } });
    if (SCHEMA) pool.on('connect', (c) => void c.query(`set search_path to "${SCHEMA}"`).catch(() => {}));
    try {
      await pool.query('select 1');
      return pool;
    } catch (e) {
      ultimo = e;
      await pool.end().catch(() => {});
    }
  }
  throw ultimo;
}

export function getDb(): Promise<Db> {
  if (!g.__barDb) {
    g.__barDb = conectar().catch((e) => {
      g.__barDb = undefined;
      throw e;
    });
  }
  return g.__barDb;
}

export { schema };
