// Split Payment: operações a partir dos recebimentos do Contas a Receber, retorno dos provedores de pagamento
// (arquivo importado), conciliação com o extrato e confirmação com evidência. Nenhum valor de segregação é
// inventado: sem retorno do PSP ou comprovante, a segregação fica "não informada".
import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { addDias, arred, brl, dataBr } from '@/domain/dinheiro';
import { analisarOperacoes, type EventoSplit, PENDENCIAS, lerRetornoPsp, type OperacaoSplit, projecaoSplit, resumoSplit, type StatusSegregacao, VERSAO_REGRAS } from '@/domain/split-payment';
import { guardarArquivo } from './arquivos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

type Linha = typeof schema.splitOperacoes.$inferSelect;
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** IBS e CBS destacados na NF do título (XML lido pelo Autopilot ou dados importados). */
function destaques(t: typeof schema.titulos.$inferSelect) {
  const lista = [...(t.impostos || []), ...(((t.dados as { impostosNF?: { nome: string; valor: number }[] }).impostosNF) || [])];
  const de = (n: string) => { const x = lista.find((i) => i.nome.toUpperCase() === n); return x ? Number(x.valor) : null; };
  return { ibs: de('IBS'), cbs: de('CBS') };
}

export const paraOperacao = (l: Linha): OperacaoSplit => ({
  id: l.id, evento: l.evento as EventoSplit, data: l.data, competencia: l.competencia, nf: l.nf, tituloId: l.tituloId, valorDocumento: l.valorDocumento, valorBruto: l.valorBruto,
  ibsDestacado: l.ibsDestacado, cbsDestacado: l.cbsDestacado, ibsSegregado: l.ibsSegregado, cbsSegregado: l.cbsSegregado, taxaPsp: l.taxaPsp, valorLiquido: l.valorLiquido,
  psp: l.psp, idTransacao: l.idTransacao, status: l.status as StatusSegregacao, extratoId: l.extratoId,
});

/** Cria (uma vez só) uma operação para cada recebimento registrado; estorno da baixa vira evento de estorno. */
export async function sincronizarRecebimentos(db: Db, u: Usuario, emp: Empresa) {
  const [tits, bxs, ops] = await Promise.all([
    db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'))),
    db.select().from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'))),
    db.select({ chave: schema.splitOperacoes.chave, id: schema.splitOperacoes.id, evento: schema.splitOperacoes.evento }).from(schema.splitOperacoes).where(eq(schema.splitOperacoes.empresaId, emp.id)),
  ]);
  const porTit = new Map(tits.map((t) => [t.id, t]));
  const existentes = new Map(ops.map((o) => [o.chave, o]));
  let novas = 0;
  let estornos = 0;
  for (const { baixas: b } of bxs) {
    const t = porTit.get(b.tituloId);
    if (!t) continue;
    const chave = `baixa:${b.id}`;
    const ja = existentes.get(chave);
    if (ja) {
      if (b.estornada && ja.evento !== 'estorno') { await db.update(schema.splitOperacoes).set({ evento: 'estorno' }).where(eq(schema.splitOperacoes.id, ja.id)); estornos++; }
      continue;
    }
    if (b.estornada) continue;
    // valor do documento = o que o cliente deve pagar (já sem ISS/IRRF/CSRF retidos na fonte); o bruto fiscal fica em dados
    const doc = t.valor;
    const d = destaques(t);
    await db.insert(schema.splitOperacoes).values({
      tenantId: u.tenantId, empresaId: emp.id, chave, origem: 'recebimento', evento: b.valor + 0.01 < t.valor ? 'parcial' : 'pagamento', data: b.data, competencia: b.data.slice(0, 7),
      tituloId: t.id, baixaId: b.id, nf: t.nf, nfChave: t.nfChave, valorDocumento: doc, valorBruto: b.valor, ibsDestacado: d.ibs, cbsDestacado: d.cbs,
      regraVersao: VERSAO_REGRAS, dados: { titulo: t.codigo, cliente: t.nome, forma: b.forma || null, valorFiscal: t.valorFiscal ?? t.valor },
    }).onConflictDoNothing();
    novas++;
  }
  if (novas || estornos) await auditar(db, u, { empresaId: emp.id, acao: 'Atualizou operações do Split Payment', depois: `${novas} recebimento(s) novo(s), ${estornos} estorno(s)` });
  return `${novas} recebimento(s) trazido(s) do Contas a Receber${estornos ? `, ${estornos} estorno(s)` : ''}. A segregação só aparece quando o retorno do provedor for importado.`;
}

