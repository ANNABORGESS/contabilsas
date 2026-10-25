// Financeiro: conciliação bancária (extrato × títulos) e análise de endividamento da empresa ativa.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { addDias, arred, brl, dataBr, soDigitos } from '@/domain/dinheiro';
import { custoMedio, indicadoresDivida, pgfnParcelada } from '@/domain/endividamento';
import { resultadoGerencial, totaisGerenciais } from '@/domain/inteligencia';
import { STATUS_NO_LIVRO } from '@/domain/motor';
import { ehTributo, mesesAte } from '@/domain/painel';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { saldoBancario } from './banco';
import { lancamentosDaEmpresa } from './contabil';
import { ehAberto } from './consultas';

async function carteira(db: Db, emp: Empresa) {
  const [titulos, baixas] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db.select({ tituloId: schema.baixas.tituloId, valor: schema.baixas.valor, estornada: schema.baixas.estornada }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(eq(schema.titulos.empresaId, emp.id)),
  ]);
  const pago = new Map<string, number>();
  for (const b of baixas) if (!b.estornada) pago.set(b.tituloId, (pago.get(b.tituloId) || 0) + b.valor);
  const validos = titulos.filter((t) => !t.retorno && !/cancel/i.test(t.status));
  return { titulos, validos, saldo: (t: (typeof titulos)[number]) => (ehAberto(t) ? Math.max(0, arred(t.valor - (pago.get(t.id) || 0))) : 0) };
}

const palavras = (s: string) => s.toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !/^(LTDA|COMERCIO|INDUSTRIA|SERVICOS|PAGAMENTO|BOLETO|TRANSF|PIX)$/.test(w));

// ---------------------------------------------------------------- conciliação bancária

export const FILTROS_CONCILIACAO = [['pendentes', 'Pendentes'], ['conciliados', 'Conciliados'], ['todos', 'Todos']] as const;

export async function dadosConciliacao(db: Db, u: Usuario, emp: Empresa, filtro: string, conta: string) {
  const [movs, lancs, cart, banco] = await Promise.all([
    db.select().from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id)),
    lancamentosDaEmpresa(db, emp),
    carteira(db, emp),
    saldoBancario(db, u.tenantId, emp.id),
  ]);
  const porMov = new Map(lancs.filter((l) => l.id.startsWith('BKX|')).map((l) => [l.origemId, l]));
  const porCodigo = new Map(cart.titulos.map((t) => [t.codigo, t]));
  const abertos = cart.validos.filter((t) => cart.saldo(t) > 0.004);
  const linhas = movs.map((m) => {
    const l = porMov.get(m.id);
    const tit = l?.tituloBaixado ? porCodigo.get(l.tituloBaixado) : undefined;
    const situacao = !l ? 'Transferência própria' : tit ? 'Conciliado' : STATUS_NO_LIVRO.includes(l.status) || l.conf >= 95 ? 'Classificado' : 'Pendente';
    let sugestoes: { id: string; codigo: string; nome: string; venc: string | null; saldo: number; motivo: string }[] = [];
    if (situacao === 'Pendente') {
      const tipo = m.valor > 0 ? 'receber' : 'pagar';
      const v = Math.abs(m.valor);
      const tk = palavras(m.memo);
      sugestoes = abertos
        .filter((t) => t.tipo === tipo)
        .map((t) => {
          const s = cart.saldo(t);
          const nome = tk.some((w) => palavras(t.nome).includes(w)) || (!!t.docParceiro && m.memo.replace(/\D/g, '').includes(soDigitos(t.docParceiro)));
          const igual = Math.abs(s - v) < 0.011;
          const perto = Math.abs(s - v) <= Math.max(1, s * 0.05);
          const dias = t.venc ? Math.abs((Date.parse(t.venc) - Date.parse(m.data)) / 864e5) : 999;
          const pontos = (igual ? 3 : perto ? 1 : 0) + (nome ? 2 : 0) + (dias <= 10 ? 1 : 0);
          return { t, s, pontos, motivo: [igual ? 'mesmo valor' : perto ? 'valor próximo' : '', nome ? 'mesmo nome' : '', dias <= 10 ? `vencimento a ${Math.round(dias)}d` : ''].filter(Boolean).join(' · ') };
        })
        .filter((x) => x.pontos >= 3 || (x.pontos >= 2 && x.motivo.includes('nome')))
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 3)
        .map((x) => ({ id: x.t.id, codigo: x.t.codigo, nome: x.t.nome, venc: x.t.venc, saldo: x.s, motivo: x.motivo }));
    }
    return { id: m.id, conta: m.conta, data: m.data, memo: m.memo, valor: m.valor, situacao, titulo: tit ? { codigo: tit.codigo, nome: tit.nome } : null, manual: !!l?.conciliadoManual, classificacao: l && !tit ? l.motivo : null, sugestoes };
  });
  const contas = [...new Set(movs.map((m) => m.conta))].sort();
  const daConta = linhas.filter((l) => !conta || l.conta === conta);
  const lista = daConta
    .filter((l) => (filtro === 'conciliados' ? l.situacao === 'Conciliado' || l.situacao === 'Classificado' : filtro === 'todos' ? true : l.situacao === 'Pendente'))
    .sort((a, b) => b.data.localeCompare(a.data));
  const cont = (s: string) => daConta.filter((l) => l.situacao === s).length;
  return {
    contas, lista: lista.slice(0, 400), total: daConta.length,
    resumo: {
      conciliados: cont('Conciliado'), classificados: cont('Classificado'), pendentes: cont('Pendente'), proprias: cont('Transferência própria'),
      entradas: arred(daConta.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0)),
      saidas: arred(daConta.filter((l) => l.valor < 0).reduce((a, l) => a - l.valor, 0)),
      ultimo: daConta.reduce((a, l) => (l.data > a ? l.data : a), ''),
    },
    saldo: banco,
  };
}

