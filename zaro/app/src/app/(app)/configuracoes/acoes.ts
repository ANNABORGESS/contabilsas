'use server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb, schema } from '@/db';
import { auditar } from '@/server/auditoria';
import { exigirEdicao, exigirEmpresa, hashSenha, type Usuario } from '@/server/auth';
import { importarBackup } from '@/server/importar-backup';
import { manifestar, salvarConfigSefaz, sincronizarSefaz, testarSefaz } from '@/server/sefaz';

const PERFIS = ['Contador', 'Fiscal', 'Financeiro', 'Gestor', 'Administrador', 'Consulta'];

async function executar(aba: string, f: (ctx: { db: Awaited<ReturnType<typeof getDb>>; u: Usuario }) => Promise<string>) {
  try {
    const u = await exigirEdicao();
    const msg = await f({ db: await getDb(), u });
    revalidatePath('/', 'layout');
    redirect(`/configuracoes?aba=${aba}&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/configuracoes?aba=${aba}&erro=${encodeURIComponent((e as Error).message)}`);
  }
}
const exigirAdmin = (u: Usuario) => {
  if (u.perfil !== 'Administrador') throw new Error('Só o perfil Administrador pode fazer isso.');
};

export async function salvarSefaz(form: FormData) {
  await executar('sefaz', async ({ db, u }) => {
    await salvarConfigSefaz(db, u, String(form.get('url') || ''), String(form.get('token') || ''));
    return 'Integração salva.';
  });
}
export async function testar() {
  await executar('sefaz', async ({ db, u }) => testarSefaz(db, u, await exigirEmpresa(u)));
}
export async function sincronizar(form: FormData) {
  await executar('sefaz', async ({ db, u }) => sincronizarSefaz(db, u, await exigirEmpresa(u), form.get('reiniciar') === '1'));
}
export async function manifestarNota(form: FormData) {
  await executar('sefaz', async ({ db, u }) => {
    const tipo = String(form.get('tipo'));
    if (!['ciencia', 'confirmacao', 'desconhecimento'].includes(tipo)) throw new Error('Tipo inválido.');
    return manifestar(db, u, await exigirEmpresa(u), String(form.get('chave')), tipo as 'ciencia');
  });
}

export async function importar(form: FormData) {
  await executar('backup', async ({ db, u }) => {
    exigirAdmin(u);
    const f = form.get('backup');
    if (!(f instanceof File) || !f.size) throw new Error('Escolha o arquivo de backup (.json).');
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      throw new Error('O arquivo não é um JSON válido.');
    }
    const r = await importarBackup(db, u, json);
    return [
      `Importado: ${r.empresas} empresa(s) nova(s), ${r.titulos} título(s), ${r.baixas} baixa(s), ${r.parceiros} cliente(s)/fornecedor(es), ${r.extrato} movimento(s) de extrato, ${r.imobilizado} bem(ns), ${r.contratos} contrato(s), ${r.funcionarios} funcionário(s), ${r.dividas} inscrição(ões) PGFN, ${r.decisoes} decisão(ões) contábil(eis), ${r.regras} regra(s), ${r.auditoria} registro(s) de auditoria.`,
      r.guardadosComoLegado.length ? `Guardados para as próximas telas: ${r.guardadosComoLegado.length} grupo(s) de dados.` : '',
      ...r.avisos,
    ].filter(Boolean).join(' ');
  });
}

export async function criarUsuario(form: FormData) {
  await executar('usuarios', async ({ db, u }) => {
    exigirAdmin(u);
    const nome = String(form.get('nome') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const senha = String(form.get('senha') || '');
    const perfil = String(form.get('perfil') || 'Contador');
    if (!nome || !email) throw new Error('Informe nome e e-mail.');
    if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (!PERFIS.includes(perfil)) throw new Error('Perfil inválido.');
    const [ja] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, email));
    if (ja) throw new Error('Já existe um usuário com este e-mail.');
    await db.insert(schema.usuarios).values({ tenantId: u.tenantId, nome, email, perfil, senhaHash: await hashSenha(senha) });
    await auditar(db, u, { acao: 'Criou usuário', entidade: `${nome} · ${email}`, depois: perfil });
    return `Usuário ${nome} criado. Passe a senha para a pessoa por um canal seguro.`;
  });
}

export async function alternarUsuario(form: FormData) {
  await executar('usuarios', async ({ db, u }) => {
    exigirAdmin(u);
    const id = String(form.get('id'));
    if (id === u.id) throw new Error('Você não pode desativar o seu próprio usuário.');
    const [alvo] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.tenantId, u.tenantId)));
    if (!alvo) throw new Error('Usuário não encontrado.');
    await db.update(schema.usuarios).set({ ativo: !alvo.ativo }).where(eq(schema.usuarios.id, id));
    if (alvo.ativo) await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, id));
    await auditar(db, u, { acao: alvo.ativo ? 'Desativou usuário' : 'Reativou usuário', entidade: alvo.email });
    return alvo.ativo ? 'Usuário desativado.' : 'Usuário reativado.';
  });
}

export async function trocarSenha(form: FormData) {
  await executar('usuarios', async ({ db, u }) => {
    const nova = String(form.get('nova') || '');
    if (nova.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    await db.update(schema.usuarios).set({ senhaHash: await hashSenha(nova) }).where(eq(schema.usuarios.id, u.id));
    await auditar(db, u, { acao: 'Trocou a própria senha' });
    return 'Senha alterada.';
  });
}
