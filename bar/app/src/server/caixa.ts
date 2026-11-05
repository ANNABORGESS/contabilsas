// Fechamento de caixa do turno: soma o que o sistema registrou em cada forma (já sem cancelados e
// itens cancelados), compara com o dinheiro contado e com o relatório da maquininha e guarda.
import { tem } from '@/domain/papeis';
import { ordemLocal } from '@/domain/mesas';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { NOME_TIPO_CAIXA, TIPOS_CAIXA, conferirCaixa, fundoDoCaixa, somarPorForma, type TipoCaixa } from '@/domain/pagamento';
import { FORMAS_PAGAMENTO, NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import { dataValida } from '@/domain/turno';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';
import { listarPedidos } from './pedidos';

const centavos = (v: unknown) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000_00) throw new ErroRegra('Valor inválido no fechamento.');
  return n;
};

/** O que o sistema registrou no turno, por forma, e o fechamento já feito (se houver). */
export async function resumoCaixa(db: Db, data: string) {
  if (!dataValida(data)) throw new ErroRegra('Data inválida.');
  const pedidos = await listarPedidos(db, { de: data, ate: data, limite: 5000 });
  const pagos = pedidos.filter((p) => p.status === 'pago');
  const sistema = somarPorForma(pagos.flatMap((p) => p.valendoPorForma));
  const [fechamento] = await db
    .select({ f: schema.caixaFechamentos, por: schema.usuarios.nome })
    .from(schema.caixaFechamentos)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.caixaFechamentos.fechadoPorId))
    .where(eq(schema.caixaFechamentos.data, data));
  const movimentos = await movimentosDoCaixa(db, data);
  const estornos = pedidos.filter((p) => p.status === 'estornado');
  return {
    data,
    movimentos,
    aberto: movimentos.some((m) => m.tipo === 'abertura'),
    fundoCentavos: fundoDoCaixa(movimentos),
    estornosPendentes: await estornosPendentes(db, data),
    estornados: estornos.length,
    porMesa: porMesaDoTurno(pagos),
    pedidos: pagos.length,
    encerrados: pedidos.length - pagos.length,
    divididos: pagos.filter((p) => p.pagamentos.length > 1).length,
    sistema,
    totalCentavos: Object.values(sistema).reduce((a, v) => a + v, 0),
    fechamento: fechamento ? { ...fechamento.f, fechadoPor: fechamento.por } : null,
  };
}

/** Grava (ou refaz) o fechamento do turno. Só o administrador. */
export async function fecharCaixa(db: Db, u: Usuario, data: string, corpo: { trocoInicialCentavos?: unknown; conferido?: unknown; observacao?: unknown }) {
  if (!tem(u.papel, 'fechamento')) throw new ErroRegra('Seu perfil não fecha o caixa.', 403);
  const r = await resumoCaixa(db, data);
  // com abertura/suprimento/sangria lançados, o fundo da gaveta vem deles; senão, do troco digitado
  const troco = r.movimentos.length ? r.fundoCentavos : (centavos(corpo.trocoInicialCentavos) ?? 0);
  const bruto = (corpo.conferido || {}) as Record<string, unknown>;
  const conferido: Partial<Record<FormaPagamento, number>> = {};
  for (const f of FORMAS_PAGAMENTO) {
    const v = centavos(bruto[f]);
    if (v !== undefined) conferido[f] = v;
  }
  if (!Object.keys(conferido).length) throw new ErroRegra('Informe pelo menos o dinheiro contado ou o relatório da maquininha.');
  const observacao = typeof corpo.observacao === 'string' ? corpo.observacao.trim().slice(0, 500) || null : null;
  const conf = conferirCaixa(r.sistema, conferido, troco);
  const valores = { trocoInicialCentavos: troco, sistema: r.sistema, conferido, observacao, fechadoPorId: u.id, fechadoEm: new Date() };
  await db.insert(schema.caixaFechamentos).values({ data, ...valores }).onConflictDoUpdate({ target: schema.caixaFechamentos.data, set: valores });
  const difs = conf.linhas.filter((l) => l.diferenca).map((l) => `${NOME_FORMA[l.forma]} ${l.diferenca! > 0 ? '+' : ''}${reais(l.diferenca!)}`);
  await registrar(db, {
    tipo: 'caixa_fechado',
    usuarioId: u.id,
    descricao: `${u.nome} ${r.fechamento ? 'refez' : 'fez'} o fechamento de caixa do turno ${data.split('-').reverse().join('/')}: sistema ${reais(r.totalCentavos)}${difs.length ? `; diferenças: ${difs.join(', ')}` : '; tudo confere'}${r.estornosPendentes.length ? `; ${r.estornosPendentes.length} estorno(s) ainda sem conferência` : ''}`,
  });
  return { ...conf, data };
}

