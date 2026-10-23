'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { LINHAS_VENDA } from '@/domain/venda';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { cancelarVenda, lancarVenda } from '@/server/comercial';

const txt = (f: FormData, k: string) => String(f.get(k) || '');

export async function vender(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const itens = Array.from({ length: LINHAS_VENDA }, (_, k) => ({
      catalogoId: txt(form, `item${k}`), nome: txt(form, `nome${k}`), qtd: numero(form.get(`qtd${k}`)), preco: numero(form.get(`preco${k}`)),
    })).filter((i) => (i.catalogoId || i.nome.trim()) && i.qtd > 0);
    const msg = await lancarVenda(await getDb(), u, emp, {
      data: txt(form, 'data'), parceiroId: txt(form, 'cliente'), novoCliente: txt(form, 'novoCliente'), novoDoc: txt(form, 'novoDoc'),
      itens, parcelas: Number(txt(form, 'parcelas')) || 1, primeiroVenc: txt(form, 'primeiroVenc'), obs: txt(form, 'obs'),
    });
    revalidatePath('/comercial');
    revalidatePath('/financeiro');
    redirect(`/comercial?t=vendas&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=vendas&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function cancelar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await cancelarVenda(await getDb(), u, emp, txt(form, 'id'), txt(form, 'motivo'));
    revalidatePath('/comercial');
    revalidatePath('/financeiro');
    redirect(`/comercial?t=vendas&msg=${encodeURIComponent('Venda cancelada e parcelas canceladas no Contas a Receber.')}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=vendas&erro=${encodeURIComponent((e as Error).message)}`);
  }
}
