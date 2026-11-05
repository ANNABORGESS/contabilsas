// Fechamento de caixa do turno: soma o que o sistema registrou em cada forma (já sem cancelados e
// itens cancelados), compara com o dinheiro contado e com o relatório da maquininha e guarda.
import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { conferirCaixa, somarPorForma } from '@/domain/pagamento';
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
  return {
    data,
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
  if (u.papel !== 'admin') throw new ErroRegra('Só o administrador fecha o caixa.', 403);
  const r = await resumoCaixa(db, data);
  const troco = centavos(corpo.trocoInicialCentavos) ?? 0;
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
    descricao: `${u.nome} ${r.fechamento ? 'refez' : 'fez'} o fechamento de caixa do turno ${data.split('-').reverse().join('/')}: sistema ${reais(r.totalCentavos)}${difs.length ? `; diferenças: ${difs.join(', ')}` : '; tudo confere'}`,
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
