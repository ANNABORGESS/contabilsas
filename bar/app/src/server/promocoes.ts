// Promoções programadas: cadastro (administrador ou gerente), as que valem agora (para o garçom,
// com a contagem regressiva) e o relatório de cada uma no período.
import { and, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { tem } from '@/domain/papeis';
import { DIAS_SEMANA, ErroPromocao, TOLERANCIA_MS, restanteDaPromocao, resultadoPromocao, validarPromocao, valeNaMesa, type Promocao } from '@/domain/promocao';
import { nomeLocal } from '@/domain/mesas';
import type { PromocaoVigente } from '@/domain/pedido';
import { dataValida } from '@/domain/turno';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

const todas = (db: Db) => db.select().from(schema.promocoes).orderBy(desc(schema.promocoes.criadoEm));

/** As que valem agora, com quanto falta para acabar. */
export async function promocoesAgora(db: Db, agora = new Date()) {
  const lista = await todas(db);
  return lista
    .map((p) => ({ p, ms: restanteDaPromocao(p as Promocao, agora) }))
    .filter((x) => x.ms !== null)
    .map(({ p, ms }) => ({ id: p.id, nome: p.nome, produtoId: p.produtoId, quantidadeCombo: p.quantidadeCombo, precoComboCentavos: p.precoComboCentavos, destaque: p.destaque, fim: p.fim, mesas: p.mesas ?? null, terminaEm: new Date(agora.getTime() + ms!).toISOString() }));
}

/**
 * Preço do pedido: na prévia, só as que valem agora. Na confirmação, também a que acabou há pouco
 * se o garçom já cobrou com ela (cobrou antes das 20h e confirmou um pouco depois).
 */
export async function promocoesParaPedido(db: Db, agora: Date, mesa: number, cobradasCom: string[] = []): Promise<PromocaoVigente[]> {
  const lista = (await todas(db)).filter((p) => valeNaMesa(p, mesa));
  const antes = new Date(agora.getTime() - TOLERANCIA_MS);
  return lista.filter((p) => restanteDaPromocao(p as Promocao, agora) !== null || (cobradasCom.includes(p.id) && restanteDaPromocao(p as Promocao, antes) !== null));
}

function regra<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ErroPromocao) throw new ErroRegra(e.message);
    throw e;
  }
}

const descrever = (p: { nome: string; quantidadeCombo: number; precoComboCentavos: number; dias: number[]; inicio: string; fim: string; mesas?: number[] | null }) =>
  `${p.nome}: ${p.quantidadeCombo} por ${reais(p.precoComboCentavos)}, ${p.dias.length === 7 ? 'todos os dias' : p.dias.map((d) => DIAS_SEMANA[d]).join(', ')}, ${p.inicio} às ${p.fim}${p.mesas?.length ? `, só em ${p.mesas.map((n) => nomeLocal(n)).join(', ')}` : ''}`;

export async function salvarPromocao(db: Db, u: Usuario, id: string | null, corpo: Record<string, unknown>) {
  if (!tem(u.papel, 'cardapio')) throw new ErroRegra('Seu perfil não cadastra promoções.', 403);
  const v = regra(() => validarPromocao(corpo));
  const [prod] = await db.select().from(schema.produtos).where(eq(schema.produtos.id, v.produtoId));
  if (!prod || prod.excluido) throw new ErroRegra('Produto não encontrado.');
  let salva;
  if (id) {
    [salva] = await db.update(schema.promocoes).set(v).where(eq(schema.promocoes.id, id)).returning();
    if (!salva) throw new ErroRegra('Promoção não encontrada.', 404);
  } else [salva] = await db.insert(schema.promocoes).values(v).returning();
  await registrar(db, { tipo: 'promocao_salva', usuarioId: u.id, descricao: `${u.nome} ${id ? 'alterou' : 'cadastrou'} a promoção ${descrever(v)}${v.ativa ? '' : ' (desligada)'}` });
  return { promocao: salva };
}

export async function excluirPromocao(db: Db, u: Usuario, id: string) {
  if (!tem(u.papel, 'cardapio')) throw new ErroRegra('Seu perfil não cadastra promoções.', 403);
  const [p] = await db.select().from(schema.promocoes).where(eq(schema.promocoes.id, id));
  if (!p) throw new ErroRegra('Promoção não encontrada.', 404);
  const [vendida] = await db.select({ id: schema.pedidoItens.id }).from(schema.pedidoItens).where(eq(schema.pedidoItens.promocaoId, id)).limit(1);
  // já vendida: só desliga, para o relatório continuar mostrando
  if (vendida) await db.update(schema.promocoes).set({ ativa: false }).where(eq(schema.promocoes.id, id));
  else await db.delete(schema.promocoes).where(eq(schema.promocoes.id, id));
  await registrar(db, { tipo: 'promocao_excluida', usuarioId: u.id, descricao: `${u.nome} ${vendida ? 'desligou' : 'excluiu'} a promoção ${p.nome}` });
  return { ok: true, desligada: !!vendida };
}

/** Cadastro + resultado de cada promoção no período (pedidos pagos, sem itens cancelados). */
export async function listarPromocoes(db: Db, de: string, ate: string, agora = new Date()) {
  if (!dataValida(de) || !dataValida(ate)) throw new ErroRegra('Período inválido.');
  const lista = await todas(db);
  const produtos = lista.length ? await db.select().from(schema.produtos).where(inArray(schema.produtos.id, [...new Set(lista.map((p) => p.produtoId))])) : [];
  const itens = lista.length
    ? await db
        .select({ promocaoId: schema.pedidoItens.promocaoId, quantidade: schema.pedidoItens.quantidade, quantidadeCancelada: schema.pedidoItens.quantidadeCancelada, unidades: schema.pedidoItens.unidades, precoCentavos: schema.pedidoItens.precoCentavos })
        .from(schema.pedidoItens)
        .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.pedidoItens.pedidoId))
        .where(and(isNotNull(schema.pedidoItens.promocaoId), eq(schema.pedidos.status, 'pago'), gte(schema.pedidos.dataOperacional, de), lte(schema.pedidos.dataOperacional, ate)))
    : [];
  return {
    de,
    ate,
    promocoes: lista.map((p) => {
      const prod = produtos.find((x) => x.id === p.produtoId);
      const restante = restanteDaPromocao(p as Promocao, agora);
      return {
        ...p,
        produto: prod?.nome || '—',
        precoNormalCentavos: prod?.precoCentavos ?? 0,
        valendo: restante !== null,
        terminaEm: restante !== null ? new Date(agora.getTime() + restante).toISOString() : null,
        resultado: resultadoPromocao(
          itens.filter((i) => i.promocaoId === p.id),
          prod?.custoCentavos ?? null,
          prod?.precoCentavos ?? 0,
        ),
      };
    }),
  };
}
