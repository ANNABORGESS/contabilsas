// Registro detalhado de pagamentos e planejamento (seleção de títulos, aprovação, programação,
// parcelamento, renegociação). Nada aqui movimenta conta bancária: só registra o que foi decidido ou pago.
import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { addDias, arred, brl, dataBr } from '@/domain/dinheiro';
import { conferirPagamento, FORMAS, parcelar as dividirParcelas, reagendar7, valorFinal, type Forma } from '@/domain/pagamento';
import { guardarArquivo } from './arquivos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { saldoBancario } from './banco';
import { ehAberto } from './consultas';
import { proximoCodigo } from './financeiro';

type Titulo = typeof schema.titulos.$inferSelect;
type Pagamento = { etapa?: string; agendadoPara?: string; prioritario?: boolean; conta?: string; comprovantes?: { id: string; nome: string }[]; motivo?: string; [k: string]: unknown };

const pag = (t: Titulo) => ((t.dados as { pagamento?: Pagamento })?.pagamento || {}) as Pagamento;

/** Títulos a pagar da empresa ativa; recusa qualquer id de outra empresa. */
async function titulosDaEmpresa(db: Db, emp: Empresa, ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) throw new Error('Selecione ao menos um título.');
  const ts = await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar'), inArray(schema.titulos.id, unicos)));
  if (ts.length !== unicos.length) throw new Error('Algum título não pertence a esta empresa.');
  return ts;
}

async function saldos(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const r = await db.select({ id: schema.baixas.tituloId, pago: sql<string>`sum(${schema.baixas.valor})` }).from(schema.baixas).where(and(inArray(schema.baixas.tituloId, ids), eq(schema.baixas.estornada, false))).groupBy(schema.baixas.tituloId);
  return new Map(r.map((x) => [x.id, Number(x.pago)]));
}

async function recalcular(db: Db, t: Titulo) {
  const pago = (await saldos(db, [t.id])).get(t.id) || 0;
  const status = pago >= t.valor - 0.004 ? 'Pago' : pago > 0 ? 'Parcial' : 'A pagar';
  await db.update(schema.titulos).set({ status }).where(eq(schema.titulos.id, t.id));
  return status;
}

async function gravarPag(db: Db, t: Titulo, p: Pagamento) {
  await db.update(schema.titulos).set({ dados: { ...(t.dados || {}), pagamento: p } }).where(eq(schema.titulos.id, t.id));
}

export interface DadosPagamento {
  data: string;
  valor: number;
  desconto: number;
  juros: number;
  multa: number;
  forma: string;
  conta: string;
  detalhes: Record<string, string>;
  obs: string;
  comprovante?: File | null;
}

async function anexo(db: Db, u: Usuario, f: File | null | undefined) {
  if (!f || !f.size) return null;
  if (f.size > 8 * 1024 * 1024) throw new Error('O comprovante pode ter até 8 MB.');
  if (!/pdf|image\//i.test(f.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) throw new Error('Comprovante deve ser PDF ou imagem.');
  return guardarArquivo(db, u.tenantId, f.name, f.type || 'application/octet-stream', Buffer.from(await f.arrayBuffer()));
}

/** Registra o pagamento de um título (com desconto, juros, multa, forma e comprovante). */
export async function registrarPagamento(db: Db, u: Usuario, emp: Empresa, tituloId: string, v: DadosPagamento) {
  const [t] = await titulosDaEmpresa(db, emp, [tituloId]);
  if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data)) throw new Error('Informe a data do pagamento.');
  if (!(v.forma in FORMAS)) throw new Error('Escolha a forma de pagamento.');
  const saldo = arred(t.valor - ((await saldos(db, [t.id])).get(t.id) || 0));
  const erro = conferirPagamento(saldo, v);
  if (erro) throw new Error(erro);
  const arq = await anexo(db, u, v.comprovante);
  const campos = Object.fromEntries(FORMAS[v.forma as Forma].map(([k]) => [k, (v.detalhes[k] || '').trim()]).filter(([, x]) => x));
  await db.insert(schema.baixas).values({
    tenantId: u.tenantId, tituloId: t.id, data: v.data, valor: arred(v.valor), desconto: arred(v.desconto), juros: arred(v.juros), multa: arred(v.multa),
    forma: v.forma, conta: v.conta.trim() || pag(t).conta || null, obs: v.obs.trim() || null, dados: campos, arquivoId: arq?.id || null,
  });
  const status = await recalcular(db, t);
  const final = valorFinal(v);
  await auditar(db, u, {
    empresaId: emp.id, acao: 'Registrou pagamento', entidade: `${t.codigo} · ${t.nome}`, antes: `${t.status} · saldo ${brl(saldo)}`,
    depois: `${status} · ${v.forma} ${brl(final)} em ${dataBr(v.data)}${v.juros || v.multa || v.desconto ? ` (principal ${brl(v.valor)}, desconto ${brl(v.desconto)}, juros ${brl(v.juros)}, multa ${brl(v.multa)})` : ''}${arq ? ' · com comprovante' : ''}`,
  });
  return { codigo: t.codigo, final };
}

