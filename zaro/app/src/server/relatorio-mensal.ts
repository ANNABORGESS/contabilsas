// Relatório Financeiro mensal (modelo em PDF): títulos com vencimento no mês, da empresa ativa.
import 'server-only';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred } from '@/domain/dinheiro';
import { ehTributo } from '@/domain/painel';
import { grupoDoTitulo, ORDEM_GRUPOS, semanasDoMes, separarParcela } from '@/domain/relatorio';
import type { Empresa } from './auth';

export async function dadosRelatorioMensal(db: Db, emp: Empresa, mes: string, hoje: string) {
  const [titulos, baixas, contratos] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db.select({ tituloId: schema.baixas.tituloId, valor: schema.baixas.valor, estornada: schema.baixas.estornada }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(eq(schema.titulos.empresaId, emp.id)),
    db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id)),
  ]);
  const pago = new Map<string, number>();
  for (const b of baixas) if (!b.estornada) pago.set(b.tituloId, (pago.get(b.tituloId) || 0) + b.valor);
  const doMes = titulos.filter((t) => t.venc?.startsWith(mes) && !t.retorno);
  const validos = doMes.filter((t) => !/cancel/i.test(t.status));
  const quitadoSemBaixa = (t: (typeof titulos)[number]) => /pago|recebido|quitad/i.test(t.status) && !pago.has(t.id);
  const linha = (t: (typeof titulos)[number]) => {
    const p = quitadoSemBaixa(t) ? t.valor : Math.min(t.valor, pago.get(t.id) || 0);
    const saldo = arred(Math.max(0, t.valor - p));
    const d = (t.dados || {}) as { pedido?: string };
    const tipo = t.tipo as 'pagar' | 'receber';
    const grupo = grupoDoTitulo({ tipo, venc: t.venc, saldo }, hoje);
    return {
      id: t.id, tipo, nome: t.nome, codigo: t.codigo,
      documento: t.nf ? `NF ${t.nf}${t.tipo === 'pagar' && t.parcela && t.parcela !== '1/1' ? ` · ${t.parcela.split('/')[0]}` : ''}` : t.codigo,
      descricao: t.descricao || t.categoria || '—',
      detalhe: d.pedido ? `Pedido ${d.pedido}` : t.obs && t.obs.length < 70 ? t.obs : t.contrato || '',
      valor: t.valor, venc: t.venc, pago: arred(p), saldo, grupo,
      status: saldo <= 0.004 ? (tipo === 'pagar' ? 'PAGO' : 'RECEBIDO') : grupo === 'Vencidos' ? 'VENCIDO' : tipo === 'pagar' ? 'A PAGAR' : 'A RECEBER',
    };
  };
  const linhas = validos.map(linha).sort((a, b) => (a.venc || '').localeCompare(b.venc || '') || a.nome.localeCompare(b.nome));
  const grupos = (tipo: 'pagar' | 'receber') => ORDEM_GRUPOS[tipo]
    .map((g) => ({ nome: g, itens: linhas.filter((l) => l.tipo === tipo && l.grupo === g) }))
    .filter((g) => g.itens.length)
    .map((g) => ({ ...g, total: arred(g.itens.reduce((a, l) => a + (/Pagos|Recebidos/.test(g.nome) ? l.valor : l.saldo), 0)) }));
  const tot = (tipo: string, k: 'valor' | 'pago' | 'saldo') => arred(linhas.filter((l) => l.tipo === tipo).reduce((a, l) => a + l[k], 0));
  const semanas = semanasDoMes(mes).map((s) => {
    const no = linhas.filter((l) => l.venc && l.venc >= s.de && l.venc <= s.ate);
    const r = arred(no.filter((l) => l.tipo === 'receber').reduce((a, l) => a + l.valor, 0));
    const p = arred(no.filter((l) => l.tipo === 'pagar').reduce((a, l) => a + l.valor, 0));
    return { ...s, receber: r, pagar: p, saldo: arred(r - p) };
  });
  // empréstimos e financiamentos com parcela no mês
  const ehEmp = (t: (typeof titulos)[number]) => t.tipo === 'pagar' && (t.origem === 'emprestimo' || !!t.contrato);
  const emprestimos = validos.filter(ehEmp).map((t) => {
    const c = contratos.find((x) => x.contrato === t.contrato);
    const sep = separarParcela(t.valor, t.juros != null ? Number(t.juros) : null, `${t.descricao || ''} ${t.obs || ''}`);
    return { instituicao: c?.instituicao || t.nome, contrato: t.contrato || c?.contrato || '—', parcela: t.parcela, principal: sep.principal, juros: sep.juros, valor: t.valor, venc: t.venc };
  }).sort((a, b) => (a.venc || '').localeCompare(b.venc || ''));
  const folha = validos.filter((t) => t.tipo === 'pagar' && (t.origem === 'folha' || !!t.folhaTipo)).map(linha);
  const vencidos = linhas.filter((l) => l.grupo === 'Vencidos');
  const proximo = linhas.filter((l) => l.saldo > 0.004 && l.venc && l.venc >= hoje).map((l) => l.venc!).sort()[0] || null;
  const canceladas = doMes.filter((t) => /cancel/i.test(t.status));
  const nfsCanceladas = new Map<string, number>();
  for (const t of canceladas) nfsCanceladas.set(t.nf || t.codigo, (nfsCanceladas.get(t.nf || t.codigo) || 0) + (t.valorFiscal ?? t.valor));
  return {
    mes,
    receber: { total: tot('receber', 'valor'), recebido: tot('receber', 'pago'), saldo: tot('receber', 'saldo'), grupos: grupos('receber') },
    pagar: { total: tot('pagar', 'valor'), pago: tot('pagar', 'pago'), saldo: tot('pagar', 'saldo'), grupos: grupos('pagar') },
    previsto: arred(tot('receber', 'valor') - tot('pagar', 'valor')),
    realizado: arred(tot('receber', 'pago') - tot('pagar', 'pago')),
    semanas,
    maiorEntrada: semanas.reduce((a, s) => (s.receber > a.receber ? s : a), semanas[0]),
    maiorSaida: semanas.reduce((a, s) => (s.pagar > a.pagar ? s : a), semanas[0]),
    emprestimos,
    totEmprestimos: { valor: arred(emprestimos.reduce((a, e) => a + e.valor, 0)), principal: arred(emprestimos.reduce((a, e) => a + (e.principal || 0), 0)), juros: arred(emprestimos.reduce((a, e) => a + (e.juros || 0), 0)), parcial: emprestimos.some((e) => e.juros == null) },
    folha,
    resumo: {
      vencidos: vencidos.length, vencidosReceber: vencidos.filter((l) => l.tipo === 'receber').length, vencidosPagar: vencidos.filter((l) => l.tipo === 'pagar').length,
      valoresVencidos: arred(vencidos.reduce((a, l) => a + l.saldo, 0)), proximo,
      tributos: arred(linhas.filter((l) => l.tipo === 'pagar' && ehTributo({ nome: l.nome, descricao: l.descricao })).reduce((a, l) => a + l.valor, 0)),
    },
    canceladas: { n: nfsCanceladas.size, valor: arred([...nfsCanceladas.values()].reduce((a, v) => a + v, 0)) },
    vazio: !linhas.length,
  };
}
