'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import type { Decisao } from '@/domain/creditos';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { decidirCredito, definirContribuinteIpi } from '@/server/creditos';

async function executar(form: FormData, f: (ctx: { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> }) => Promise<string>) {
  const volta = String(form.get('volta') || '/fiscal/creditos');
  const sep = volta.includes('?') ? '&' : '?';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await f({ db: await getDb(), u, emp });
    revalidatePath('/fiscal/creditos');
    revalidatePath('/contabilidade');
    redirect(`${volta}${sep}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${sep}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function ipiAcao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const sim = form.get('ipi') === 'sim';
    await definirContribuinteIpi(db, u, emp, sim);
    return sim ? 'IPI das compras de insumo passa a ser crédito.' : 'IPI das compras fica no custo.';
  });
}

export async function decidirAcao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const d = String(form.get('decisao'));
    const decisao: Decisao | null = d === 'credita' ? 'credita' : d === 'nao' ? 'nao' : null;
    const item = String(form.get('item') || '');
    const ncm = String(form.get('ncm') || '').replace(/\D/g, '');
    if (!item) throw new Error('Item não informado.');
    const porNcm = form.get('todosNcm') === 'on' && !!ncm;
    // decidir pelo NCM: a decisão própria do item sai, para valer a do NCM
    if (porNcm) await decidirCredito(db, u, emp, [item], null);
    await decidirCredito(db, u, emp, [porNcm ? `ncm:${ncm}` : item], decisao);
    const alvo = porNcm ? `todos os itens do NCM ${ncm}` : 'o item';
    return decisao === 'credita' ? `Crédito confirmado para ${alvo}.` : decisao === 'nao' ? `Sem crédito para ${alvo}.` : `${alvo[0].toUpperCase()}${alvo.slice(1)} voltou para a classificação automática.`;
  });
}