/** Vários títulos de uma vez: cada um quitado pelo saldo, mesma data, forma e conta. */
export async function registrarPagamentosLote(db: Db, u: Usuario, emp: Empresa, ids: string[], v: Omit<DadosPagamento, 'valor' | 'desconto' | 'juros' | 'multa'>) {
  const ts = await titulosDaEmpresa(db, emp, ids);
  const s = await saldos(db, ts.map((t) => t.id));
  let total = 0;
  for (const t of ts) {
    if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
    const saldo = arred(t.valor - (s.get(t.id) || 0));
    await registrarPagamento(db, u, emp, t.id, { ...v, valor: saldo, desconto: 0, juros: 0, multa: 0, comprovante: total ? null : v.comprovante });
    total += saldo;
  }
  return { n: ts.length, total: arred(total) };
}

// ---------------------------------------------------------------- ações do planejamento

export async function rejeitar(db: Db, u: Usuario, emp: Empresa, ids: string[], motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo da rejeição.');
  const ts = await titulosDaEmpresa(db, emp, ids);
  for (const t of ts) {
    await gravarPag(db, t, { ...pag(t), etapa: 'Rejeitado', motivo, agendadoPara: undefined });
    await auditar(db, u, { empresaId: emp.id, acao: 'Rejeitou pagamento', entidade: t.codigo, antes: pag(t).etapa || 'Título preparado', depois: 'Rejeitado', justificativa: motivo });
  }
  return ts.length;
}

export async function reagendarMais7(db: Db, u: Usuario, emp: Empresa, ids: string[], hoje: string) {
  const ts = await titulosDaEmpresa(db, emp, ids);
  for (const t of ts) {
    const p = pag(t);
    const nova = reagendar7(p.agendadoPara, t.venc, hoje);
    await gravarPag(db, t, { ...p, agendadoPara: nova });
    await auditar(db, u, { empresaId: emp.id, acao: 'Reagendou pagamento (+7 dias)', entidade: t.codigo, antes: p.agendadoPara ? dataBr(p.agendadoPara) : 'sem data', depois: dataBr(nova) });
  }
  return ts.length;
}

export async function marcarPrioritario(db: Db, u: Usuario, emp: Empresa, ids: string[]) {
  const ts = await titulosDaEmpresa(db, emp, ids);
  const marcar = ts.some((t) => !pag(t).prioritario);
  for (const t of ts) {
    await gravarPag(db, t, { ...pag(t), prioritario: marcar });
    await auditar(db, u, { empresaId: emp.id, acao: marcar ? 'Marcou pagamento como prioritário' : 'Tirou prioridade do pagamento', entidade: t.codigo });
  }
  return { n: ts.length, marcar };
}

export async function trocarConta(db: Db, u: Usuario, emp: Empresa, ids: string[], conta: string) {
  if (!conta.trim()) throw new Error('Informe a conta de origem.');
  const ts = await titulosDaEmpresa(db, emp, ids);
  for (const t of ts) {
    await gravarPag(db, t, { ...pag(t), conta: conta.trim() });
    await auditar(db, u, { empresaId: emp.id, acao: 'Trocou conta de pagamento', entidade: t.codigo, antes: pag(t).conta || '—', depois: conta.trim() });
  }
  return ts.length;
}

export async function anexarComprovante(db: Db, u: Usuario, emp: Empresa, ids: string[], f: File | null) {
  const ts = await titulosDaEmpresa(db, emp, ids);
  const a = await anexo(db, u, f);
  if (!a) throw new Error('Escolha o arquivo do comprovante.');
  for (const t of ts) {
    const p = pag(t);
    await gravarPag(db, t, { ...p, comprovantes: [...(p.comprovantes || []), { id: a.id, nome: f!.name }] });
    await auditar(db, u, { empresaId: emp.id, acao: 'Anexou comprovante', entidade: t.codigo, depois: f!.name });
  }
  return ts.length;
}

