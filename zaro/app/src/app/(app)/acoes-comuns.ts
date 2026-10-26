'use server';
import { revalidatePath } from 'next/cache';
import { empresasDoEscritorio, escolherEmpresa, exigirUsuario } from '@/server/auth';
import { escolherMes } from '@/server/mes';

export async function trocarEmpresa(form: FormData) {
  const u = await exigirUsuario();
  const id = String(form.get('empresa') || '');
  if ((await empresasDoEscritorio(u.tenantId)).some((e) => e.id === id)) await escolherEmpresa(id);
  revalidatePath('/', 'layout');
}

export async function trocarMes(form: FormData) {
  await exigirUsuario();
  await escolherMes(String(form.get('mes') || '') || null);
  revalidatePath('/', 'layout');
}
