// Impostos a recuperar da empresa: relê as NF de compra lançadas, calcula o crédito item a item e
// apura o ICMS do mês (débito das vendas × crédito das compras). Usado pela Contabilidade e pelo Fiscal.
import 'server-only';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { apuracaoIcms, creditosDaNota, type ConfigCreditos, type Decisao } from '@/domain/creditos';
import type { CreditoMotor } from '@/domain/motor';
import { arred } from '@/domain/dinheiro';
import { lerXmlFiscal, type NotaFiscal } from '@/domain/nfe';
import { ehSimples } from '@/domain/regime';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

const chave = (empresaId: string) => `creditos:${empresaId}`;

export async function configCreditos(db: Db, tenantId: string, empresaId: string): Promise<ConfigCreditos> {
  const [r] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave(empresaId))));
  return (r?.valor as ConfigCreditos) || {};
}

async function gravarConfig(db: Db, tenantId: string, empresaId: string, valor: ConfigCreditos) {
  await db.insert(schema.configuracoes).values({ tenantId, chave: chave(empresaId), valor: valor as Record<string, unknown> })
    .onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor: valor as Record<string, unknown>, atualizadoEm: new Date() } });
}

export async function definirContribuinteIpi(db: Db, u: Usuario, emp: Empresa, sim: boolean) {
  const cfg = await configCreditos(db, u.tenantId, emp.id);
  await gravarConfig(db, u.tenantId, emp.id, { ...cfg, contribuinteIpi: sim });
  await auditar(db, u, { empresaId: emp.id, acao: 'Alterou crédito de IPI', entidade: 'Impostos a recuperar', depois: sim ? 'Contribuinte do IPI: credita' : 'Não contribuinte: IPI é custo' });
}

/** Decisão do contador sobre um item ("<doc>|<n>") ou sobre todos de um NCM ("ncm:<ncm>"); null volta ao automático. */
export async function decidirCredito(db: Db, u: Usuario, emp: Empresa, chaves: string[], decisao: Decisao | null) {
  const cfg = await configCreditos(db, u.tenantId, emp.id);
  const decisoes = { ...(cfg.decisoes || {}) };
  for (const k of chaves) {
    if (decisao) decisoes[k] = decisao;
    else delete decisoes[k];
  }
  await gravarConfig(db, u.tenantId, emp.id, { ...cfg, decisoes });
  await auditar(db, u, { empresaId: emp.id, acao: 'Decidiu crédito de imposto', entidade: chaves.slice(0, 5).join(', '), depois: decisao === 'credita' ? 'Credita' : decisao === 'nao' ? 'Não credita' : 'Automático' });
}

const temTributoPorItem = (n: NotaFiscal) => n.itens.some((i) => 'cst' in i || 'icms' in i);

/** Notas de compra já lançadas (com título), com os tributos por item. As notas lidas antes desta versão
 *  são relidas do XML guardado uma vez, e o resultado fica gravado. */
