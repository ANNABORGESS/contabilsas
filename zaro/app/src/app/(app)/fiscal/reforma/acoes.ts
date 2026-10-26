'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { type Db, getDb } from '@/db';
import { type Empresa, exigirEdicao, exigirEmpresa, type Usuario } from '@/server/auth';
import { confirmarSegregacao, conciliarComExtrato, desfazerConfirmacao, importarRetornoPsp, sincronizarRecebimentos } from '@/server/split-payment';

async function executar(aba: string, fn: (db: Db, u: Usuario, emp: Empresa) => Promise<string>) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await fn(await getDb(), u, emp);
    revalidatePath('/fiscal/reforma');
    revalidatePath('/contabilidade');
    redirect(`/fiscal/reforma?aba=${aba}&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/fiscal/reforma?aba=${aba}&erro=${encodeURIComponent((e as Error).message)}`);
  }
}
const txt = (f: FormData, k: string) => String(f.get(k) || '');

export async function sincronizarAcao() {
  await executar('operacoes', (db, u, emp) => sincronizarRecebimentos(db, u, emp));
}
export async function importarAcao(form: FormData) {
  await executar('conciliacao', async (db, u, emp) => {
    const f = form.get('arquivo');
    if (!(f instanceof File) || !f.size) throw new Error('Escolha o arquivo de retorno do provedor (CSV).');
    if (f.size > 5_000_000) throw new Error('Arquivo grande demais (máximo 5 MB).');
    return importarRetornoPsp(db, u, emp, txt(form, 'psp'), { nome: f.name, conteudo: Buffer.from(await f.arrayBuffer()) });
  });
}
export async function conciliarAcao() {
  await executar('conciliacao', (db, u, emp) => conciliarComExtrato(db, u, emp));
}
export async function confirmarAcao(form: FormData) {
  await executar('segregados', async (db, u, emp) => {
    const f = form.get('comprovante');
    if (!(f instanceof File) || !f.size) throw new Error('Anexe o comprovante: sem evidência o ZARO não confirma a segregação.');
    return confirmarSegregacao(db, u, emp, txt(form, 'id'), txt(form, 'fonte'), { nome: f.name, mime: f.type || 'application/octet-stream', conteudo: Buffer.from(await f.arrayBuffer()) });
  });
}
export async function desfazerAcao(form: FormData) {
  await executar('segregados', (db, u, emp) => desfazerConfirmacao(db, u, emp, txt(form, 'id'), txt(form, 'motivo')));
}