/** Importa o retorno do provedor de pagamento (CSV): liga cada transação ao recebimento da mesma NF e valor. */
export async function importarRetornoPsp(db: Db, u: Usuario, emp: Empresa, psp: string, arquivo: { nome: string; conteudo: Buffer }) {
  const nomePsp = psp.trim();
  if (!nomePsp) throw new Error('Informe o nome do provedor de pagamento (PSP).');
  const linhas = lerRetornoPsp(arquivo.conteudo.toString('utf8'));
  const arq = await guardarArquivo(db, u.tenantId, arquivo.nome, 'text/csv', arquivo.conteudo);
  const ops = await db.select().from(schema.splitOperacoes).where(eq(schema.splitOperacoes.empresaId, emp.id));
  const usados = new Set(ops.filter((o) => o.psp && o.idTransacao).map((o) => `${o.psp}|${o.idTransacao}`));
  let ligadas = 0, novas = 0, repetidas = 0;
  for (const l of linhas) {
    if (usados.has(`${nomePsp}|${l.idTransacao}`)) { repetidas++; continue; }
    usados.add(`${nomePsp}|${l.idTransacao}`);
    const seg = { psp: nomePsp, idTransacao: l.idTransacao, ibsSegregado: l.ibs, cbsSegregado: l.cbs, taxaPsp: l.taxa, valorLiquido: l.liquido, status: l.ibs != null || l.cbs != null ? 'informado_psp' : 'nao_informado' };
    const alvo = l.evento === 'pagamento' || l.evento === 'parcial' || l.evento === 'antecipacao'
      ? ops.find((o) => o.origem === 'recebimento' && !o.idTransacao && ((l.chave && o.nfChave === l.chave) || (l.nf && o.nf === l.nf)) && Math.abs(o.valorBruto - l.valorBruto) <= 0.01 && diasEntre(o.data, l.data) <= 5)
      : undefined;
    if (alvo) {
      await db.update(schema.splitOperacoes).set({ ...seg, ...(l.evento === 'antecipacao' ? { evento: 'antecipacao' } : {}), dados: { ...alvo.dados, retornoArquivo: arq.id, retornoLinha: l.linha } }).where(eq(schema.splitOperacoes.id, alvo.id));
      alvo.idTransacao = l.idTransacao;
      ligadas++;
    } else {
      const doc = ops.find((o) => o.tituloId && ((l.chave && o.nfChave === l.chave) || (l.nf && o.nf === l.nf)));
      await db.insert(schema.splitOperacoes).values({
        tenantId: u.tenantId, empresaId: emp.id, chave: `psp:${nomePsp}:${l.idTransacao}`, origem: 'psp', evento: l.evento, data: l.data, competencia: l.data.slice(0, 7),
        tituloId: doc?.tituloId || null, nf: l.nf || doc?.nf || null, nfChave: l.chave || doc?.nfChave || null, valorDocumento: doc?.valorDocumento ?? null, valorBruto: l.valorBruto,
        ibsDestacado: doc?.ibsDestacado ?? null, cbsDestacado: doc?.cbsDestacado ?? null, ...seg, regraVersao: VERSAO_REGRAS, dados: { retornoArquivo: arq.id, retornoLinha: l.linha, cliente: (doc?.dados as { cliente?: string })?.cliente },
      }).onConflictDoNothing();
      novas++;
    }
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Importou retorno do provedor de pagamento (split)', entidade: `${nomePsp} · ${arquivo.nome}`, depois: `${ligadas} ligada(s), ${novas} nova(s), ${repetidas} repetida(s)` });
  return `Retorno de ${nomePsp}: ${ligadas} transação(ões) ligada(s) a recebimentos, ${novas} sem recebimento correspondente, ${repetidas} já importada(s) antes (ignoradas).`;
}

/** Liga o valor líquido de cada transação a uma entrada do extrato (mesmo valor, até 3 dias de diferença). */
export async function conciliarComExtrato(db: Db, u: Usuario, emp: Empresa) {
  const [ops, ext] = await Promise.all([
    db.select().from(schema.splitOperacoes).where(eq(schema.splitOperacoes.empresaId, emp.id)),
    db.select().from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id)),
  ]);
  const usados = new Set(ops.map((o) => o.extratoId).filter(Boolean));
  let n = 0;
  for (const o of ops.filter((x) => !x.extratoId && (x.valorLiquido ?? 0) > 0)) {
    const m = ext.find((e) => e.valor > 0 && !usados.has(e.id) && Math.abs(e.valor - o.valorLiquido!) <= 0.01 && diasEntre(e.data, o.data) <= 3);
    if (!m) continue;
    usados.add(m.id);
    await db.update(schema.splitOperacoes).set({ extratoId: m.id }).where(eq(schema.splitOperacoes.id, o.id));
    n++;
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Conciliou split payment com o extrato', depois: `${n} transação(ões)` });
  return n ? `${n} transação(ões) conciliada(s) com o extrato pelo valor líquido.` : 'Nenhuma transação nova bateu com o extrato (mesmo valor líquido, até 3 dias).';
}

