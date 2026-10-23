'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { alternarItem, salvarItem } from '@/server/comercial';

const txt = (f: FormData, k: string) => String(f.get(k) || '');

export async function salvar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await salvarItem(await getDb(), u, emp, {
      id: txt(form, 'id') || undefined, tipo: txt(form, 'tipo') === 'produto' ? 'produto' : 'servico', nome: txt(form, 'nome'), unidade: txt(form, 'unidade'),
      ncm: txt(form, 'ncm'), categoria: txt(form, 'categoria'), preco: numero(form.get('preco')), custo: numero(form.get('custo')), descricao: txt(form, 'descricao'),
    });
    revalidatePath('/estoque');
    redirect(`/estoque?msg=${encodeURIComponent(form.get('id') ? 'Item alterado.' : 'Item cadastrado.')}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/estoque?erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function alternar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const r = await alternarItem(await getDb(), u, emp, txt(form, 'id'));
    revalidatePath('/estoque');
    redirect(`/estoque?inativos=1&msg=${encodeURIComponent(`Item ${r}.`)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/estoque?erro=${encodeURIComponent((e as Error).message)}`);
  }
}
