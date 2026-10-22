'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { ajustarTitulo, cancelarTitulo, estornarBaixa, novoTitulo, registrarBaixa } from '@/server/financeiro';

async function executar(form: FormData, f: (ctx: { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> }) => Promise<string>) {
  const volta = String(form.get('volta') || '/financeiro');
  const sep = volta.includes('?') ? '&' : '?';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await f({ db: await getDb(), u, emp });
    revalidatePath('/financeiro');
    redirect(`${volta}${sep}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${sep}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function baixar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await registrarBaixa(db, u, emp, String(form.get('id')), String(form.get('data')), numero(form.get('valor')), String(form.get('forma') || ''));
    return 'Baixa registrada.';
  });
}
export async function estornar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await estornarBaixa(db, u, emp, String(form.get('baixa')), String(form.get('motivo') || ''));
    return 'Baixa estornada.';
  });
}
export async function revisar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await ajustarTitulo(db, u, emp, String(form.get('id')), String(form.get('venc') || ''), numero(form.get('valor')));
    return 'Título revisado.';
  });
}
export async function cancelar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await cancelarTitulo(db, u, emp, String(form.get('id')), String(form.get('motivo') || ''));
    return 'Título cancelado.';
  });
}
export async function criar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const tipo = form.get('tipo') === 'receber' ? 'receber' : 'pagar';
    const codigo = await novoTitulo(db, u, emp, { tipo, nome: String(form.get('nome') || ''), descricao: String(form.get('descricao') || ''), categoria: String(form.get('categoria') || ''), venc: String(form.get('venc') || ''), valor: numero(form.get('valor')), competencia: String(form.get('competencia') || '') });
    return `Título ${codigo} lançado.`;
  });
}
