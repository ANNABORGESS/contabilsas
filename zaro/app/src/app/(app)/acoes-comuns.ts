'use server';
import { revalidatePath } from 'next/cache';
import { empresasDoEscritorio, escolherEmpresa, exigirUsuario } from '@/server/auth';

export async function trocarEmpresa(form: FormData) {
  const u = await exigirUsuario();
  const id = String(form.get('empresa') || '');
  if ((await empresasDoEscritorio(u.tenantId)).some((e) => e.id === id)) await escolherEmpresa(id);
  revalidatePath('/', 'layout');
}
