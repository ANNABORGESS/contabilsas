// Produtos vendidos: itens das NFs de venda do Contas a Receber e das NFs de saída aprovadas no Autopilot.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred } from '@/domain/dinheiro';
import { type ItemVendido, type NotaComItens, produtosVendidos } from '@/domain/produtos-vendidos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import type { DadosDocumento } from './autopilot';

/** Chave de NF-e tem 44 dígitos; a de NFS-e nacional tem 50 (com prefixo NFS no XML). */
const tipoPelaChave = (chave: string) => (/^\d{44}$/.test(chave) ? 'NF-e' : 'NFS-e');

export async function notasDeVenda(db: Db, empresaId: string) {
  const [tits, docs] = await Promise.all([
    db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.tipo, 'receber'))),
    db.select({ chave: schema.documentosEntrada.chave, dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada)
      .where(and(eq(schema.documentosEntrada.empresaId, empresaId), eq(schema.documentosEntrada.status, 'Aprovado'))),
  ]);
  const notas = new Map<string, NotaComItens>();
  const semItens = new Map<string, { nf: string; cliente: string; valor: number; codigo: string }>();
  for (const t of tits) {
    // nota de venda: tem NF, não é retorno nem cancelada (venda lançada à mão no Comercial não entra)
    if (!t.nf || t.retorno || /cancel|retorno/i.test(t.status)) continue;
    const d = t.dados as { itens?: ItemVendido[]; pedido?: string; nfEmissao?: string; nfCancelada?: boolean };
    if (d.nfCancelada) continue;
    const chave = t.nfChave || `NF ${t.nf}`;
    if (notas.has(chave)) continue;
    if (d.itens?.length) {
      notas.set(chave, { nf: t.nf, chave, tipo: tipoPelaChave(t.nfChave || ''), cliente: t.nome, pedido: String(d.pedido || '').replace(/^0+(?=\d+$)/, ''), emissao: d.nfEmissao || `${t.competencia || ''}-01`.slice(0, 10), itens: d.itens });
      semItens.delete(chave);
    } else if (!semItens.has(chave)) semItens.set(chave, { nf: t.nf, cliente: t.nome, valor: t.valorFiscal ?? t.valor, codigo: t.codigo });
  }
  for (const doc of docs) {
    const dd = doc.dados as DadosDocumento;
    const n = dd.nota;
    if (!n || dd.direcao !== 'saida' || dd.retorno || !n.itens?.length) continue;
    const chave = n.dados.chave || doc.chave || '';
    if (notas.has(chave)) continue;
    notas.set(chave, { nf: n.dados.numero, chave, tipo: n.tipo, cliente: n.dados.cliNome, pedido: (n.dados.pedido || '').replace(/^0+(?=\d+$)/, ''), emissao: n.dados.emissao, itens: n.itens.map((i) => ({ desc: i.desc, ncm: i.ncm, un: i.un, qtd: i.qtd, unit: i.unit, total: i.total })) });
    semItens.delete(chave);
  }
  return { notas: [...notas.values()], semItens: [...semItens.values()].sort((a, b) => a.nf.localeCompare(b.nf, 'pt-BR', { numeric: true })) };
}

/** Leva para o cadastro de Produtos e serviços os itens vendidos que ainda não estão lá (preço = último vendido). */
export async function trazerParaCadastro(db: Db, u: Usuario, emp: Empresa) {
  const { notas } = await notasDeVenda(db, emp.id);
  const produtos = produtosVendidos(notas);
  const cat = await db.select({ nome: schema.catalogo.nome }).from(schema.catalogo).where(eq(schema.catalogo.empresaId, emp.id));
  const existentes = new Set(cat.map((c) => c.nome.trim().toUpperCase()));
  const novos = produtos
    .map((p) => ({ p, nome: (p.codigo ? `${p.codigo} - ${p.nome}` : p.nome).slice(0, 200) }))
    .filter(({ p, nome }) => !existentes.has(nome.toUpperCase()) && !(p.codigo && [...existentes].some((e) => e.startsWith(`${p.codigo} `))));
  if (!novos.length) return 'Todos os produtos vendidos já estão no cadastro.';
  await db.insert(schema.catalogo).values(novos.map(({ p, nome }) => ({
    tenantId: u.tenantId, empresaId: emp.id, tipo: p.servico ? 'servico' : 'produto', nome, unidade: p.un || null, ncm: p.ncm || null,
    categoria: 'Sob encomenda', preco: p.ultimoPreco > 0 ? arred(p.ultimoPreco) : null, custo: null,
    descricao: `Vendido para ${p.clientes.join(', ')}`.slice(0, 300),
  })));
  await auditar(db, u, { empresaId: emp.id, acao: 'Trouxe produtos das NFs para o cadastro', depois: `${novos.length} item(ns)` });
  return `${novos.length} produto(s)/serviço(s) das NFs incluído(s) no cadastro, com o último preço vendido.`;
}
