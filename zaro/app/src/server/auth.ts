// Login, sessão e empresa ativa. A sessão é um token aleatório num cookie httpOnly; no
// banco fica só o hash dele, então um vazamento do banco não dá acesso às contas.
import 'server-only';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { and, asc, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb, schema } from '@/db';

const scrypt = promisify(crypto.scrypt) as (s: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE_SESSAO = 'zaro_sessao';
const COOKIE_EMPRESA = 'zaro_empresa';
const DIAS_SESSAO = 30;

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(senha, salt, 64);
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, salt, h] = guardado.split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const calc = await scrypt(senha, Buffer.from(salt, 'base64'), 64);
  const esperado = Buffer.from(h, 'base64');
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function iniciarSessao(usuarioId: string) {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DIAS_SESSAO * 864e5);
  await db.insert(schema.sessoes).values({ id: hashToken(token), usuarioId, expiraEm });
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.ZARO_COOKIE_SEGURO === '1',
    path: '/',
    expires: expiraEm,
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessoes).where(eq(schema.sessoes.id, hashToken(token)));
  }
  jar.delete(COOKIE_SESSAO);
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  tenantId: string;
  tenantNome: string;
}

export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const db = await getDb();
  const [r] = await db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, perfil: schema.usuarios.perfil, tenantId: schema.usuarios.tenantId, tenantNome: schema.tenants.nome, ativo: schema.usuarios.ativo })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sessoes.usuarioId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.usuarios.tenantId))
    .where(and(eq(schema.sessoes.id, hashToken(token)), gt(schema.sessoes.expiraEm, new Date())));
  if (!r || !r.ativo) return null;
  const { ativo: _ativo, ...u } = r;
  return u;
});

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  return u;
}

/** Perfis que só consultam não podem alterar dados. */
export function podeEditar(u: Usuario) {
  return u.perfil !== 'Consulta';
}
export async function exigirEdicao(): Promise<Usuario> {
  const u = await exigirUsuario();
  if (!podeEditar(u)) throw new Error('Seu perfil é só de consulta.');
  return u;
}

export type Empresa = typeof schema.empresas.$inferSelect;

export const empresasDoEscritorio = cache(async (tenantId: string): Promise<Empresa[]> => {
  const db = await getDb();
  return db.select().from(schema.empresas).where(eq(schema.empresas.tenantId, tenantId)).orderBy(asc(schema.empresas.razao));
});

/** Empresa ativa do usuário (cookie), sempre conferida contra o escritório dele. */
export const empresaAtiva = cache(async (u: Usuario): Promise<Empresa | null> => {
  const lista = await empresasDoEscritorio(u.tenantId);
  const escolhida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  return lista.find((e) => e.id === escolhida) || lista[0] || null;
});

export async function exigirEmpresa(u: Usuario): Promise<Empresa> {
  const e = await empresaAtiva(u);
  if (!e) redirect('/empresas?nova=1');
  return e;
}

export async function escolherEmpresa(id: string) {
  (await cookies()).set(COOKIE_EMPRESA, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 864e2 });
}
