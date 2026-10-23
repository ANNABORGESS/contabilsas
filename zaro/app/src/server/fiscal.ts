// Estimativa do Lucro Presumido por trimestre (usada na tela Fiscal e no Dashboard).
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { acrescimosLC224, tributosPresumido } from '@/domain/presumido';
import { dataDaCompetencia, regimeEm } from '@/domain/regime';
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
