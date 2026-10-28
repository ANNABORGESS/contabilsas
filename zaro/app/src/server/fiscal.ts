// Estimativa do Lucro Presumido por trimestre (usada na tela Fiscal e no Dashboard).
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { acrescimosLC224, tributosPresumido } from '@/domain/presumido';
import { dataDaCompetencia, regimeEm } from '@/domain/regime';
import { arred } from '@/domain/dinheiro';
import type { TributoApurado } from '@/domain/motor';
import type { Empresa } from './auth';

export async function trimestresPresumido(db: Db, emp: Empresa, ano: string) {
  const receitas = await db
    .select({ comp: schema.titulos.competencia, cat: schema.titulos.categoria, valor: schema.titulos.valor, valorFiscal: schema.titulos.valorFiscal, impostos: schema.titulos.impostos, retencoes: schema.titulos.retencoes })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), eq(schema.titulos.retorno, false), sql`${schema.titulos.status} not ilike '%cancel%'`, sql`${schema.titulos.competencia} like ${ano + '-%'}`));
  return [0, 1, 2, 3].map((t) => {
    const meses = [1, 2, 3].map((m) => `${ano}-${String(t * 3 + m).padStart(2, '0')}`);
    const regs = [...new Set(meses.map((c) => regimeEm(emp, dataDaCompetencia(c)) || '—'))];
    const r = receitas.filter((x) => x.comp && meses.includes(x.comp));
    // valor fiscal da NF vai só na 1ª parcela; título sem NF usa o próprio valor
    const bruto = (x: (typeof r)[number]) => (x.valorFiscal != null ? x.valorFiscal : x.valor);
    const soma = (lista: { nome: string; valor: number }[], re: RegExp) => lista.filter((i) => re.test(i.nome)).reduce((a, i) => a + Number(i.valor || 0), 0);
    const servicos = r.filter((x) => /servi/i.test(x.cat || '')).reduce((a, x) => a + bruto(x), 0);
    const produtos = r.reduce((a, x) => a + bruto(x), 0) - servicos;
    const icms = r.reduce((a, x) => a + soma(x.impostos, /^icms/i), 0);
    const irrfRetido = r.reduce((a, x) => a + soma(x.retencoes, /irrf/i), 0);
    return { n: t + 1, regs, presumido: regs.every((x) => /presumido/i.test(x)), produtos, servicos, icms, irrfRetido };
  }).map((t, _, todos) => {
    // LC 224/2025: o acréscimo de presunção depende do ano inteiro (sobra de limite e ajuste do 4º trimestre)
    const lc = acrescimosLC224(Number(ano), todos)[t.n - 1];
    return { ...t, lc, est: tributosPresumido({ produtos: t.produtos, servicos: t.servicos, icms: t.icms, irrfRetido: t.irrfRetido, acrescimoIrpj: lc.irpj, acrescimoCsll: lc.csll }) };
  });
}

/** Base mensal de PIS/COFINS (receita bruta sem o ICMS destacado), com os mesmos filtros da estimativa trimestral. */
async function basesMensais(db: Db, emp: Empresa, ano: string) {
  const receitas = await db
    .select({ comp: schema.titulos.competencia, valor: schema.titulos.valor, valorFiscal: schema.titulos.valorFiscal, impostos: schema.titulos.impostos })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), eq(schema.titulos.retorno, false), sql`${schema.titulos.status} not ilike '%cancel%'`, sql`${schema.titulos.competencia} like ${ano + '-%'}`));
  const m = new Map<string, number>();
  for (const x of receitas) {
    if (!x.comp) continue;
    const icms = (x.impostos || []).filter((i) => /^icms/i.test(i.nome)).reduce((a, i) => a + Number(i.valor || 0), 0);
    m.set(x.comp, (m.get(x.comp) || 0) + (x.valorFiscal != null ? x.valorFiscal : x.valor) - icms);
  }
  return m;
}

/** PIS e COFINS de cada mês e IRPJ, adicional e CSLL de cada trimestre encerrado do Lucro Presumido, para a contabilidade. */
export async function tributosParaContabilidade(db: Db, emp: Empresa, hoje = new Date().toISOString().slice(0, 10)): Promise<TributoApurado[]> {
  const mesAtual = hoje.slice(0, 7);
  const anos = [...new Set((emp.regimeHist || []).filter((h) => /presumido/i.test(h.regime)).map((h) => Number(String(h.de || hoje).slice(0, 4))))];
  if (!anos.length && /presumido/i.test(emp.regime || '')) anos.push(Number(hoje.slice(0, 4)));
  const out: TributoApurado[] = [];
  for (let ano = Math.min(...anos); anos.length && ano <= Number(hoje.slice(0, 4)); ano++) {
    const bases = await basesMensais(db, emp, String(ano));
    for (const [comp, base] of [...bases].sort()) {
      if (comp > mesAtual || !/presumido/i.test(regimeEm(emp, dataDaCompetencia(comp))) || !(base > 0)) continue;
      const periodo = comp.split('-').reverse().join('/');
      out.push({ tributo: 'PIS', comp, periodo, base: arred(base), valor: arred(base * 0.0065) }, { tributo: 'COFINS', comp, periodo, base: arred(base), valor: arred(base * 0.03) });
    }
    for (const t of await trimestresPresumido(db, emp, String(ano))) {
      const comp = `${ano}-${String(t.n * 3).padStart(2, '0')}`;
      if (!t.presumido || comp >= mesAtual) continue; // só trimestre encerrado
      const periodo = `${t.n}º trimestre/${ano}`;
      const adicional = arred(Math.max(0, t.est.baseIrpj - 60000) * 0.1);
      const irpj = arred(Math.max(0, t.est.irpj - adicional));
      if (irpj > 0) out.push({ tributo: 'IRPJ', comp, periodo, base: t.est.baseIrpj, valor: irpj });
      if (adicional > 0) out.push({ tributo: 'Adicional de IRPJ', comp, periodo, base: t.est.baseIrpj, valor: adicional });
      if (t.est.csll > 0) out.push({ tributo: 'CSLL', comp, periodo, base: t.est.baseCsll, valor: t.est.csll });
    }
  }
  return out;
}
