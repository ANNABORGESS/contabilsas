'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import type { Especialista } from '@/domain/especialistas';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { perguntarEspecialista, removerEspecialistas, salvarEspecialistas } from '@/server/especialistas';

/** Chamada pela tela de envio, um lote por vez (o navegador já abriu os zips). */
export async function enviarLote(itens: Especialista[], pacote: string): Promise<{ n: number } | { erro: string }> {
  try {
    const u = await exigirEdicao();
    const n = await salvarEspecialistas(await getDb(), u, itens, pacote);
    revalidatePath('/especialistas');
    return { n };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function perguntar(form: FormData) {
  const id = String(form.get('id') || '');
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await perguntarEspecialista(await getDb(), u, emp, id, String(form.get('pergunta') || ''), form.get('dados') === 'on');
    revalidatePath(`/especialistas/${id}`);
    redirect(`/especialistas/${id}?ok=1`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/especialistas/${id}?erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function removerTodos() {
  const u = await exigirEdicao();
  await removerEspecialistas(await getDb(), u);
  revalidatePath('/especialistas');
  redirect('/especialistas?msg=' + encodeURIComponent('Especialistas removidos. Envie os pacotes de novo quando quiser.'));
}
