// Promoções programadas: cadastro (administrador ou gerente), as que valem agora (para o garçom,
// com a contagem regressiva) e o relatório de cada uma no período.
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { escolhasDoCombo, lerJanelas, restanteDoCombo, textoJanelas, type Combo } from '@/domain/combo';
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

/** Promoções ligadas, para o site: produto, horário, dias, onde vale e se está valendo agora. */
export async function promocoesDoSite(db: Db, agora = new Date()) {
  const lista = (await todas(db)).filter((p) => p.ativa);
  if (!lista.length) return [];
  const produtos = await db.select().from(schema.produtos).where(inArray(schema.produtos.id, [...new Set(lista.map((p) => p.produtoId))]));
  return lista
    .map((p) => {
      const prod = produtos.find((x) => x.id === p.produtoId);
      return {
        id: p.id,
        nome: p.nome,
        destaque: p.destaque,
        produto: prod?.nome ?? '',
        quantidadeCombo: p.quantidadeCombo,
        precoComboCentavos: p.precoComboCentavos,
        precoNormalCentavos: prod?.precoCentavos ?? 0,
        inicio: p.inicio,
        fim: p.fim,
        dias: p.dias,
        mesas: p.mesas ?? null,
        valendo: restanteDaPromocao(p as Promocao, agora) !== null,
      };
    })
    .filter((p) => p.produto);
}

// ---------- combos do happy hour ----------

const todosCombos = (db: Db) => db.select().from(schema.combos).orderBy(asc(schema.combos.ordem), asc(schema.combos.nome));

/** Combos que valem agora (na confirmação, também os que acabaram há pouco). */
export async function combosParaPedido(db: Db, agora: Date, comTolerancia = false): Promise<Combo[]> {
  const antes = new Date(agora.getTime() - TOLERANCIA_MS);
  return (await todosCombos(db)).filter((c) => restanteDoCombo(c, agora) !== null || (comTolerancia && restanteDoCombo(c, antes) !== null)) as Combo[];
}

/** Para o garçom: combos valendo agora, com o que dá para escolher e quanto falta para acabar. */
export async function combosAgora(db: Db, agora = new Date()) {
  return (await todosCombos(db))
    .map((c) => ({ c, ms: restanteDoCombo(c, agora) }))
    .filter((x) => x.ms !== null)
    .map(({ c, ms }) => ({ id: c.id, nome: c.nome, descricao: c.descricao, precoCentavos: c.precoCentavos, itens: c.itens, escolhas: escolhasDoCombo(c), terminaEm: new Date(agora.getTime() + ms!).toISOString() }));
}

/** Para o administrador e o site: todos os combos, com as janelas em texto e se valem agora. */
export async function listarCombos(db: Db, agora = new Date()) {
  return (await todosCombos(db)).map((c) => ({ ...c, horarios: textoJanelas(c.janelas), valendo: restanteDoCombo(c, agora) !== null }));
}

export async function salvarCombo(db: Db, u: Usuario, id: string, corpo: Record<string, unknown>) {
  if (!tem(u.papel, 'cardapio')) throw new ErroRegra('Seu perfil não mexe nos combos.', 403);
  const set: Partial<typeof schema.combos.$inferInsert> = {};
  if (corpo.precoCentavos !== undefined) {
    const v = Number(corpo.precoCentavos);
    if (!Number.isInteger(v) || v < 1 || v > 100000_00) throw new ErroRegra('Preço inválido.');
    set.precoCentavos = v;
  }
  if (typeof corpo.horarios === 'string') {
    try {
      set.janelas = lerJanelas(corpo.horarios);
    } catch (e) {
      throw new ErroRegra((e as Error).message);
    }
  }
  if (typeof corpo.ativo === 'boolean') set.ativo = corpo.ativo;
  if (!Object.keys(set).length) throw new ErroRegra('Nada para salvar.');
  const [c] = await db.update(schema.combos).set(set).where(eq(schema.combos.id, id)).returning();
  if (!c) throw new ErroRegra('Combo não encontrado.', 404);
  await registrar(db, { tipo: 'combo_salvo', usuarioId: u.id, descricao: `${u.nome} alterou o ${c.nome}: ${reais(c.precoCentavos)}, ${textoJanelas(c.janelas)}${c.ativo ? '' : ' (desligado)'}` });
  return { combo: c };
}

/** Cria um combo: { nome, descricao, precoCentavos, horarios: "Qua, Qui 17:00-20:00", itens: [...] }. */
export async function criarCombo(db: Db, u: Usuario, corpo: Record<string, unknown>) {
  if (!tem(u.papel, 'cardapio')) throw new ErroRegra('Seu perfil não mexe nos combos.', 403);
  const nome = typeof corpo.nome === 'string' ? corpo.nome.trim().slice(0, 60) : '';
  if (nome.length < 3) throw new ErroRegra('Dê um nome ao combo.');
  const preco = Number(corpo.precoCentavos);
  if (!Number.isInteger(preco) || preco < 1) throw new ErroRegra('Preço inválido.');
  let janelas;
  try {
    janelas = lerJanelas(String(corpo.horarios || ''));
  } catch (e) {
    throw new ErroRegra((e as Error).message);
  }
  const itensBrutos = Array.isArray(corpo.itens) ? (corpo.itens as Record<string, unknown>[]) : [];
  const itens = itensBrutos.map((i) => {
    const q = Number(i?.quantidade);
    if (!Number.isInteger(q) || q < 1 || q > 24) throw new ErroRegra('Quantidade inválida no combo.');
    if (i.escolha === 'long-neck') return { escolha: 'long-neck' as const, quantidade: q };
    if (typeof i.produtoId !== 'string') throw new ErroRegra('Produto inválido no combo.');
    return { produtoId: i.produtoId, quantidade: q, nome: typeof i.nome === 'string' ? i.nome.slice(0, 60) : null };
  });
  if (!itens.length) throw new ErroRegra('O combo precisa de pelo menos um item.');
  const fixos = itens.filter((i): i is { produtoId: string; quantidade: number; nome: string | null } => 'produtoId' in i);
  if (fixos.length) {
    const achados = await db.select({ id: schema.produtos.id }).from(schema.produtos).where(inArray(schema.produtos.id, fixos.map((f) => f.produtoId)));
    if (achados.length !== new Set(fixos.map((f) => f.produtoId)).size) throw new ErroRegra('Um produto do combo não existe.');
  }
  const descricao = typeof corpo.descricao === 'string' ? corpo.descricao.trim().slice(0, 120) || null : null;
  const [c] = await db.insert(schema.combos).values({ nome, descricao, precoCentavos: preco, janelas, itens }).returning();
  await registrar(db, { tipo: 'combo_salvo', usuarioId: u.id, descricao: `${u.nome} criou o ${c.nome}: ${reais(c.precoCentavos)}, ${textoJanelas(c.janelas)}` });
  return { combo: c };
}