/** Confirma a segregação com evidência (comprovante oficial ou do participante). Só então vai para a contabilidade. */
export async function confirmarSegregacao(db: Db, u: Usuario, emp: Empresa, id: string, fonte: string, arquivo: { nome: string; mime: string; conteudo: Buffer }) {
  const [o] = await db.select().from(schema.splitOperacoes).where(and(eq(schema.splitOperacoes.id, id), eq(schema.splitOperacoes.empresaId, emp.id)));
  if (!o) throw new Error('Operação não encontrada nesta empresa.');
  if (o.ibsSegregado == null && o.cbsSegregado == null) throw new Error('Sem valores de IBS/CBS segregados informados pelo provedor: não há o que confirmar.');
  if (!fonte.trim()) throw new Error('Informe a fonte da evidência (ex.: comprovante do PSP, consulta na plataforma oficial).');
  if (!arquivo.conteudo.length) throw new Error('Anexe o comprovante: sem evidência o ZARO não confirma a segregação.');
  const arq = await guardarArquivo(db, u.tenantId, arquivo.nome, arquivo.mime, arquivo.conteudo);
  await db.update(schema.splitOperacoes).set({ status: 'confirmado', dados: { ...o.dados, evidencia: { arquivoId: arq.id, fonte: fonte.trim(), por: u.nome, em: new Date().toISOString() } } }).where(eq(schema.splitOperacoes.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Confirmou segregação do split payment', entidade: `${o.nf ? `NF ${o.nf}` : o.idTransacao} · ${brl(o.valorBruto)}`, depois: `IBS ${brl(o.ibsSegregado || 0)} · CBS ${brl(o.cbsSegregado || 0)} · ${fonte.trim()}` });
  return 'Segregação confirmada com evidência; a contabilidade passa a registrar a extinção da obrigação nessa liquidação.';
}

export async function desfazerConfirmacao(db: Db, u: Usuario, emp: Empresa, id: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo.');
  const [o] = await db.select().from(schema.splitOperacoes).where(and(eq(schema.splitOperacoes.id, id), eq(schema.splitOperacoes.empresaId, emp.id)));
  if (!o || o.status !== 'confirmado') throw new Error('Operação não está confirmada.');
  await db.update(schema.splitOperacoes).set({ status: 'informado_psp' }).where(eq(schema.splitOperacoes.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Desfez confirmação do split payment', entidade: o.nf ? `NF ${o.nf}` : o.idTransacao || o.id, justificativa: motivo.trim() });
  return 'Confirmação desfeita.';
}

/** Split confirmado por baixa, para o motor contábil (só confirmado com evidência). */
export async function splitConfirmadoPorBaixa(db: Db, empresaId: string) {
  const ops = await db.select().from(schema.splitOperacoes).where(and(eq(schema.splitOperacoes.empresaId, empresaId), eq(schema.splitOperacoes.status, 'confirmado')));
  return new Map(ops.filter((o) => o.baixaId && o.evento !== 'estorno' && o.evento !== 'devolucao').map((o) => [o.baixaId!, { ibs: o.ibsSegregado || 0, cbs: o.cbsSegregado || 0, taxa: o.taxaPsp || 0 }]));
}

export async function dadosSplit(db: Db, emp: Empresa, hoje: string, comp?: string) {
  const [linhas, tits, bxs] = await Promise.all([
    db.select().from(schema.splitOperacoes).where(eq(schema.splitOperacoes.empresaId, emp.id)).orderBy(desc(schema.splitOperacoes.data)),
    db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'))),
    db.select({ tituloId: schema.baixas.tituloId, valor: schema.baixas.valor, estornada: schema.baixas.estornada }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(eq(schema.titulos.empresaId, emp.id)),
  ]);
  const filtradas = comp ? linhas.filter((l) => l.competencia === comp) : linhas;
  const ops = analisarOperacoes(filtradas.map(paraOperacao));
  const meta = new Map(filtradas.map((l) => [l.id, l]));
  const pago = new Map<string, number>();
  for (const b of bxs) if (!b.estornada) pago.set(b.tituloId, (pago.get(b.tituloId) || 0) + b.valor);
  const abertos = tits.filter((t) => t.venc && !t.retorno && !/cancel|recebid|retorno/i.test(t.status)).map((t) => {
    const d = destaques(t);
    return { venc: t.venc!, saldo: arred(Math.max(0, t.valor - (pago.get(t.id) || 0))), valorDocumento: t.valor, ibsDestacado: d.ibs, cbsDestacado: d.cbs };
  });
  return {
    ops: ops.map((o) => ({ ...o, origem: meta.get(o.id)!.origem, cliente: String((meta.get(o.id)!.dados as { cliente?: string }).cliente || ''), titulo: String((meta.get(o.id)!.dados as { titulo?: string }).titulo || ''), evidencia: (meta.get(o.id)!.dados as { evidencia?: { arquivoId: string; fonte: string; por: string; em: string } }).evidencia, retornoArquivo: (meta.get(o.id)!.dados as { retornoArquivo?: string }).retornoArquivo, regraVersao: meta.get(o.id)!.regraVersao })),
    resumo: resumoSplit(filtradas.map(paraOperacao)),
    projecao: projecaoSplit(abertos, hoje),
    competencias: [...new Set(linhas.map((l) => l.competencia))].sort().reverse(),
    recebimentosSemOperacao: bxs.filter((b) => !b.estornada).length - linhas.filter((l) => l.origem === 'recebimento').length,
    horizonte: addDias(hoje, 90),
  };
}

export async function contextoSplit(db: Db, emp: Empresa, hoje: string) {
  const d = await dadosSplit(db, emp, hoje);
  const r = d.resumo;
  const div = d.ops.filter((o) => o.divergencias.some((x) => !PENDENCIAS.includes(x)));
  return [
    `Split Payment de ${emp.razao} (todas as competências; regras ${VERSAO_REGRAS}). Situação: o split ainda NÃO está habilitado para as empresas em geral (implantação gradual da LC 214/2025; testes técnicos dos PSPs desde 15/10/2026). Link: /fiscal/reforma`,
    `Operações: ${r.transacoes}; bruto ${brl(r.bruto)}; líquido informado ${brl(r.liquido)} (${r.semLiquido} sem líquido informado).`,
    `Segregação CONFIRMADA com evidência: IBS ${brl(r.ibsConfirmado)}, CBS ${brl(r.cbsConfirmado)}. Informada pelo PSP, sem confirmação: IBS ${brl(r.ibsInformadoPsp)}, CBS ${brl(r.cbsInformadoPsp)}. ESTIMADA pelos destaques das NFs (não é segregação): IBS ${brl(r.ibsDestacadoEstimado)}, CBS ${brl(r.cbsDestacadoEstimado)}.`,
    `Aguardando confirmação: ${r.aguardandoConfirmacao}. Com divergência: ${r.divergencias}. Por tipo: ${Object.entries(r.porDivergencia).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhuma'}.`,
    `Divergências (até 10): ${div.slice(0, 10).map((o) => `${dataBr(o.data)} ${o.nf ? `NF ${o.nf}` : o.idTransacao} ${brl(o.valorBruto)} [${o.divergencias.join(', ')}]`).join('; ') || 'nenhuma'}.`,
    `Projeção dos recebimentos (estimada pelos destaques das NFs; segregação real depende do PSP): ${d.projecao.map((p) => `${p.dias} dias: bruto ${brl(p.bruto)}, segregação estimada ${brl(p.segregacao)}, líquido ${brl(p.liquido)}, sem destaque ${brl(p.semDestaque)}`).join('; ')}.`,
  ].join('\n');
}