async function notasDeCompra(db: Db, emp: Empresa) {
  const tits = await db.select({ codigo: schema.titulos.codigo, documentoId: schema.titulos.documentoId, nome: schema.titulos.nome, nf: schema.titulos.nf, competencia: schema.titulos.competencia, emissao: schema.titulos.nfEmissao, status: schema.titulos.status, retorno: schema.titulos.retorno })
    .from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar'), isNotNull(schema.titulos.documentoId)));
  const porDoc = new Map<string, (typeof tits)[number]>();
  for (const t of tits.sort((a, b) => a.codigo.localeCompare(b.codigo))) if (t.documentoId && !porDoc.has(t.documentoId)) porDoc.set(t.documentoId, t);
  const ids = [...porDoc.keys()];
  if (!ids.length) return [];
  const docs = await db.select({ id: schema.documentosEntrada.id, dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada).where(inArray(schema.documentosEntrada.id, ids));
  const out: { docId: string; titulo: (typeof tits)[number]; nota: NotaFiscal }[] = [];
  const reler = docs.filter((d) => { const n = (d.dados as { nota?: NotaFiscal }).nota; return n?.tipo === 'NF-e' && !temTributoPorItem(n); }).map((d) => d.id);
  const relidas = new Map<string, NotaFiscal>();
  for (let i = 0; i < reler.length; i += 50) {
    const xs = await db.select({ id: schema.documentosEntrada.id, xml: schema.documentosEntrada.xml, dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada).where(inArray(schema.documentosEntrada.id, reler.slice(i, i + 50)));
    for (const x of xs) {
      if (!x.xml) continue;
      try {
        const n = lerXmlFiscal(x.xml);
        if (n.tipo !== 'NF-e') continue;
        relidas.set(x.id, n);
        await db.update(schema.documentosEntrada).set({ dados: { ...(x.dados as Record<string, unknown>), nota: n } }).where(eq(schema.documentosEntrada.id, x.id));
      } catch { /* XML ilegível: fica sem crédito automático */ }
    }
  }
  for (const d of docs) {
    const nota = relidas.get(d.id) || (d.dados as { nota?: NotaFiscal }).nota;
    const titulo = porDoc.get(d.id)!;
    if (!nota || nota.tipo !== 'NF-e' || titulo.retorno || /cancel/i.test(titulo.status)) continue;
    out.push({ docId: d.id, titulo, nota });
  }
  return out;
}

export async function creditosDaEmpresa(db: Db, emp: Empresa) {
  const [config, notas, vendas] = await Promise.all([
    configCreditos(db, emp.tenantId, emp.id),
    notasDeCompra(db, emp),
    db.select({ competencia: schema.titulos.competencia, emissao: schema.titulos.nfEmissao, venc: schema.titulos.venc, impostos: schema.titulos.impostos, status: schema.titulos.status, retorno: schema.titulos.retorno })
      .from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), eq(schema.titulos.origem, 'nf'))),
  ]);
  const compDe = (c?: string | null, d?: string | null) => (c || String(d || '').slice(0, 7));
  const porNota = notas.map(({ docId, titulo, nota }) => {
    const data = nota.dados.emissao || titulo.emissao || `${compDe(titulo.competencia)}-01`;
    const comp = compDe(titulo.competencia, data);
    const simples = ehSimples(emp, data);
    const c = creditosDaNota(docId, nota.itens, { simples, config });
    return { docId, tituloId: titulo.codigo, nf: titulo.nf || nota.dados.numero, fornecedor: titulo.nome || nota.dados.emitNome, data, comp, simples, ...c };
  });

  // débito do ICMS: NF de saída do período fora do Simples (no Simples o ICMS vai no DAS)
  const debitos: Record<string, number> = {};
  for (const v of vendas) {
    if (v.retorno || /cancel/i.test(v.status)) continue;
    const comp = compDe(v.competencia, v.emissao || v.venc);
    if (!comp || ehSimples(emp, `${comp}-15`)) continue;
    const icms = (v.impostos || []).filter((x) => /^icms$/i.test(x.nome.trim())).reduce((a, x) => a + Number(x.valor || 0), 0);
    if (icms > 0) debitos[comp] = arred((debitos[comp] || 0) + icms);
  }
  const creditos: Record<string, number> = {};
  for (const n of porNota) if (n.icms > 0) creditos[n.comp] = arred((creditos[n.comp] || 0) + n.icms);
  const apuracao = apuracaoIcms(debitos, creditos);

  const paraMotor: CreditoMotor[] = porNota.filter((n) => n.icms + n.ipi > 0).map((n) => ({ id: n.docId, tituloId: n.tituloId, doc: `NF ${n.nf}`, nome: n.fornecedor, data: n.data, comp: n.comp, icms: n.icms, ipi: n.ipi }));
  return {
    config, notas: porNota, apuracao, paraMotor,
    compensacoes: apuracao.filter((m) => m.compensado > 0).map((m) => ({ comp: m.comp, valor: m.compensado })),
  };
}
