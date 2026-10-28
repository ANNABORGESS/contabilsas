// "Peça à ZARO": atende pedidos de demonstração escritos em português (balancete, DRE, balanço) com o
// período certo, um resumo dos números e os links para a tela, o PDF e o Excel. Usado na Contabilidade,
// no Autopilot e na ZARO IA.
import 'server-only';
import type { Db } from '@/db';
import { balanceteModelo } from '@/domain/balancete-modelo';
import { balanco, dre } from '@/domain/demonstracoes';
import { brl } from '@/domain/dinheiro';
import { STATUS_NO_LIVRO } from '@/domain/motor';
import { atalhoDoPedido, interpretarPedido, linksDoPedido, NOME_DEMO, pedidoDeAprovacao, periodoTexto, temTermo, type Demonstracao, type PedidoContabil } from '@/domain/pedido-contabil';
import type { Lancamento } from '@/domain/motor';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { lancamentosDaEmpresa } from './contabil';

export interface ItemResposta {
  demo: Demonstracao;
  titulo: string;
  links: { tela: string; pdf: string; excel: string };
  principal: string;
  resumo: string[];
}
export type RespostaPedido =
  | { tipo: 'demonstracao'; pedido: PedidoContabil; previa: boolean; pendentes: number; itens: ItemResposta[]; oficial?: Record<Demonstracao, string> }
  | { tipo: 'atalho'; href: string; nome: string }
  | { tipo: 'aprovacao'; exceto: string[]; aprovar: number; fora: number; valorAprovar: number; valorFora: number; exemplosFora: string[] };

/** Lançamentos pendentes (sem decisão de aprovar) que entram ou ficam de fora de "aprovar todos menos ...". */
export function separarParaAprovar(lancs: Lancamento[], exceto: string[]) {
  const pendentes = lancs.filter((l) => !STATUS_NO_LIVRO.includes(l.status) && l.status !== 'Excluído');
  const fora = pendentes.filter((l) => exceto.length && temTermo(l, exceto));
  const foraIds = new Set(fora.map((l) => l.id));
  return { aprovar: pendentes.filter((l) => !foraIds.has(l.id)), fora };
}

