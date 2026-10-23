'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { desfazerNota, importarNotasSefaz, lancarNota, receberNota } from '@/server/notas-sefaz';

type Ctx = { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> };

async function executar(form: FormData, f: (c: Ctx) => Promise<string>) {
  const volta = String(form.get('volta') || '/fiscal/notas');
  const sep = volta.includes('?') ? '&' : '?';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await f({ db: await getDb(), u, emp });
    revalidatePath('/fiscal/notas');
    redirect(`${volta}${sep}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${sep}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function importar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const f = form.get('planilha');
    if (!(f instanceof File) || !f.size) throw new Error('Escolha a planilha exportada do portal da SEFAZ.');
    if (f.size > 15 * 1024 * 1024) throw new Error('Planilha grande demais (máximo 15 MB).');
    return `Importado: ${await importarNotasSefaz(db, u, emp, f.name, Buffer.from(await f.arrayBuffer()))}`;
  });
}
export async function receber(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await receberNota(db, u, emp, String(form.get('id')), String(form.get('pedido') || ''), form.get('mesmoAssim') === 'on');
    return 'Recebimento confirmado.';
  });
}
export async function lancar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await lancarNota(db, u, emp, String(form.get('id')));
    return 'Nota marcada como lançada.';
  });
}
export async function desfazer(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `${(await desfazerNota(db, u, emp, String(form.get('id')))) === 'lançamento' ? 'Lançamento' : 'Recebimento'} desfeito.`);
}