/** Liga um movimento do extrato a um título em aberto: registra a baixa com a data e o valor do banco. */
export async function conciliarMovimento(db: Db, u: Usuario, emp: Empresa, movId: string, tituloId: string) {
  const [m] = await db.select().from(schema.extratoMovimentos).where(and(eq(schema.extratoMovimentos.id, movId), eq(schema.extratoMovimentos.empresaId, emp.id)));
  if (!m) throw new Error('Movimento do extrato não encontrado nesta empresa.');
  const [t] = await db.select().from(schema.titulos).where(and(eq(schema.titulos.id, tituloId), eq(schema.titulos.empresaId, emp.id)));
  if (!t) throw new Error('Título não encontrado nesta empresa.');
  if ((m.valor > 0 ? 'receber' : 'pagar') !== t.tipo) throw new Error(m.valor > 0 ? 'Entrada no banco só concilia com conta a receber.' : 'Saída no banco só concilia com conta a pagar.');
  if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
  const ja = await db.select({ id: schema.baixas.id, dados: schema.baixas.dados, estornada: schema.baixas.estornada }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(eq(schema.titulos.empresaId, emp.id));
  if (ja.some((b) => !b.estornada && (b.dados as { extratoId?: string })?.extratoId === m.id)) throw new Error('Este movimento já foi conciliado.');
  const pagos = await db.select({ valor: schema.baixas.valor, estornada: schema.baixas.estornada }).from(schema.baixas).where(eq(schema.baixas.tituloId, t.id));
  const saldo = arred(t.valor - pagos.filter((b) => !b.estornada).reduce((a, b) => a + b.valor, 0));
  const valor = Math.min(saldo, Math.abs(m.valor));
  await db.insert(schema.baixas).values({ tenantId: u.tenantId, tituloId: t.id, data: m.data, valor, forma: 'Extrato', conta: m.conta, obs: `Conciliado com o extrato: ${m.memo.slice(0, 120)}`, dados: { extratoId: m.id } });
  const status = valor >= saldo - 0.004 ? (t.tipo === 'pagar' ? 'Pago' : 'Recebido') : 'Parcial';
  await db.update(schema.titulos).set({ status }).where(eq(schema.titulos.id, t.id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Conciliou extrato com título', entidade: `${t.codigo} · ${t.nome}`, antes: `saldo ${brl(saldo)}`, depois: `${status} · ${brl(valor)} em ${dataBr(m.data)} (${m.conta})` });
  return { codigo: t.codigo, valor, sobra: arred(Math.abs(m.valor) - valor) };
}

// ---------------------------------------------------------------- análise de endividamento

export async function dadosEndividamento(db: Db, emp: Empresa, hoje: string) {
  const [cart, contratos, pgfn, lancs] = await Promise.all([
    carteira(db, emp),
    db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id)),
    db.select().from(schema.dividasAtivas).where(eq(schema.dividasAtivas.empresaId, emp.id)),
    lancamentosDaEmpresa(db, emp),
  ]);
  const ate12 = addDias(hoje, 365);
  const ehEmprestimo = (t: (typeof cart.titulos)[number]) => t.tipo === 'pagar' && (t.origem === 'emprestimo' || !!t.contrato || /emprest|financ|capital de giro|consorc|leasing/i.test(`${t.categoria || ''} ${t.descricao || ''}`));
  const abertos = cart.validos.filter((t) => t.tipo === 'pagar' && cart.saldo(t) > 0.004);
  const emp_ = abertos.filter(ehEmprestimo);
  const tribVenc = abertos.filter((t) => !ehEmprestimo(t) && ehTributo(t) && t.venc && t.venc < hoje);
  const fornVenc = abertos.filter((t) => !ehEmprestimo(t) && !ehTributo(t) && t.venc && t.venc < hoje);
  const soma = (l: typeof abertos) => arred(l.reduce((a, t) => a + cart.saldo(t), 0));

  // credores: contrato (ou nome) dos títulos de empréstimo + contratos sem parcela lançada
  const grupos = new Map<string, { credor: string; contrato: string | null; tipo: string; contratado: number | null; taxa: number | null; saldo: number; vencido: number; parcelas: number; proxima: { venc: string; valor: number } | null; semCronograma: boolean }>();
  for (const t of emp_) {
    const k = (t.contrato || t.nome).toLowerCase();
    const c = contratos.find((x) => (t.contrato && x.contrato === t.contrato) || x.instituicao.toLowerCase() === t.nome.toLowerCase());
    const g = grupos.get(k) || { credor: c?.instituicao || t.nome, contrato: t.contrato || c?.contrato || null, tipo: c?.tipo || 'Empréstimo', contratado: c?.valor ?? null, taxa: c?.taxa ?? null, saldo: 0, vencido: 0, parcelas: 0, proxima: null, semCronograma: false };
    const s = cart.saldo(t);
    g.saldo = arred(g.saldo + s); g.parcelas++;
    if (t.venc && t.venc < hoje) g.vencido = arred(g.vencido + s);
    else if (t.venc && (!g.proxima || t.venc < g.proxima.venc)) g.proxima = { venc: t.venc, valor: s };
    grupos.set(k, g);
  }
  for (const c of contratos.filter((x) => !/cancel|quitad/i.test(x.status))) {
    const tem = [...grupos.values()].some((g) => g.contrato === c.contrato || g.credor.toLowerCase() === c.instituicao.toLowerCase());
    if (!tem) grupos.set(`c:${c.id}`, { credor: c.instituicao, contrato: c.contrato, tipo: c.tipo, contratado: c.valor, taxa: c.taxa, saldo: c.valor, vencido: 0, parcelas: c.parcelas || 0, proxima: null, semCronograma: true });
  }
  const credores = [...grupos.values()].sort((a, b) => b.saldo - a.saldo);
  const emprestimos = arred(credores.reduce((a, g) => a + g.saldo, 0));
  const totalPgfn = arred(pgfn.reduce((a, d) => a + (d.valor || 0), 0));
  const onerosa = arred(emprestimos + totalPgfn);
  const total = arred(onerosa + soma(tribVenc) + soma(fornVenc));
  const curtoEmp = soma(emp_.filter((t) => !t.venc || t.venc <= ate12)) + credores.filter((g) => g.semCronograma).reduce((a, g) => a + g.saldo, 0);
  const pgfnCurto = arred(pgfn.filter((d) => !pgfnParcelada(d.situacao)).reduce((a, d) => a + (d.valor || 0), 0));
  const curtoPrazo = arred(curtoEmp + pgfnCurto + soma(tribVenc) + soma(fornVenc));
  const meses12 = mesesAte(hoje.slice(0, 7), 12);
  const t12 = totaisGerenciais(lancs, (l) => meses12.includes(l.comp), true);
  const r12 = resultadoGerencial(t12);
  const servico12 = soma(emp_.filter((t) => t.venc && t.venc >= hoje && t.venc <= ate12));
  const ind = indicadoresDivida({ onerosa, total, curtoPrazo, ebitda12: r12.ebitda, faturamento12: t12.faturamento, juros12: t12.financeiras, servico12 });
  // cronograma: vencido + próximos 12 meses
  const proximos = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const cronograma = [
    { mes: 'Vencido', valor: arred(soma(emp_.filter((t) => t.venc && t.venc < hoje))) },
    ...proximos.map((m) => ({ mes: m, valor: soma(emp_.filter((t) => t.venc && t.venc >= hoje && t.venc.startsWith(m))) })),
  ];
  return {
    hoje, credores, cronograma, indicadores: ind,
    composicao: { emprestimos, pgfn: totalPgfn, pgfnCurto, nPgfn: pgfn.length, tributosVencidos: soma(tribVenc), nTrib: tribVenc.length, fornecedoresVencidos: soma(fornVenc), nForn: fornVenc.length },
    onerosa, total, curtoPrazo, longoPrazo: arred(total - curtoPrazo),
    base12: { ebitda: r12.ebitda, faturamento: t12.faturamento, juros: t12.financeiras, servico: servico12, previa: lancs.some((l) => meses12.includes(l.comp) && !STATUS_NO_LIVRO.includes(l.status)) },
    custoMedio: custoMedio(contratos.filter((c) => !/cancel|quitad/i.test(c.status)).map((c) => ({ valor: c.valor, taxa: c.taxa }))),
    pgfn: pgfn.map((d) => ({ inscricao: d.inscricao, natureza: d.natureza, situacao: d.situacao, valor: d.valor || 0, atualizadoEm: d.atualizadoEm })),
  };
}