const dc = (v: number) => (Math.abs(v) < 0.005 ? brl(0) : `${brl(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);

export async function atenderPedido(db: Db, u: Usuario, emp: Empresa, texto: string, hoje = new Date().toISOString().slice(0, 10)): Promise<RespostaPedido | null> {
  const aprov = pedidoDeAprovacao(texto);
  if (aprov) {
    // só mostra o que vai acontecer; a aprovação é feita no botão de confirmar
    const { aprovar, fora } = separarParaAprovar(await lancamentosDaEmpresa(db, emp), aprov.exceto);
    const soma = (xs: Lancamento[]) => xs.reduce((a, l) => a + l.valor, 0);
    return { tipo: 'aprovacao', exceto: aprov.exceto, aprovar: aprovar.length, fora: fora.length, valorAprovar: soma(aprovar), valorFora: soma(fora), exemplosFora: fora.slice(0, 5).map((l) => l.hist.slice(0, 90)) };
  }
  const pedido = interpretarPedido(texto, hoje);
  if (!pedido) {
    const a = atalhoDoPedido(texto);
    return a ? { tipo: 'atalho', ...a } : null;
  }
  const lancs = await lancamentosDaEmpresa(db, emp);
  const p = { de: pedido.de, ate: pedido.ate };
  // sem aprovação as demonstrações oficiais ficam vazias: se o pedido não disse, usa a prévia e avisa
  const pendentes = lancs.filter((l) => l.comp && l.comp <= p.ate && !STATUS_NO_LIVRO.includes(l.status)).length;
  const previa = pedido.previa ?? pendentes > 0;
  const itens = pedido.demonstracoes.map((d): ItemResposta => {
    const links = linksDoPedido(pedido, d, previa);
    const principal = pedido.formato === 'pdf' ? links.pdf : pedido.formato === 'excel' ? links.excel : links.tela;
    let resumo: string[] = [];
    if (d === 'balancete') {
      const b = balanceteModelo(lancs, p, previa);
      resumo = [...b.resumo.map((r) => `${r.grupo}: ${dc(r.saldo)}`), `Total devedor ${brl(b.totalDevedor)} × credor ${brl(b.totalCredor)}${Math.abs(b.totalDevedor - b.totalCredor) < 0.01 ? ' (fecha)' : ' (não fecha: confira)'}`];
    } else if (d === 'dre') {
      const r = dre(lancs, p, previa);
      resumo = [...r.linhas.filter((l) => l.destaque || l.nivel === 0).slice(0, 6).map((l) => `${l.rotulo}: ${brl(l.valor)}`)];
      if (!resumo.some((x) => /resultado/i.test(x))) resumo.push(`Resultado do período: ${brl(r.resultado)}`);
    } else {
      const b = balanco(lancs, p.ate, previa);
      resumo = [`Ativo: ${brl(b.ativo)}`, `Passivo: ${brl(b.passivo)}`, `Patrimônio líquido: ${brl(b.pl)} (resultado acumulado ${brl(b.resultadoAcumulado)})`, b.fecha ? 'Ativo = Passivo + PL (fecha)' : 'Ativo diferente de Passivo + PL: confira'];
    }
    const titulo = d === 'balanco' ? `${NOME_DEMO[d]} em ${p.ate.split('-').reverse().join('/')}` : `${NOME_DEMO[d]} ${periodoTexto(pedido)}`;
    return { demo: d, titulo, links, principal, resumo };
  });
  await auditar(db, u, { empresaId: emp.id, acao: 'Pediu demonstração à ZARO', entidade: texto.slice(0, 120), depois: itens.map((i) => i.titulo).join(', ') });
  const oficial = previa && pedido.previa === null
    ? Object.fromEntries(pedido.demonstracoes.map((d) => [d, linksDoPedido(pedido, d, false).tela])) as Record<Demonstracao, string>
    : undefined;
  return { tipo: 'demonstracao', pedido, previa, pendentes, itens, oficial };
}

/** A mesma resposta em Markdown, para a ZARO IA. */
export function respostaEmMarkdown(r: RespostaPedido): string {
  if (r.tipo === 'atalho') return `Isso fica em [${r.nome}](${r.href}).`;
  if (r.tipo === 'aprovacao') {
    const fora = r.exceto.length ? ` Ficam de fora ${r.fora} lançamento(s) com ${r.exceto.map((x) => `“${x}”`).join(', ')} (${brl(r.valorFora)}).` : '';
    return `Vou aprovar **${r.aprovar} lançamento(s)** pendentes (${brl(r.valorAprovar)}).${fora}\n\nPara confirmar, abra [Contabilidade → aprovar](/contabilidade?pedido=${encodeURIComponent(`aprovar todos${r.exceto.length ? ` menos ${r.exceto.join(' e ')}` : ''}`)}) e clique em **Confirmar aprovação**.`;
  }
  const partes = r.itens.map((i) => [
    `**${i.titulo}**${r.previa ? ' (prévia)' : ''}`,
    ...i.resumo.map((x) => `- ${x}`),
    `[Abrir na tela](${i.links.tela}) · [PDF](${i.links.pdf}) · [Excel](${i.links.excel})`,
  ].join('\n'));
  const aviso = r.previa && r.pendentes
    ? `\n\nFonte: lançamentos da Contabilidade. ${r.pendentes} lançamento(s) até ${r.pedido.ate.split('-').reverse().join('/')} ainda não foram aprovados e entram como prévia; a versão oficial sai depois de aprovar em [Lançamentos](/contabilidade?aba=lancamentos).`
    : '\n\nFonte: lançamentos aprovados da Contabilidade.';
  return partes.join('\n\n') + aviso;
}
