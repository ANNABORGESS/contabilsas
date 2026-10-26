// Cadastro de produtos e serviços e lançamento de vendas (cada parcela vira um título a receber).
import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, brl, dataBr, soDigitos } from '@/domain/dinheiro';
import { categoriaDaVenda, parcelasDaVenda, totalDaVenda } from '@/domain/venda';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { proximoCodigo } from './financeiro';

export interface DadosItem {
  id?: string;
  tipo: 'produto' | 'servico';
  nome: string;
  unidade: string;
  ncm: string;
  categoria: string;
  preco: number;
  custo: number;
  descricao: string;
}

export async function salvarItem(db: Db, u: Usuario, emp: Empresa, v: DadosItem) {
  if (!v.nome.trim()) throw new Error('Informe o nome do produto ou serviço.');
  const campos = {
    tipo: v.tipo, nome: v.nome.trim(), unidade: v.unidade.trim() || null, ncm: v.ncm.trim() || null, categoria: v.categoria.trim() || null,
    preco: v.preco > 0 ? arred(v.preco) : null, custo: v.custo > 0 ? arred(v.custo) : null, descricao: v.descricao.trim() || null,
  };
  if (v.id) {
    const r = await db.update(schema.catalogo).set(campos).where(and(eq(schema.catalogo.id, v.id), eq(schema.catalogo.empresaId, emp.id))).returning({ id: schema.catalogo.id });
    if (!r.length) throw new Error('Item não encontrado nesta empresa.');
    await auditar(db, u, { empresaId: emp.id, acao: 'Alterou produto/serviço', entidade: campos.nome, depois: campos.preco ? brl(campos.preco) : 'sem preço' });
  } else {
    await db.insert(schema.catalogo).values({ tenantId: u.tenantId, empresaId: emp.id, ...campos });
    await auditar(db, u, { empresaId: emp.id, acao: v.tipo === 'servico' ? 'Cadastrou serviço' : 'Cadastrou produto', entidade: campos.nome, depois: campos.preco ? brl(campos.preco) : 'sem preço' });
  }
}

export async function alternarItem(db: Db, u: Usuario, emp: Empresa, id: string) {
  const [i] = await db.select().from(schema.catalogo).where(and(eq(schema.catalogo.id, id), eq(schema.catalogo.empresaId, emp.id)));
  if (!i) throw new Error('Item não encontrado nesta empresa.');
  await db.update(schema.catalogo).set({ ativo: !i.ativo }).where(eq(schema.catalogo.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: i.ativo ? 'Desativou produto/serviço' : 'Reativou produto/serviço', entidade: i.nome });
  return i.ativo ? 'desativado' : 'reativado';
}

export interface DadosVenda {
  data: string;
  parceiroId: string;
  novoCliente: string;
  novoDoc: string;
  itens: { catalogoId: string; nome: string; qtd: number; preco: number }[];
  parcelas: number;
  primeiroVenc: string;
  obs: string;
  /** venda que fatura um pedido do Comercial: os títulos ficam ligados ao pedido */
  pedido?: { id: string; rotulo: string; referencia: string | null };
}