export async function listarFechamentos(db: Db, limite = 30) {
  return db
    .select({ f: schema.caixaFechamentos, por: schema.usuarios.nome })
    .from(schema.caixaFechamentos)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.caixaFechamentos.fechadoPorId))
    .orderBy(desc(schema.caixaFechamentos.data))
    .limit(limite);
}

async function movimentosDoCaixa(db: Db, data: string) {
  return db
    .select({ id: schema.caixaMovimentos.id, tipo: schema.caixaMovimentos.tipo, valorCentavos: schema.caixaMovimentos.valorCentavos, motivo: schema.caixaMovimentos.motivo, criadoEm: schema.caixaMovimentos.criadoEm, usuario: schema.usuarios.nome })
    .from(schema.caixaMovimentos)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.caixaMovimentos.usuarioId))
    .where(eq(schema.caixaMovimentos.data, data))
    .orderBy(asc(schema.caixaMovimentos.criadoEm));
}

/** Abertura do caixa (troco inicial), suprimento (dinheiro que entrou na gaveta) ou sangria (retirada). */
export async function movimentarCaixa(db: Db, u: Usuario, data: string, corpo: { tipo?: unknown; valorCentavos?: unknown; motivo?: unknown }) {
  if (!tem(u.papel, 'fechamento')) throw new ErroRegra('Seu perfil não mexe no caixa.', 403);
  if (!dataValida(data)) throw new ErroRegra('Data inválida.');
  const tipo = corpo.tipo as TipoCaixa;
  if (!(TIPOS_CAIXA as readonly string[]).includes(String(tipo))) throw new ErroRegra('Escolha abertura, suprimento ou sangria.');
  const valor = centavos(corpo.valorCentavos);
  if (valor === undefined || (tipo !== 'abertura' && valor <= 0)) throw new ErroRegra('Informe o valor.');
  const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.trim().slice(0, 200) : '';
  if (tipo === 'sangria' && motivo.length < 3) throw new ErroRegra('Diga o motivo da sangria (ex.: depósito, pagamento de fornecedor).');
  const movs = await movimentosDoCaixa(db, data);
  if (tipo === 'abertura' && movs.some((m) => m.tipo === 'abertura')) throw new ErroRegra('O caixa deste turno já foi aberto. Para pôr mais dinheiro, use suprimento.');
  if (tipo !== 'abertura' && !movs.some((m) => m.tipo === 'abertura')) throw new ErroRegra('Abra o caixa primeiro (troco inicial).');
  if (tipo === 'sangria' && valor > fundoDoCaixa(movs) + (await resumoCaixa(db, data)).sistema.dinheiro) throw new ErroRegra('A sangria é maior que o dinheiro esperado na gaveta.');
  await db.insert(schema.caixaMovimentos).values({ data, tipo, valorCentavos: valor, motivo: motivo || null, usuarioId: u.id });
  await registrar(db, {
    tipo: `caixa_${tipo}`,
    usuarioId: u.id,
    descricao: `${u.nome}: ${NOME_TIPO_CAIXA[tipo].toLowerCase()} de ${reais(valor)} no caixa do turno ${data.split('-').reverse().join('/')}${motivo ? ` (${motivo})` : ''}`,
  });
  return { ok: true };
}

