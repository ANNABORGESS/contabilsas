'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { exigirEdicao, exigirEmpresa } from '@/server/auth';
import { aprovarVersao, criarVersao, definirCaixaMinimo, definirLimitesOrcamento, definirSaldoConta, moverPagamento, registrarCobranca, salvarLinhasOrcamento } from '@/server/inteligencia';

type Ctx = { db: Awaited<ReturnType<typeof getDb>>; u: Awaited<ReturnType<typeof exigirEdicao>>; emp: Awaited<ReturnType<typeof exigirEmpresa>> };

async function executar(form: FormData, f: (c: Ctx) => Promise<string | { msg: string; volta: string }>) {
  let volta = String(form.get('volta') || '/inteligencia');
  if (!volta.startsWith('/inteligencia')) volta = '/inteligencia';
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const r = await f({ db: await getDb(), u, emp });
    const msg = typeof r === 'string' ? r : r.msg;
    if (typeof r !== 'string') volta = r.volta;
    revalidatePath('/inteligencia');
    redirect(`${volta}${volta.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}${volta.includes('?') ? '&' : '?'}erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function salvarCaixaMinimo(form: FormData) {
  await executar(form, async ({ db, u, emp }) => { await definirCaixaMinimo(db, u, emp, numero(form.get('minimo'))); return 'Caixa mínimo gravado.'; });
}
export async function salvarSaldoConta(form: FormData) {
  await executar(form, async ({ db, u, emp }) => { await definirSaldoConta(db, u, emp, String(form.get('conta') || ''), String(form.get('data') || ''), numero(form.get('valor'))); return 'Saldo da conta gravado.'; });
}
export async function novaCobranca(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const v = form.get('valor');
    await registrarCobranca(db, u, emp, {
      cliente: String(form.get('cliente') || ''), nomeCliente: String(form.get('nomeCliente') || ''), tipo: String(form.get('tipo') || 'Contato'), status: String(form.get('status') || ''),
      canal: String(form.get('canal') || ''), valor: v ? numero(v) : null, dataPrometida: String(form.get('dataPrometida') || '') || null, obs: String(form.get('obs') || ''),
    });
    return 'Cobrança registrada.';
  });
}
async function mover(form: FormData, acao: 'aprovar' | 'agendar' | 'voltar') {
  await executar(form, async ({ db, u, emp }) => {
    const n = await moverPagamento(db, u, emp, form.getAll('id').map(String), acao, String(form.get('data') || ''));
    return `${n} título(s) ${acao === 'aprovar' ? 'aprovado(s) para pagamento' : acao === 'agendar' ? 'agendado(s)' : 'voltaram para preparação'}. Nenhum pagamento foi enviado ao banco.`;
  });
}
export async function aprovarPagamentos(form: FormData) { await mover(form, 'aprovar'); }
export async function agendarPagamentos(form: FormData) { await mover(form, 'agendar'); }
export async function voltarPagamentos(form: FormData) { await mover(form, 'voltar'); }
export async function novaVersao(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const ano = Number(form.get('ano'));
    const id = await criarVersao(db, u, emp, ano, String(form.get('tipo')) as 'Original' | 'Revisão' | 'Forecast', String(form.get('base') || '') || null, String(form.get('nome') || ''));
    return { msg: 'Versão criada.', volta: `/inteligencia?aba=orcamento&ano=${ano}&v=${id}&editar=1` };
  });
}
export async function salvarOrcamento(form: FormData) {
  await executar(form, async ({ db, u, emp }) => {
    const linhas = JSON.parse(String(form.get('linhas') || '[]')) as { area: string; natureza: string; mes: number; valor: number }[];
    await salvarLinhasOrcamento(db, u, emp, String(form.get('versao')), linhas);
    return 'Orçamento salvo.';
  });
}
export async function aprovarOrcamento(form: FormData) {
  await executar(form, async ({ db, u, emp }) => { await aprovarVersao(db, u, emp, String(form.get('versao'))); return 'Versão aprovada: ela não muda mais. Para ajustar, crie uma revisão.'; });
}
export async function salvarLimites(form: FormData) {
  await executar(form, async ({ db, u, emp }) => { await definirLimitesOrcamento(db, u, emp, { verde: numero(form.get('verde')), amarelo: numero(form.get('amarelo')) }); return 'Limites gravados.'; });
}