export async function lancarVenda(db: Db, u: Usuario, emp: Empresa, v: DadosVenda) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data) || !/^\d{4}-\d{2}-\d{2}$/.test(v.primeiroVenc)) throw new Error('Informe a data da venda e o 1º vencimento.');
  if (v.primeiroVenc < v.data) throw new Error('O 1º vencimento não pode ser antes da data da venda.');
  const ids = v.itens.map((i) => i.catalogoId).filter(Boolean);
  const cat = ids.length ? await db.select().from(schema.catalogo).where(and(eq(schema.catalogo.empresaId, emp.id), inArray(schema.catalogo.id, ids))) : [];
  const porId = new Map(cat.map((c) => [c.id, c]));
  const linhas = v.itens
    .map((i) => {
      const c = i.catalogoId ? porId.get(i.catalogoId) : undefined;
      if (i.catalogoId && !c) throw new Error('Um dos itens não é desta empresa.');
      const preco = i.preco > 0 ? i.preco : Number(c?.preco || 0);
      return { catalogoId: c?.id || null, tipo: (c?.tipo || 'servico') as 'produto' | 'servico', nome: c?.nome || i.nome.trim(), qtd: i.qtd, preco };
    })
    .filter((l) => l.nome && l.qtd > 0);
  if (!linhas.length) throw new Error('Inclua ao menos um item com quantidade.');
  if (linhas.some((l) => !(l.preco > 0))) throw new Error('Informe o preço dos itens sem preço cadastrado.');
  const { itens: totais, total } = totalDaVenda(linhas);
  const itens = linhas.map((l, k) => ({ ...l, total: totais[k] }));

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    let parceiro: typeof schema.parceiros.$inferSelect | undefined;
    if (v.parceiroId) {
      [parceiro] = await t.select().from(schema.parceiros).where(and(eq(schema.parceiros.id, v.parceiroId), eq(schema.parceiros.empresaId, emp.id)));
      if (!parceiro) throw new Error('Cliente não encontrado nesta empresa.');
    } else {
      if (!v.novoCliente.trim()) throw new Error('Escolha o cliente ou digite o nome de um cliente novo.');
      const doc = soDigitos(v.novoDoc) || null;
      if (doc && doc.length !== 11 && doc.length !== 14) throw new Error('CPF/CNPJ do cliente novo incompleto.');
      if (doc) [parceiro] = await t.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, 'cliente'), eq(schema.parceiros.doc, doc)));
      if (!parceiro) [parceiro] = await t.insert(schema.parceiros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: 'cliente', doc, razao: v.novoCliente.trim(), origem: 'Venda' }).returning();
    }
    const [{ n }] = await t.select({ n: sql<number>`coalesce(max(${schema.vendas.numero}), 0)::int` }).from(schema.vendas).where(eq(schema.vendas.empresaId, emp.id));
    const numero = Number(n) + 1;
    const rotulo = `V-${String(numero).padStart(4, '0')}`;
    const parcelas = parcelasDaVenda(total, v.parcelas, v.primeiroVenc);
    const [venda] = await t.insert(schema.vendas).values({
      tenantId: u.tenantId, empresaId: emp.id, numero, data: v.data, parceiroId: parceiro.id, cliente: parceiro.razao, docCliente: parceiro.doc,
      itens, total, parcelas: parcelas.length, primeiroVenc: v.primeiroVenc, obs: v.obs.trim() || null,
    }).returning({ id: schema.vendas.id });
    const pedido = v.pedido ? ` · Pedido ${v.pedido.rotulo}${v.pedido.referencia ? ` (cliente ${v.pedido.referencia})` : ''}` : '';
    const descricao = `Venda ${rotulo}${pedido} · ${itens.map((i) => `${i.qtd} × ${i.nome}`).join(', ')}`.slice(0, 300);
    const categoria = categoriaDaVenda(itens.map((i) => i.tipo));
    const codigos: string[] = [];
    for (const p of parcelas) {
      // cada parcela inserida já sobe o maior código, então a próxima chamada devolve o seguinte
      const codigo = await proximoCodigo(t, emp.id, 'receber');
      codigos.push(codigo);
      await t.insert(schema.titulos).values({
        tenantId: u.tenantId, empresaId: emp.id, codigo, tipo: 'receber', parceiroId: parceiro.id, nome: parceiro.razao, docParceiro: parceiro.doc, descricao, parcela: p.parcela,
        venc: p.venc, valor: p.valor, status: 'A receber', competencia: v.data.slice(0, 7), categoria, centro: 'Comercial', contaContabil: '3.1.1.01', origem: 'venda', dados: { venda: venda.id, vendaNumero: rotulo, ...(v.pedido && { pedidoDoc: v.pedido.id, pedidoNumero: v.pedido.rotulo, pedido: v.pedido.referencia || v.pedido.rotulo }) },
      });
    }
    await auditar(t, u, { empresaId: emp.id, acao: 'Lançou venda', entidade: `${rotulo} · ${parceiro.razao}`, depois: `${brl(total)} em ${parcelas.length}x · 1º venc. ${dataBr(v.primeiroVenc)} · ${codigos.join(', ')}` });
    return `Venda ${rotulo} lançada: ${brl(total)} em ${parcelas.length} parcela(s) no Contas a Receber (${codigos[0]}${codigos.length > 1 ? ` a ${codigos[codigos.length - 1]}` : ''}).`;
  });
}

/** Cancela a venda e os títulos dela, desde que nenhuma parcela tenha recebimento. */
export async function cancelarVenda(db: Db, u: Usuario, emp: Empresa, vendaId: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo do cancelamento.');
  const [v] = await db.select().from(schema.vendas).where(and(eq(schema.vendas.id, vendaId), eq(schema.vendas.empresaId, emp.id)));
  if (!v) throw new Error('Venda não encontrada nesta empresa.');
  if (v.status === 'Cancelada') throw new Error('Esta venda já está cancelada.');
  const tits = await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), sql`${schema.titulos.dados}->>'venda' = ${vendaId}`));
  if (tits.length) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.baixas).where(and(inArray(schema.baixas.tituloId, tits.map((t) => t.id)), eq(schema.baixas.estornada, false)));
    if (Number(n) > 0) throw new Error('Há parcela com recebimento registrado. Estorne o recebimento no Financeiro antes de cancelar a venda.');
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.vendas).set({ status: 'Cancelada' }).where(eq(schema.vendas.id, vendaId));
    if (tits.length) await tx.update(schema.titulos).set({ status: 'Cancelado' }).where(inArray(schema.titulos.id, tits.map((t) => t.id)));
    await auditar(tx as unknown as Db, u, { empresaId: emp.id, acao: 'Cancelou venda', entidade: `V-${String(v.numero).padStart(4, '0')} · ${v.cliente}`, antes: brl(v.total), depois: `Cancelada · ${tits.length} título(s) cancelado(s)`, justificativa: motivo.trim() });
  });
}

export async function vendasDaEmpresa(db: Db, empresaId: string) {
  return db.select().from(schema.vendas).where(eq(schema.vendas.empresaId, empresaId)).orderBy(sql`${schema.vendas.numero} desc`).limit(200);
}
