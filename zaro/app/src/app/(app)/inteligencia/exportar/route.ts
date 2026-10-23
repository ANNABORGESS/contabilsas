// Exporta a comparação orçado x realizado (CSV com ; para abrir no Excel em português).
import { getDb } from '@/db';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { dadosOrcamento } from '@/server/inteligencia';

export async function GET(req: Request) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const p = new URL(req.url).searchParams;
  const ano = Number(p.get('ano')) || new Date().getFullYear();
  const ate = Math.min(12, Math.max(1, Number(p.get('ate')) || 12));
  const nat = p.get('nat') === 'receita' ? 'receita' : 'despesa';
  const d = await dadosOrcamento(await getDb(), u, emp, ano, p.get('v') || undefined, undefined, ate, nat);
  const n = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','));
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const linhas = [
    ['Centro de custo', 'Orçado', 'Realizado', 'Desvio R$', 'Desvio %', 'Consumo %', 'Status', `Realizado ${ano - 1}`].join(';'),
    ...d.tabela.map((t) => [esc(t.area), n(t.orcado), n(t.realizado), n(t.desvio), n(t.desvioPct), n(t.consumo), t.status, n(t.anoAnterior)].join(';')),
    ['Total', n(d.total.orcado), n(d.total.realizado), n(d.total.desvio), n(d.total.desvioPct), '', '', ''].join(';'),
  ];
  return new Response('﻿' + linhas.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="orcamento-${ano}-${nat}.csv"` },
  });
}
