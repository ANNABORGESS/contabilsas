'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { aprovarDocumento, descartarDocumento, receberArquivos } from '@/server/autopilot';

const LIMITE = 20 * 1024 * 1024;

export async function enviarArquivos(form: FormData) {
  const u = await exigirEdicao();
  const emp = await exigirEmpresa(u);
  const arquivos = form.getAll('arquivos').filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) redirect('/autopilot?erro=' + encodeURIComponent('Escolha pelo menos um arquivo.'));
  const grandes = arquivos.filter((f) => f.size > LIMITE);
  if (grandes.length) redirect('/autopilot?erro=' + encodeURIComponent(`Arquivo acima de 20 MB: ${grandes.map((f) => f.name).join(', ')}`));
  const db = await getDb();
  const res = await receberArquivos(db, u, emp, await Promise.all(arquivos.map(async (f) => ({ nome: f.name, mime: f.type || 'application/octet-stream', conteudo: Buffer.from(await f.arrayBuffer()) }))));
  const resumo = res.map((r) => `${r.nome}: ${r.mensagem}`).join('\n');
  revalidatePath('/autopilot');
  redirect('/autopilot?msg=' + encodeURIComponent(resumo));
}

export async function aprovar(form: FormData) {
  const u = await exigirEdicao();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  try {
    const cods = await aprovarDocumento(db, u, emp, String(form.get('id')));
    revalidatePath('/autopilot');
    redirect('/autopilot?msg=' + encodeURIComponent(cods.length ? `Aprovado. Criado(s): ${cods.join(', ')}` : 'Aprovado sem título.'));
  } catch (e) {
    unstable_rethrow(e);
    redirect('/autopilot?erro=' + encodeURIComponent((e as Error).message));
  }
}

export async function descartar(form: FormData) {
  const u = await exigirEdicao();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  await descartarDocumento(db, u, emp, String(form.get('id')), String(form.get('motivo') || ''));
  revalidatePath('/autopilot');
  redirect('/autopilot?msg=' + encodeURIComponent('Documento descartado.'));
}
