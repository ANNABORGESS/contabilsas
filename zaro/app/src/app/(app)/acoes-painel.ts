'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { exigirUsuario } from '@/server/auth';
import { salvarPrefPainel, type PrefPainel } from '@/server/preferencias';

/** Preferência é pessoal: até o perfil Consulta pode arrumar o próprio Dashboard. */
export async function salvarPainel(p: PrefPainel) {
  const u = await exigirUsuario();
  await salvarPrefPainel(await getDb(), u, p);
  revalidatePath('/');
}
