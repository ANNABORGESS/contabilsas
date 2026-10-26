'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { type Db, getDb } from '@/db';
import { LINHAS_DOC, rotuloDoc, type TipoDoc } from '@/domain/comercial';
import { brl, numero } from '@/domain/dinheiro';
import { LINHAS_VENDA } from '@/domain/venda';
import { type Empresa, exigirEdicao, exigirEmpresa, type Usuario } from '@/server/auth';
import { cancelarVenda, lancarVenda } from '@/server/comercial';
import { converterEmPedido, criarDoc, faturarPedido, gerarPedidoCompra, mudarEtapa, mudarStatus, novaVersao, receberCompra, salvarCotacoes, salvarParceiro } from '@/server/comercial-docs';
import { normPedido, vincularCusto } from '@/server/rentabilidade';

const txt = (f: FormData, k: string) => String(f.get(k) || '');

export async function vender(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const itens = Array.from({ length: LINHAS_VENDA }, (_, k) => ({
      catalogoId: txt(form, `item${k}`), nome: txt(form, `nome${k}`), qtd: numero(form.get(`qtd${k}`)), preco: numero(form.get(`preco${k}`)),
    })).filter((i) => (i.catalogoId || i.nome.trim()) && i.qtd > 0);
    const msg = await lancarVenda(await getDb(), u, emp, {
      data: txt(form, 'data'), parceiroId: txt(form, 'cliente'), novoCliente: txt(form, 'novoCliente'), novoDoc: txt(form, 'novoDoc'),
      itens, parcelas: Number(txt(form, 'parcelas')) || 1, primeiroVenc: txt(form, 'primeiroVenc'), obs: txt(form, 'obs'),
    });
    revalidatePath('/comercial');
    revalidatePath('/financeiro');
    redirect(`/comercial?t=vendas&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=vendas&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function cancelar(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    await cancelarVenda(await getDb(), u, emp, txt(form, 'id'), txt(form, 'motivo'));
    revalidatePath('/comercial');
    revalidatePath('/financeiro');
    redirect(`/comercial?t=vendas&msg=${encodeURIComponent('Venda cancelada e parcelas canceladas no Contas a Receber.')}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=vendas&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

// ——— Cadastro, orçamentos, pedidos e compras ———
type Volta = 'cliente' | 'fornecedor' | 'compras' | 'orcamentos' | 'pedidos' | 'custos';

async function executar(volta: Volta, fn: (db: Db, u: Usuario, emp: Empresa) => Promise<string>) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await fn(await getDb(), u, emp);
    revalidatePath('/comercial');
    revalidatePath('/financeiro');
    redirect(`/comercial?t=${volta}&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=${volta}&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

const voltaDe = (f: FormData, padrao: Volta) => (['cliente', 'fornecedor', 'compras', 'orcamentos', 'pedidos'].includes(txt(f, 'volta')) ? txt(f, 'volta') : padrao) as Volta;

export async function salvarParceiroAcao(form: FormData) {
  const tipo = txt(form, 'tipo') === 'fornecedor' ? 'fornecedor' : 'cliente';
  await executar(tipo, (db, u, emp) => salvarParceiro(db, u, emp, {
    id: txt(form, 'id') || undefined, tipo, razao: txt(form, 'razao'), fantasia: txt(form, 'fantasia'), doc: txt(form, 'doc'), categoria: txt(form, 'categoria'),
    email: txt(form, 'email'), telefone: txt(form, 'telefone'), contato: txt(form, 'contato'), cidade: txt(form, 'cidade'), uf: txt(form, 'uf'), obs: txt(form, 'obs'),
  }));
}

export async function criarDocAcao(form: FormData) {
  const tipo = txt(form, 'tipo') as TipoDoc;
  const volta: Volta = tipo === 'orcamento' ? 'orcamentos' : tipo === 'pedido' ? 'pedidos' : 'compras';
  await executar(volta, async (db, u, emp) => {
    if (!['orcamento', 'pedido', 'solicitacao'].includes(tipo)) throw new Error('Tipo de documento inválido.');
    const itens = Array.from({ length: LINHAS_DOC }, (_, k) => ({ catalogoId: txt(form, `item${k}`), nome: txt(form, `nome${k}`), qtd: numero(form.get(`qtd${k}`)), preco: numero(form.get(`preco${k}`)) }));
    const d = await criarDoc(db, u, emp, tipo, {
      data: txt(form, 'data'), prazo: txt(form, 'prazo'), parceiroId: txt(form, 'parceiro'), novoParceiro: txt(form, 'novoParceiro'), novoDoc: txt(form, 'novoDoc'),
      referencia: txt(form, 'referencia'), itens, condicao: txt(form, 'condicao'), obs: txt(form, 'obs'),
      dados: tipo === 'solicitacao' ? { centro: txt(form, 'centro') || null, prioridade: txt(form, 'prioridade') || 'Normal', fornecedorSugerido: txt(form, 'fornecedorSugerido') || null, pedido: normPedido(txt(form, 'pedidoCliente')) || null } : {},
    });
    return `${rotuloDoc(tipo, d.numero)} criado: ${brl(d.total)}.`;
  });
}

export async function mudarStatusAcao(form: FormData) {
  await executar(voltaDe(form, 'orcamentos'), (db, u, emp) => mudarStatus(db, u, emp, txt(form, 'id'), txt(form, 'para'), txt(form, 'motivo')));
}

export async function converterAcao(form: FormData) {
  await executar('pedidos', (db, u, emp) => converterEmPedido(db, u, emp, txt(form, 'id'), txt(form, 'prazo'), txt(form, 'referencia')));
}

export async function faturarAcao(form: FormData) {
  await executar('pedidos', (db, u, emp) => faturarPedido(db, u, emp, txt(form, 'id'), Number(txt(form, 'parcelas')) || 1, txt(form, 'primeiroVenc')));
}

export async function cotacaoAcao(form: FormData) {
  await executar('compras', (db, u, emp) => salvarCotacoes(db, u, emp, txt(form, 'id'), [0, 1, 2].map((k) => ({
    fornecedor: txt(form, `forn${k}`), unitario: numero(form.get(`unit${k}`)), prazoDias: txt(form, `prazo${k}`) ? Number(txt(form, `prazo${k}`)) : null, condicao: txt(form, `cond${k}`),
  }))));
}

export async function gerarCompraAcao(form: FormData) {
  await executar('compras', (db, u, emp) => gerarPedidoCompra(db, u, emp, txt(form, 'id'), { fornecedor: txt(form, 'fornecedor'), unitario: numero(form.get('unitario')), prazo: txt(form, 'prazo'), condicao: txt(form, 'condicao') }));
}

export async function receberCompraAcao(form: FormData) {
  await executar('compras', (db, u, emp) => receberCompra(db, u, emp, txt(form, 'id'), { data: txt(form, 'data'), venc: txt(form, 'venc'), nf: txt(form, 'nf'), lancarTitulo: form.get('lancar') === 'on' }));
}

export async function etapaAcao(form: FormData) {
  await executar('pedidos', (db, u, emp) => mudarEtapa(db, u, emp, txt(form, 'id'), txt(form, 'etapa')));
}

export async function novaVersaoAcao(form: FormData) {
  await executar('orcamentos', (db, u, emp) => novaVersao(db, u, emp, txt(form, 'id')));
}

export async function vincularCustoAcao(form: FormData) {
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await vincularCusto(await getDb(), u, emp, txt(form, 'titulo'), txt(form, 'pedido'));
    revalidatePath('/comercial');
    redirect(`/comercial?t=custos&aba=pedido&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/comercial?t=custos&aba=pedido&erro=${encodeURIComponent((e as Error).message)}`);
  }
}
