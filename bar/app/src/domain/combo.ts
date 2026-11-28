// Combos do happy hour: vários produtos por um preço fechado (ex.: 2 long necks + batata 250 g
// por R$ 59,90). Valem só nas janelas de dia e horário (Manaus). Há itens fixos (a batata, as 6
// Corona do balde) e itens de escolha (o garçom escolhe as long necks). No pedido o combo vira:
//  - uma linha com o preço do combo, no primeiro item (o fixo, se houver);
//  - as demais linhas a R$ 0, só para o estoque e para a cozinha/bar prepararem.
// Assim o estoque baixa cada garrafa e a batata vai para a cozinha, e o total é o preço do combo.

import { FUSO_PROMOCAO } from './promocao';
import { ehSetor, type Setor } from './pedido';

export interface JanelaCombo {
  /** 0 = domingo ... 6 = sábado */
  dias: number[];
  inicio: string; // HH:MM
  fim: string; // HH:MM
}

export type ItemCombo =
  | { produtoId: string; quantidade: number; nome?: string | null } // fixo
  | { escolha: 'long-neck'; quantidade: number; excluir?: string[] }; // o garçom escolhe entre as cervejas de balde (menos as excluídas)

export interface Combo {
  id: string;
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  janelas: JanelaCombo[];
  itens: ItemCombo[];
  ativo: boolean;
}

export interface ComboSolicitado {
  comboId: string;
  /** produtoId -> quantidade escolhida (soma = quantidade de escolha do combo) */
  escolhas?: Record<string, number>;
}

export class ErroCombo extends Error {}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

function agoraLocal(agora: Date, fuso: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday')), seg: Number(v('hour')) * 3600 + Number(v('minute')) * 60 + Number(v('second')) };
}

/** Milissegundos até o fim da janela que vale agora; null se nenhuma vale. */
/** Sem horário: todos os dias, o dia inteiro. Vale direto, sem pausa à meia-noite. */
export const comboSemHorario = (js: JanelaCombo[]) => js.some((j) => j.dias.length === 7 && j.inicio === '00:00' && j.fim === '23:59');

export function restanteDoCombo(c: Pick<Combo, 'ativo' | 'janelas'>, agora: Date, fuso = FUSO_PROMOCAO): number | null {
  if (!c.ativo) return null;
  if (comboSemHorario(c.janelas)) return 24 * 3600_000;
  const { dia, seg } = agoraLocal(agora, fuso);
  for (const j of c.janelas) {
    if (!HORA.test(j.inicio) || !HORA.test(j.fim) || !j.dias.includes(dia)) continue;
    const ini = min(j.inicio) * 60;
    const fim = min(j.fim) * 60;
    if (seg >= ini && seg < fim) return (fim - seg) * 1000 - agora.getMilliseconds();
  }
  return null;
}

/** Long necks que não entram nas escolhas deste combo (ex.: a Original, que já tem a promoção em dobro). */
export const excluidasDoCombo = (c: Pick<Combo, 'itens'>) => [...new Set(c.itens.flatMap((i) => ('escolha' in i ? i.excluir ?? [] : [])))];

/** Quantas long necks o garçom precisa escolher. */
export const escolhasDoCombo = (c: Pick<Combo, 'itens'>) => c.itens.reduce((a, i) => a + ('escolha' in i ? i.quantidade : 0), 0);

/** "Qua, Qui 17:00-20:00; Sex 16:00-20:00" */
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function textoJanelas(js: JanelaCombo[]) {
  if (comboSemHorario(js)) return 'Sem horário';
  return js.map((j) => `${j.dias.length === 7 ? 'Todos os dias' : j.dias.map((d) => DIAS[d]).join(', ')} ${j.inicio}-${j.fim}`).join('; ');
}
export function lerJanelas(texto: string): JanelaCombo[] {
  if (/sem\s*hor/i.test(texto)) return [{ dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '23:59' }];
  const out: JanelaCombo[] = [];
  for (const parte of texto.split(';').map((x) => x.trim()).filter(Boolean)) {
    const m = parte.match(/^(.*?)\s*(\d{1,2}:\d{2})\s*[-–a]+\s*(\d{1,2}:\d{2})$/i);
    if (!m) throw new ErroCombo(`Não entendi o horário "${parte}". Use, por exemplo: Qua, Qui 17:00-20:00; Sex 16:00-20:00`);
    const pad = (h: string) => h.padStart(5, '0');
    const nomes = m[1].toLowerCase();
    const dias = /todos/.test(nomes)
      ? [0, 1, 2, 3, 4, 5, 6]
      : DIAS.map((d, i) => (nomes.includes(d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) || nomes.includes(d.toLowerCase()) ? i : -1)).filter((i) => i >= 0);
    if (!dias.length) throw new ErroCombo(`Faltam os dias em "${parte}".`);
    const j = { dias, inicio: pad(m[2]), fim: pad(m[3]) };
    if (!HORA.test(j.inicio) || !HORA.test(j.fim) || min(j.inicio) >= min(j.fim)) throw new ErroCombo(`Horário inválido em "${parte}".`);
    out.push(j);
  }
  if (!out.length) throw new ErroCombo('Informe pelo menos um dia e horário.');
  return out;
}

