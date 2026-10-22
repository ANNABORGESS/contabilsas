'use server';
import { count, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, schema } from '@/db';
import { conferirSenha, encerrarSessao, hashSenha, iniciarSessao } from '@/server/auth';

const voltar = (pagina: string, erro: string): never => redirect(`${pagina}?erro=${encodeURIComponent(erro)}`);

export async function entrar(form: FormData) {
  const email = String(form.get('email') || '').trim().toLowerCase();
  const senha = String(form.get('senha') || '');
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
  const ok = u && u.ativo && (await conferirSenha(senha, u.senhaHash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // atrasa tentativas repetidas
    voltar('/login', 'E-mail ou senha incorretos.');
  }
  await iniciarSessao(u!.id);
  redirect('/');
}

export async function sair() {
  await encerrarSessao();
  redirect('/login');
}

export async function criarPrimeiroAcesso(form: FormData) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.usuarios);
  if (n > 0) redirect('/login');
  // na nuvem, só quem tem o código definido em ZARO_CODIGO_PRIMEIRO_ACESSO cria o escritório
  const codigo = process.env.ZARO_CODIGO_PRIMEIRO_ACESSO;
  if (codigo && String(form.get('codigo') || '').trim() !== codigo) voltar('/primeiro-acesso', 'Código de primeiro acesso incorreto.');
  const escritorio = String(form.get('escritorio') || '').trim();
  const nome = String(form.get('nome') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const senha = String(form.get('senha') || '');
  if (!escritorio || !nome || !email) voltar('/primeiro-acesso', 'Preencha todos os campos.');
  if (senha.length < 8) voltar('/primeiro-acesso', 'A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== String(form.get('senha2') || '')) voltar('/primeiro-acesso', 'As senhas não conferem.');
  const senhaHash = await hashSenha(senha);
  const usuarioId = await db.transaction(async (tx) => {
    const [t] = await tx.insert(schema.tenants).values({ nome: escritorio }).returning();
    const [u] = await tx.insert(schema.usuarios).values({ tenantId: t.id, nome, email, senhaHash, perfil: 'Administrador' }).returning();
    await tx.insert(schema.auditoria).values({ tenantId: t.id, usuarioId: u.id, usuario: `${nome} · Administrador`, acao: 'Criou o escritório e o primeiro usuário' });
    return u.id;
  });
  await iniciarSessao(usuarioId);
  redirect('/empresas?nova=1');
}
