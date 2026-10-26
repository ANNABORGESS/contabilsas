'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { alternarItem, salvarItem } from '@/server/comercial';
import { trazerParaCadastro } from '@/server/produtos-vendidos';

const txt = (f: FormData, k: string) => String(f.get(k) || '');

export async function salvar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await salvarItem(await getDb(), u, emp, {
      id: txt(form, 'id') || undefined, tipo: txt(form, 'tipo') === 'produto' ? 'produto' : 'servico', nome: txt(form, 'nome'), unidade: txt(form, 'unidade'),
      ncm: txt(form, 'ncm'), categoria: txt(form, 'categoria'), preco: numero(form.get('preco')), custo: numero(form.get('custo')), descricao: txt(form, 'descricao'),
    });
    revalidatePath('/comercial');
    redirect(`/comercial?t=produtos&aba=cadastro&msg=${encodeURIComponent(form.get('id') ? 'Item alterado.' : 'Item cadastrado.')}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=produtos&aba=cadastro&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function alternar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const r = await alternarItem(await getDb(), u, emp, txt(form, 'id'));
    revalidatePath('/comercial');
    redirect(`/comercial?t=produtos&aba=cadastro&inativos=1&msg=${encodeURIComponent(`Item ${r}.`)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=produtos&aba=cadastro&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function trazer() {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await trazerParaCadastro(await getDb(), u, emp);
    revalidatePath('/comercial');
    redirect(`/comercial?t=produtos&aba=cadastro&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=produtos&erro=${encodeURIComponent((e as Error).message)}`);
  }
}
