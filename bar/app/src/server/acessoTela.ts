// Cozinha e bar sem usuário e senha: quem abre /cozinha ou /bar num aparelho sem ninguém daquele
// setor entrado entra direto com a conta interna da tela e fica entrado por um ano.
import 'server-only';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import type { Setor } from '@/domain/pedido';
import { abrirSessao, hashSenha } from './auth';

const HORAS_TELA = 24 * 365;
const NOME_TELA: Record<Setor, string> = { cozinha: 'Cozinha', bar: 'Bar' };
/** Login das contas internas das telas (não aparecem em Funcionários). */
export const loginDaTela = (setor: Setor) => `tela-${setor}`;

/** Conta interna usada pela tela do setor (sem senha que alguém conheça). */
export async function contaDaTela(db: Db, setor: Setor) {
  const login = loginDaTela(setor);
  const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, login));
  if (existe) {
    if (!existe.ativo) await db.update(schema.usuarios).set({ ativo: true }).where(eq(schema.usuarios.id, existe.id));
    return existe;
  }
  const senhaHash = await hashSenha(crypto.randomBytes(24).toString('base64url'));
  const [nova] = await db
    .insert(schema.usuarios)
    .values({ nome: NOME_TELA[setor], usuario: login, papel: setor, senhaHash })
    .onConflictDoNothing({ target: schema.usuarios.usuario })
    .returning();
  return nova ?? (await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, login)))[0];
}

/** Abre a sessão da tela do setor neste aparelho. */
export async function entrarNaTela(db: Db, setor: Setor) {
  const conta = await contaDaTela(db, setor);
  await abrirSessao(db, conta, HORAS_TELA, `Tela ${setor === 'bar' ? 'do bar' : 'da cozinha'} aberta (sem senha)`);
}