/** Renegociação: novo vencimento e/ou novo valor, com motivo (fica no histórico). */
export async function renegociar(db: Db, u: Usuario, emp: Empresa, ids: string[], venc: string, valor: number | null, motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo da renegociação.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) throw new Error('Informe o novo vencimento.');
  const ts = await titulosDaEmpresa(db, emp, ids);
  if (valor != null && ts.length > 1) throw new Error('Novo valor só pode ser informado para um título por vez.');
  for (const t of ts) {
    if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
    const novoValor = valor != null && valor > 0 ? arred(valor) : t.valor;
    await db.update(schema.titulos).set({ venc, valor: novoValor, vencEstimado: false, obs: [t.obs, `Renegociado em ${dataBr(new Date().toISOString())}: ${motivo}`].filter(Boolean).join(' · '), dados: { ...(t.dados || {}), pagamento: { ...pag(t), etapa: undefined, agendadoPara: undefined } } }).where(eq(schema.titulos.id, t.id));
    await recalcular(db, { ...t, valor: novoValor });
    await auditar(db, u, { empresaId: emp.id, acao: 'Renegociou título', entidade: `${t.codigo} · ${t.nome}`, antes: `${dataBr(t.venc)} · ${brl(t.valor)}`, depois: `${dataBr(venc)} · ${brl(novoValor)}`, justificativa: motivo });
  }
  return ts.length;
}

/** Parcela o saldo de um título: o original fica com a 1ª parcela e as demais viram títulos novos. */
export async function parcelarTitulo(db: Db, u: Usuario, emp: Empresa, id: string, n: number, primeiroVenc: string) {
  const [t] = await titulosDaEmpresa(db, emp, [id]);
  if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
  const pago = (await saldos(db, [t.id])).get(t.id) || 0;
  const saldo = arred(t.valor - pago);
  const ps = dividirParcelas(saldo, n, primeiroVenc);
  // o título original passa a valer o que já foi pago + a 1ª parcela
  await db.update(schema.titulos).set({ valor: arred(pago + ps[0].valor), venc: ps[0].venc, parcela: `1/${n}`, obs: [t.obs, `Parcelado em ${n}x`].filter(Boolean).join(' · ') }).where(eq(schema.titulos.id, t.id));
  const codigos: string[] = [];
  for (const p of ps.slice(1)) {
    const codigo = await proximoCodigo(db, emp.id, 'pagar');
    const { id: _id, codigo: _c, criadoEm: _cr, legadoId: _l, ...resto } = t;
    await db.insert(schema.titulos).values({ ...resto, codigo, valor: p.valor, venc: p.venc, parcela: p.parcela, status: 'A pagar', nfChave: null, documentoId: null, valorFiscal: null, obs: `Parcela de ${t.codigo}`, dados: { ...(t.dados || {}), pagamento: {} } });
    codigos.push(codigo);
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Parcelou título', entidade: `${t.codigo} · ${t.nome}`, antes: `saldo ${brl(saldo)} · vence ${dataBr(t.venc)}`, depois: `${n}x de ~${brl(ps[0].valor)} a partir de ${dataBr(ps[0].venc)} (${[t.codigo, ...codigos].join(', ')})` });
  return [t.codigo, ...codigos];
}

/** Números da simulação de caixa do painel "Planejar pagamento". */
export async function dadosPlanejamento(db: Db, u: Usuario, emp: Empresa, hoje: string) {
  const ate = addDias(hoje, 29);
  const [banco, abertos, pagos, minimo, contasExtrato] = await Promise.all([
    saldoBancario(db, u.tenantId, emp.id),
    db.select({ id: schema.titulos.id, tipo: schema.titulos.tipo, venc: schema.titulos.venc, valor: schema.titulos.valor, status: schema.titulos.status, retorno: schema.titulos.retorno, dados: schema.titulos.dados }).from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db.select({ id: schema.baixas.tituloId, pago: sql<string>`sum(${schema.baixas.valor})` }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.baixas.estornada, false))).groupBy(schema.baixas.tituloId),
    db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, u.tenantId), eq(schema.configuracoes.chave, `caixaMinimo:${emp.id}`))),
    db.selectDistinct({ conta: schema.extratoMovimentos.conta }).from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id)),
  ]);
  const p = new Map(pagos.map((x) => [x.id, Number(x.pago)]));
  const no30 = (tipo: string) => arred(abertos.filter((t) => t.tipo === tipo && ehAberto(t) && t.venc && t.venc <= ate && (tipo === 'pagar' || t.venc >= hoje)).reduce((a, t) => a + Math.max(0, t.valor - (p.get(t.id) || 0)), 0));
  const contasUsadas = abertos.map((t) => (t.dados as { pagamento?: Pagamento })?.pagamento?.conta).filter(Boolean) as string[];
  return {
    saldoAtual: banco?.atual ?? null,
    recebimentos30: no30('receber'),
    pagamentos30: no30('pagar'),
    caixaMinimo: Number(minimo[0]?.valor || 0),
    contas: [...new Set([...contasExtrato.map((c) => c.conta), ...contasUsadas])].sort(),
  };
}
