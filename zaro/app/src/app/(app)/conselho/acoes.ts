'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { consultarConselho } from '@/server/conselho';

export async function consultar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await consultarConselho(await getDb(), u, emp, String(form.get('pergunta') || ''));
    revalidatePath('/conselho');
    redirect('/conselho?ok=1');
  } catch (e) {
    unstable_rethrow(e);
    redirect('/conselho?erro=' + encodeURIComponent((e as Error).message));
  }
}
