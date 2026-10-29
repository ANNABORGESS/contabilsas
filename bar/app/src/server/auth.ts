// Login e sessão. O token fica num cookie httpOnly; no banco só o hash dele.
import 'server-only';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getDb, schema, type Db } from '@/db';
import { NOME_PAPEL, ehPapel, pode, type Papel } from '@/domain/papeis';
import { registrar } from './eventos';

const scrypt = promisify(crypto.scrypt) as (s: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'bar_sessao';
const HORAS_SESSAO = 24 * 14;

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

export interface Usuario {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
}

/** Entra com usuário e senha. Com um perfil escolhido (garçom, cozinha...), só aceita quem é desse perfil ou administrador. */
export async function entrar(login: string, senha: string, perfil?: Papel): Promise<Usuario | { erro: string }> {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, login.trim().toLowerCase()));
  const ok = u && (u.ativo || u.pendente) && (await conferirSenha(senha, u.senhaHash));
  if (!ok || !ehPapel(u.papel)) {
    await new Promise((r) => setTimeout(r, 400)); // freia tentativas em sequência
    return { erro: 'Usuário ou senha incorretos.' };
  }
  if (u.pendente) return { erro: 'Sua conta ainda está aguardando a aprovação do administrador.' };
  if (perfil && !pode(u.papel, perfil)) return { erro: `Este usuário é de ${NOME_PAPEL[u.papel]}, não de ${NOME_PAPEL[perfil]}. Volte e escolha o perfil certo.` };
  await abrirSessao(db, u, HORAS_SESSAO, `${u.nome} entrou`);
  return { id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel };
}

/** Cria a sessão no banco e grava o cookie neste aparelho. */
export async function abrirSessao(db: Db, u: { id: string; nome: string }, horas: number, descricao: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + horas * 36e5);
  await db.insert(schema.sessoes).values({ id: hashToken(token), usuarioId: u.id, expiraEm });
  await registrar(db, { tipo: 'login', descricao, usuarioId: u.id });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.BAR_COOKIE_SEGURO === '1' || !!process.env.VERCEL, path: '/', expires: expiraEm });
}

export async function sair() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await getDb()).delete(schema.sessoes).where(eq(schema.sessoes.id, hashToken(token)));
  jar.delete(COOKIE);
}

export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [r] = await db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, usuario: schema.usuarios.usuario, papel: schema.usuarios.papel, ativo: schema.usuarios.ativo })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sessoes.usuarioId))
    .where(and(eq(schema.sessoes.id, hashToken(token)), gt(schema.sessoes.expiraEm, new Date())));
  if (!r || !r.ativo || !ehPapel(r.papel)) return null;
  return { id: r.id, nome: r.nome, usuario: r.usuario, papel: r.papel };
});

export class ErroAcesso extends Error {
  constructor(msg: string, readonly status: 401 | 403) {
    super(msg);
  }
}

export async function exigir(...papeis: Papel[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) throw new ErroAcesso('Entre de novo para continuar.', 401);
  if (papeis.length && !pode(u.papel, ...papeis)) throw new ErroAcesso('Seu perfil não tem acesso a esta função.', 403);
  return u;
}

export async function semUsuarios(db: Db): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.usuarios);
  return Number(r.n) === 0;
}