/** Estornos ainda não conferidos (devolução feita na maquininha ou em dinheiro). Sem data: todos. */
export async function estornosPendentes(db: Db, data?: string) {
  const conds = [eq(schema.pedidos.status, 'estornado'), isNull(schema.pedidos.estornoConferidoEm)];
  if (data) conds.push(eq(schema.pedidos.dataOperacional, data));
  return db
    .select({
      id: schema.pedidos.id,
      numero: schema.pedidos.numero,
      data: schema.pedidos.dataOperacional,
      totalCentavos: schema.pedidos.totalCentavos,
      itensCanceladosCentavos: schema.pedidos.itensCanceladosCentavos,
      formaPagamento: schema.pedidos.formaPagamento,
      motivo: schema.pedidos.motivoEncerramento,
      encerradoEm: schema.pedidos.encerradoEm,
      autorizadoPor: schema.usuarios.nome,
    })
    .from(schema.pedidos)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.pedidos.encerradoPorId))
    .where(and(...conds))
    .orderBy(asc(schema.pedidos.encerradoEm));
}

/** Quem fez a devolução confirma: "estorno feito na maquininha" (ou devolvido em dinheiro). */
export async function conferirEstorno(db: Db, u: Usuario, pedidoId: string) {
  if (!tem(u.papel, 'autorizar') && !tem(u.papel, 'fechamento')) throw new ErroRegra('Seu perfil não confere estornos.', 403);
  const [p] = await db.select().from(schema.pedidos).where(eq(schema.pedidos.id, pedidoId));
  if (!p || p.status !== 'estornado') throw new ErroRegra('Este pedido não está estornado.', 404);
  if (p.estornoConferidoEm) return { ok: true, jaConferido: true };
  await db.update(schema.pedidos).set({ estornoConferidoEm: new Date(), estornoConferidoPorId: u.id }).where(and(eq(schema.pedidos.id, p.id), isNull(schema.pedidos.estornoConferidoEm)));
  await registrar(db, {
    tipo: 'estorno_conferido',
    pedidoId: p.id,
    usuarioId: u.id,
    descricao: `${u.nome} confirmou que o estorno do pedido #${p.numero} (${reais(p.totalCentavos - p.itensCanceladosCentavos)}) foi feito ${p.formaPagamento === 'dinheiro' ? 'em dinheiro' : 'na maquininha'}`,
  });
  return { ok: true, jaConferido: false };
}

/** O que cada mesa (e cada lugar do balcão) lançou no turno: pedidos, total e por forma. */
function porMesaDoTurno(pagos: Awaited<ReturnType<typeof listarPedidos>>) {
  const m = new Map<number, { mesa: number; pedidos: number; totalCentavos: number; taxaCentavos: number; clientes: string[]; porForma: Record<string, number> }>();
  for (const p of pagos) {
    const l = m.get(p.mesa) || { mesa: p.mesa, pedidos: 0, totalCentavos: 0, taxaCentavos: 0, clientes: [], porForma: {} };
    l.pedidos += 1;
    l.totalCentavos += p.liquidoCentavos;
    l.taxaCentavos += p.taxaValendoCentavos;
    if (p.cliente && !l.clientes.includes(p.cliente)) l.clientes.push(p.cliente);
    for (const f of p.valendoPorForma) l.porForma[f.forma] = (l.porForma[f.forma] || 0) + f.valorCentavos;
    m.set(p.mesa, l);
  }
  return [...m.values()].sort((a, b) => ordemLocal({ numero: a.mesa }, { numero: b.mesa }));
}

/** Último turno com vendas pagas que ainda não teve o caixa fechado (para não esquecer nenhum). */
export async function turnoSemFechamento(db: Db) {
  const [r] = await db
    .select({ data: sql<string>`max(${schema.pedidos.dataOperacional})` })
    .from(schema.pedidos)
    .leftJoin(schema.caixaFechamentos, eq(schema.caixaFechamentos.data, schema.pedidos.dataOperacional))
    .where(and(eq(schema.pedidos.status, 'pago'), isNull(schema.caixaFechamentos.data)));
  return r?.data ?? null;
}
