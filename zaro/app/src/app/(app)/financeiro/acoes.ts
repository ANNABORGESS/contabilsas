'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { brl, numero } from '@/domain/dinheiro';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { definirSaldoInicial } from '@/server/banco';
import { moverPagamento } from '@/server/inteligencia';
import { anexarComprovante, marcarPrioritario, parcelarTitulo, reagendarMais7, registrarPagamento, registrarPagamentosLote, rejeitar, renegociar, trocarConta } from '@/server/pagamentos';
import { ajustarTitulo, cancelarTitulo, estornarBaixa, novoTitulo, registrarBaixa } from '@/server/financeiro';

async function executar(form: FormData, f: (ctx: { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> }) => Promise<string>) {
  const volta = String(form.get('volta') || '/financeiro');
  const sep = volta.includes('?') ? '&' : '?';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await f({ db: await getDb(), u, emp });
    revalidatePath('/financeiro');
    redirect(`${volta}${sep}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${sep}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function baixar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await registrarBaixa(db, u, emp, String(form.get('id')), String(form.get('data')), numero(form.get('valor')), String(form.get('forma') || ''));
    return 'Baixa registrada.';
  });
}
export async function estornar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await estornarBaixa(db, u, emp, String(form.get('baixa')), String(form.get('motivo') || ''));
    return 'Baixa estornada.';
  });
}
export async function revisar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await ajustarTitulo(db, u, emp, String(form.get('id')), String(form.get('venc') || ''), numero(form.get('valor')));
    return 'Título revisado.';
  });
}
export async function cancelar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await cancelarTitulo(db, u, emp, String(form.get('id')), String(form.get('motivo') || ''));
    return 'Título cancelado.';
  });
}
export async function criar(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const tipo = form.get('tipo') === 'receber' ? 'receber' : 'pagar';
    const codigo = await novoTitulo(db, u, emp, { tipo, nome: String(form.get('nome') || ''), descricao: String(form.get('descricao') || ''), categoria: String(form.get('categoria') || ''), venc: String(form.get('venc') || ''), valor: numero(form.get('valor')), competencia: String(form.get('competencia') || '') });
    return `Título ${codigo} lançado.`;
  });
}
export async function definirSaldo(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    await definirSaldoInicial(db, u, emp, String(form.get('data') || ''), numero(form.get('valor')));
    return 'Saldo inicial gravado. O Dashboard passa a mostrar o saldo bancário.';
  });
}

// ---------------------------------------------------------------- registrar e planejar pagamento
const ids = (form: FormData) => form.getAll('id').map(String).filter(Boolean);
const num = (form: FormData, k: string) => numero(form.get(k) || 0);

export async function registrarPagamentoAcao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const lista = ids(form);
    const detalhes = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith('det_')).map(([k, v]) => [k.slice(4), String(v)]));
    const comum = { data: String(form.get('data') || ''), forma: String(form.get('forma') || ''), conta: String(form.get('conta') || ''), detalhes, obs: String(form.get('obs') || ''), comprovante: form.get('comprovante') as File | null };
    if (lista.length === 1) {
      const r = await registrarPagamento(db, u, emp, lista[0], { ...comum, valor: num(form, 'valor'), desconto: num(form, 'desconto'), juros: num(form, 'juros'), multa: num(form, 'multa') });
      return `Pagamento de ${r.codigo} registrado: saída de ${brl(r.final)}.`;
    }
    const r = await registrarPagamentosLote(db, u, emp, lista, comum);
    return `${r.n} pagamentos registrados: ${brl(r.total)}.`;
  });
}
export async function aprovarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `${await moverPagamento(db, u, emp, ids(form), 'aprovar')} título(s) aprovado(s). Nenhum pagamento foi enviado ao banco.`);
}
export async function programarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `${await moverPagamento(db, u, emp, ids(form), 'agendar', String(form.get('dataProgramada') || ''))} pagamento(s) programado(s).`);
}
export async function rejeitarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `${await rejeitar(db, u, emp, ids(form), String(form.get('motivo') || ''))} título(s) rejeitado(s).`);
}
export async function reagendarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `${await reagendarMais7(db, u, emp, ids(form), new Date().toISOString().slice(0, 10))} pagamento(s) reagendado(s) em +7 dias.`);
}
export async function parcelarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const l = ids(form);
    if (l.length !== 1) throw new Error('Parcele um título por vez.');
    const c = await parcelarTitulo(db, u, emp, l[0], Number(form.get('parcelas')), String(form.get('primeiroVenc') || ''));
    return `Título parcelado: ${c.join(', ')}.`;
  });
}
export async function renegociarSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const v = String(form.get('novoValor') || '').trim();
    return `${await renegociar(db, u, emp, ids(form), String(form.get('novoVenc') || ''), v ? numero(v) : null, String(form.get('motivoReneg') || ''))} título(s) renegociado(s).`;
  });
}
export async function prioritarioSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => { const r = await marcarPrioritario(db, u, emp, ids(form)); return `${r.n} título(s) ${r.marcar ? 'marcado(s) como prioritário(s)' : 'sem prioridade'}.`; });
}
export async function trocarContaSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `Conta de origem trocada em ${await trocarConta(db, u, emp, ids(form), String(form.get('novaConta') || ''))} título(s).`);
}
export async function comprovanteSelecao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => `Comprovante anexado a ${await anexarComprovante(db, u, emp, ids(form), form.get('arquivo') as File | null)} título(s).`);
}