export interface ProdutoDoCombo {
  id: string;
  nome: string;
  setor: string;
  ativo: boolean;
  balde?: boolean | null;
}

export interface LinhaDeCombo {
  produtoId: string;
  nome: string;
  setor: Setor;
  quantidade: number;
  precoCentavos: number;
  subtotalCentavos: number;
  balde: number | null;
  unidades: number;
  promocaoId: string | null;
  comboId: string;
}

/** Transforma os combos pedidos nas linhas do pedido (preço no primeiro item, o resto a R$ 0). */
export function linhasDosCombos(pedidos: ComboSolicitado[], combos: Combo[], produtos: ProdutoDoCombo[]): LinhaDeCombo[] {
  if (!Array.isArray(pedidos) || !pedidos.length) return [];
  if (pedidos.length > 30) throw new ErroCombo('Combos demais em um pedido.');
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas: LinhaDeCombo[] = [];
  for (const pedido of pedidos) {
    const c = combos.find((x) => x.id === pedido?.comboId);
    if (!c) throw new ErroCombo('Esse combo não está valendo agora (fora do dia ou do horário).');
    const componentes: { produtoId: string; quantidade: number }[] = [];
    for (const it of c.itens) if (!('escolha' in it)) componentes.push({ produtoId: it.produtoId, quantidade: it.quantidade });
    const precisa = escolhasDoCombo(c);
    if (precisa) {
      const esc = pedido.escolhas || {};
      let soma = 0;
      for (const [id, q] of Object.entries(esc)) {
        if (!Number.isInteger(q) || q < 0) throw new ErroCombo('Quantidade inválida no combo.');
        if (!q) continue;
        const p = porId.get(id);
        if (!p || !p.ativo || !p.balde) throw new ErroCombo(`No ${c.nome} só entram as long necks.`);
        if (excluidasDoCombo(c).includes(id)) throw new ErroCombo(`${p.nome} não entra no ${c.nome}.`);
        soma += q;
        componentes.push({ produtoId: id, quantidade: q });
      }
      if (soma !== precisa) throw new ErroCombo(`Escolha ${precisa} long necks para o ${c.nome}.`);
    }
    componentes.forEach((comp, i) => {
      const p = porId.get(comp.produtoId);
      if (!p || !p.ativo) throw new ErroCombo(`Um produto do ${c.nome} está indisponível.`);
      if (!ehSetor(p.setor)) throw new ErroCombo(`${p.nome} está sem setor de preparo.`);
      const nomeFixo = c.itens.find((it) => !('escolha' in it) && it.produtoId === comp.produtoId) as { nome?: string | null } | undefined;
      const nomeItem = nomeFixo?.nome || p.nome;
      if (i === 0)
        // a linha que leva o preço: 1 combo, com as unidades deste item para o estoque
        linhas.push({ produtoId: p.id, nome: `${c.nome} · ${nomeItem}${comp.quantidade > 1 ? ` (${comp.quantidade} un.)` : ''}`, setor: p.setor, quantidade: 1, precoCentavos: c.precoCentavos, subtotalCentavos: c.precoCentavos, balde: null, unidades: comp.quantidade, promocaoId: null, comboId: c.id });
      else linhas.push({ produtoId: p.id, nome: `${c.nome} · ${nomeItem}`, setor: p.setor, quantidade: comp.quantidade, precoCentavos: 0, subtotalCentavos: 0, balde: null, unidades: 1, promocaoId: null, comboId: c.id });
    });
  }
  return linhas;
}
