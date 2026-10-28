'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import type { StatusLanc } from '@/domain/motor';
import { PLANO_PADRAO } from '@/domain/plano-contas';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { ajustarConta, estornar, lancamentosDaEmpresa, mudarStatus, restaurar } from '@/server/contabil';

async function executar(form: FormData, f: (ctx: { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> }) => Promise<string>) {
  const volta = String(form.get('volta') || '/contabilidade');
  const sep = volta.includes('?') ? '&' : '?';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await f({ db: await getDb(), u, emp });
    revalidatePath('/contabilidade');
    redirect(`${volta}${sep}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${sep}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function aplicarStatus(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const status = String(form.get('status')) as StatusLanc | 'Restaurar';
    const ids = form.getAll('ids').map(String);
    if (!ids.length) throw new Error('Marque pelo menos um lançamento.');
    if (status === 'Restaurar') {
      await restaurar(db, u, emp, ids);
      return `${ids.length} lançamento(s) restaurado(s): voltaram para a lista e para as demonstrações.`;
    }
    if (!['Aprovado', 'Contabilizado', 'Sugerido', 'Em revisão', 'Excluído'].includes(status)) throw new Error('Status inválido.');
    if (status === 'Excluído') {
      const todos = await lancamentosDaEmpresa(db, emp, { incluirExcluidos: true });
      const travados = todos.filter((l) => ids.includes(l.id) && ['Contabilizado', 'Estornado'].includes(l.status));
      if (travados.length) throw new Error('Lançamento contabilizado não pode ser excluído: faça o estorno.');
    }
    await mudarStatus(db, u, emp, ids, status);
    return status === 'Excluído'
      ? `${ids.length} lançamento(s) excluído(s): saíram do balancete, da DRE e do balanço. Para desfazer, filtre o status Excluído e clique em Restaurar.`
      : `${ids.length} lançamento(s) marcado(s) como ${status}.`;
  });
}

export async function aprovarConfiaveis(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const L = await lancamentosDaEmpresa(db, emp);
    const ids = L.filter((l) => (l.status === 'Automático' || l.status === 'Sugerido') && l.conf >= 90).map((l) => l.id);
    await mudarStatus(db, u, emp, ids, 'Aprovado');
    return `${ids.length} lançamento(s) com confiança de 90% ou mais aprovados.`;
  });
}

export async function trocarConta(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const id = String(form.get('id'));
    const conta = String(form.get('conta'));
    if (!PLANO_PADRAO.some((c) => c.codigo === conta)) throw new Error('Conta inexistente no plano.');
    const l = (await lancamentosDaEmpresa(db, emp)).find((x) => x.id === id);
    if (!l || !l.editavel) throw new Error('Este lançamento não aceita troca de conta.');
    await ajustarConta(db, u, emp, l, conta, form.get('aprender') === 'on');
    return 'Conta ajustada e lançamento aprovado.';
  });
}

export async function estornarLanc(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await estornar(db, u, emp, String(form.get('id')), String(form.get('motivo') || ''));
    return 'Lançamento estornado: o inverso foi gerado.';
  });
}
