// Entrada da cozinha sem usuário e senha. O administrador gera um link secreto; aberto uma vez no
// tablet da cozinha, ele entra com a conta da tela da cozinha e fica entrado por um ano. Gerar um
// link novo invalida o anterior e tira o acesso de todos os aparelhos que usavam a tela.
import 'server-only';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import { abrirSessao, hashSenha, type Usuario } from './auth';
import { registrar } from './eventos';

const CHAVE = 'acesso:cozinha';
export const LOGIN_TELA_COZINHA = 'tela-cozinha';
const HORAS_TELA = 24 * 365;

async function lerToken(db: Db): Promise<string | null> {
  const [r] = await db.select().from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE));
  const t = (r?.valor as { token?: unknown } | undefined)?.token;
  return typeof t === 'string' && t.length >= 20 ? t : null;
}

async function gravarToken(db: Db, token: string) {
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor: { token } })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: { token }, atualizadoEm: new Date() } });
}

/** Conta interna usada pela tela da cozinha (sem senha que alguém conheça). */
async function contaDaTela(db: Db) {
  const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, LOGIN_TELA_COZINHA));
  if (existe) return existe;
  const senhaHash = await hashSenha(crypto.randomBytes(24).toString('base64url'));
  const [nova] = await db
    .insert(schema.usuarios)
    .values({ nome: 'Cozinha', usuario: LOGIN_TELA_COZINHA, papel: 'cozinha', senhaHash })
    .onConflictDoNothing({ target: schema.usuarios.usuario })
    .returning();
  return nova ?? (await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, LOGIN_TELA_COZINHA)))[0];
}

/** Caminho do link da cozinha (cria o segredo na primeira vez). */
export async function linkCozinha(db: Db) {
  let token = await lerToken(db);
  if (!token) {
    token = crypto.randomBytes(18).toString('base64url');
    await gravarToken(db, token);
  }
  return `/entrar/cozinha/${token}`;
}

/** Troca o segredo: o link antigo para de funcionar e os aparelhos da cozinha precisam do link novo. */
export async function novoLinkCozinha(db: Db, u: Usuario) {
  await gravarToken(db, crypto.randomBytes(18).toString('base64url'));
  const conta = await contaDaTela(db);
  await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, conta.id));
  await registrar(db, { tipo: 'link_cozinha_trocado', usuarioId: u.id, descricao: `${u.nome} gerou um novo link da cozinha (o anterior parou de funcionar)` });
  return linkCozinha(db);
}

/** Abre a sessão da cozinha se o segredo do link confere. */
export async function entrarPeloLinkDaCozinha(db: Db, token: string) {
  const certo = await lerToken(db);
  const a = Buffer.from(token);
  const b = Buffer.from(certo || '');
  if (!certo || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const conta = await contaDaTela(db);
  if (!conta.ativo) await db.update(schema.usuarios).set({ ativo: true }).where(eq(schema.usuarios.id, conta.id));
  await abrirSessao(db, conta, HORAS_TELA, 'Tela da cozinha entrou pelo link (sem senha)');
  return true;
}
