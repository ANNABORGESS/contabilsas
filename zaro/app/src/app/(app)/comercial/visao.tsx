import { and, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { ETAPAS_EXECUCAO } from '@/domain/comercial';
import { brl } from '@/domain/dinheiro';
import type { Empresa } from '@/server/auth';
import { docsDaEmpresa } from '@/server/comercial-docs';
import { custosEPedidos } from '@/server/rentabilidade';
import { Avisos, Cabeca, Kpis } from './comum';

export const SECOES: [string, string, string][] = [
  ['parceiros', 'Clientes e Fornecedores', 'Cadastro, contato e consulta de CNPJ'],
  ['compras', 'Compras e Cotações', 'Solicitação, cotação de até 3 fornecedores, pedido de compra e recebimento'],
  ['orcamentos', 'Orçamentos', 'Proposta com margem, versões, aprovação e PDF'],
  ['pedidos', 'Pedidos Aprovados', 'Pedido do cliente, andamento da produção e faturamento'],
  ['vendas', 'Vendas e Faturamento', 'Vendas lançadas e parcelas no Contas a Receber'],
  ['produtos', 'Produtos e Estoque', 'Produtos vendidos nas NFs, cadastro com custos e movimentações'],
  ['custos', 'Custos e Rentabilidade', 'Custo por pedido, margem por cliente e produto, orçado × realizado'],
  ['precos', 'Preços e Simulações', 'Histórico de preços vendidos e simulador de preço'],
];

export async function VisaoComercial({ emp, mes, msg, erro }: { emp: Empresa; mes: string; msg?: string; erro?: string }) {
  const db = await getDb();
  const [parc, docs, c, aReceber, faturadoMes] = await Promise.all([
    db.select({ tipo: schema.parceiros.tipo, n: sql<number>`count(*)::int` }).from(schema.parceiros).where(eq(schema.parceiros.empresaId, emp.id)).groupBy(schema.parceiros.tipo),
    docsDaEmpresa(db, emp.id, ['orcamento', 'pedido', 'solicitacao', 'compra']),
    custosEPedidos(db, emp.id),
    db.select({ v: sql<string>`coalesce(sum(${schema.titulos.valor}), 0)` }).from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), sql`${schema.titulos.status} in ('A receber', 'Em revisão', 'Vencido')`)),
    db.select({ v: sql<string>`coalesce(sum(coalesce(${schema.titulos.valorFiscal}, ${schema.titulos.valor})), 0)` }).from(schema.titulos)
      .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), eq(schema.titulos.retorno, false), sql`${schema.titulos.status} not ilike '%cancel%'`, sql`coalesce(${schema.titulos.dados}->>'nfEmissao', ${schema.titulos.competencia}) like ${mes + '%'}`)),
  ]);
  const n = (tipo: string) => parc.find((p) => p.tipo === tipo)?.n || 0;
  const por = (tipo: string, status?: string[]) => docs.filter((d) => d.tipo === tipo && (!status || status.includes(d.status)));
  const orcAbertos = por('orcamento', ['Rascunho', 'Enviado']);
  const pedidosAFaturar = por('pedido', ['A faturar']);
  const emProducao = pedidosAFaturar.filter((p) => String(p.dados.etapa || ETAPAS_EXECUCAO[0]) !== 'Entregue');
  const soma = (l: { total: number }[]) => l.reduce((a, d) => a + d.total, 0);
  const fluxo: [string, string | number, string, string][] = [
    ['Clientes', n('cliente'), 'cadastrados', '/comercial?t=cliente'],
    ['Cotações', por('solicitacao', ['Rascunho', 'Em aprovação', 'Aprovada', 'Ajuste solicitado']).length, 'compras em andamento', '/comercial?t=compras'],
    ['Orçamentos', orcAbertos.length, brl(soma(orcAbertos)), '/comercial?t=orcamentos'],
    ['Pedidos', pedidosAFaturar.length, brl(soma(pedidosAFaturar)), '/comercial?t=pedidos'],
    ['Produção', emProducao.length, 'pedidos não entregues', '/comercial?t=pedidos'],
    ['Faturamento', brl(Number(faturadoMes[0]?.v || 0)), `NFs de ${mes.split('-').reverse().join('/')}`, '/comercial?t=vendas'],
    ['Financeiro', brl(Number(aReceber[0]?.v || 0)), 'a receber', '/financeiro?tipo=receber'],
    ['Contabilidade', 'Receita', 'lançada pelo motor', '/contabilidade'],
    ['Rentabilidade', c.resumo.margemMedia == null ? '—' : `${c.resumo.margemMedia.toLocaleString('pt-BR')}%`, 'margem média', '/comercial?t=custos&aba=pedido'],
  ];
  return (
    <>
      <Cabeca titulo="Visão geral" sub="Clientes, fornecedores, compras, orçamentos, pedidos, vendas, produtos, custos e preços num só lugar, ligados ao Financeiro e à Contabilidade." />
      <Avisos msg={msg} erro={erro} />
      <Kpis itens={[
        ['Clientes e fornecedores', `${n('cliente')} · ${n('fornecedor')}`, 'clientes · fornecedores'],
        ['Orçamentos em aberto', brl(soma(orcAbertos)), `${orcAbertos.length} orçamento(s)`],
        ['Pedidos a faturar', brl(soma(pedidosAFaturar)), `${pedidosAFaturar.length} pedido(s) · ${emProducao.length} em produção`],
        ['Faturado no mês', brl(Number(faturadoMes[0]?.v || 0)), 'NFs de venda emitidas'],
        ['Margem média', c.resumo.margemMedia == null ? '—' : `${c.resumo.margemMedia.toLocaleString('pt-BR')}%`, `${c.resumo.comCusto} pedido(s) com custo`],
      ]} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Do cliente à rentabilidade</h2>
        <div className="fluxo-comercial">
          {fluxo.map(([nome, v, s, href], k) => (
            <Link key={nome} href={href} className="fluxo-etapa">
              <span className="rotulo">{k + 1}. {nome}</span>
              <b>{v}</b>
              <span className="pequeno mudo">{s}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {SECOES.map(([t, nome, desc]) => (
          <Link key={t} href={`/comercial?t=${t === 'parceiros' ? 'cliente' : t}`} className="card atalho-comercial">
            <b>{nome}</b>
            <span className="pequeno mudo">{desc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
