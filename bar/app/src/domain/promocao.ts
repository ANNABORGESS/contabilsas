// Promoções programadas: um produto sai em combo (ex.: 2 Original por R$ 12) nos dias e no horário
// configurados, no fuso do bar. O preço é aplicado sozinho: a cada N unidades do produto no pedido,
// uma linha de combo; o que sobra (quantidade ímpar) vai pelo preço normal. O estoque baixa todas
// as unidades entregues. Depois do horário, pedidos novos voltam ao preço normal.

export const FUSO_PROMOCAO = 'America/Manaus';
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
/** Pagamento cobrado na maquininha pouco antes do fim ainda vale a promoção ao confirmar. */
export const TOLERANCIA_MS = 15 * 60_000;

export interface Promocao {
  id: string;
  nome: string;
  produtoId: string;
  quantidadeCombo: number;
  precoComboCentavos: number;
  /** 0 = domingo ... 6 = sábado */
  dias: number[];
  inicio: string; // HH:MM
  fim: string; // HH:MM
  ativa: boolean;
  destaque?: string | null;
  /** só nestas mesas (números; Balcão 10 = 1010). Vazio = todas */
  mesas?: number[] | null;
}

export class ErroPromocao extends Error {}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

function agoraLocal(agora: Date, fuso: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  return { dia, segundos: Number(v('hour')) * 3600 + Number(v('minute')) * 60 + Number(v('second')) };
}

/** Milissegundos até o fim, se está valendo agora; null se não está. */
export function restanteDaPromocao(p: Promocao, agora: Date, fuso = FUSO_PROMOCAO): number | null {
  if (!p.ativa || !HORA.test(p.inicio) || !HORA.test(p.fim)) return null;
  const { dia, segundos } = agoraLocal(agora, fuso);
  if (!p.dias.includes(dia)) return null;
  const ini = minutos(p.inicio) * 60;
  const fim = minutos(p.fim) * 60;
  if (segundos < ini || segundos >= fim) return null;
  return (fim - segundos) * 1000 - agora.getMilliseconds();
}

export const promocaoValendo = (p: Promocao, agora: Date, fuso = FUSO_PROMOCAO) => restanteDaPromocao(p, agora, fuso) !== null;

/** Confere o cadastro feito pelo administrador. */
export function validarPromocao(e: Record<string, unknown>): Omit<Promocao, 'id'> {
  const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
  if (nome.length < 3 || nome.length > 60) throw new ErroPromocao('Dê um nome à promoção (3 a 60 letras).');
  if (typeof e.produtoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(e.produtoId)) throw new ErroPromocao('Escolha o produto.');
  const q = Number(e.quantidadeCombo);
  if (!Number.isInteger(q) || q < 2 || q > 12) throw new ErroPromocao('O combo leva de 2 a 12 unidades.');
  const preco = Number(e.precoComboCentavos);
  if (!Number.isInteger(preco) || preco < 1 || preco > 1_000_00) throw new ErroPromocao('Preço do combo inválido.');
  const dias = Array.isArray(e.dias) ? [...new Set(e.dias.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
  if (!dias.length) throw new ErroPromocao('Marque pelo menos um dia da semana.');
  const inicio = String(e.inicio || '');
  const fim = String(e.fim || '');
  if (!HORA.test(inicio) || !HORA.test(fim)) throw new ErroPromocao('Horário inválido (use 00:00).');
  if (minutos(inicio) >= minutos(fim)) throw new ErroPromocao('O início precisa ser antes do encerramento, no mesmo dia.');
  const destaque = typeof e.destaque === 'string' && e.destaque.trim() ? e.destaque.trim().slice(0, 80) : null;
  const mesas = Array.isArray(e.mesas) ? [...new Set(e.mesas.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999).sort((a, b) => a - b) : [];
  return { nome, produtoId: e.produtoId, quantidadeCombo: q, precoComboCentavos: preco, dias, inicio, fim, ativa: e.ativa !== false, destaque, mesas: mesas.length ? mesas : null };
}

export interface LinhaComPromo {
  produtoId: string;
  nome: string;
  quantidade: number;
  precoCentavos: number;
  subtotalCentavos: number;
  balde: number | null;
  /** unidades do produto em cada item (2 no combo "em dobro") */
  unidades: number;
  promocaoId: string | null;
}

/** Troca cada grupo de N unidades por uma linha de combo; o resto fica no preço normal. */
export function aplicarPromocoes<L extends LinhaComPromo>(linhas: L[], promocoes: Pick<Promocao, 'id' | 'nome' | 'produtoId' | 'quantidadeCombo' | 'precoComboCentavos'>[]): L[] {
  const porProduto = new Map(promocoes.map((p) => [p.produtoId, p]));
  const saida: L[] = [];
  for (const l of linhas) {
    const p = porProduto.get(l.produtoId);
    const combos = p && !l.promocaoId ? Math.floor(l.quantidade / p.quantidadeCombo) : 0;
    if (!p || !combos) {
      saida.push(l);
      continue;
    }
    saida.push({
      ...l,
      nome: `${l.nome} · ${p.nome} (${p.quantidadeCombo} un.)`,
      quantidade: combos,
      precoCentavos: p.precoComboCentavos,
      subtotalCentavos: combos * p.precoComboCentavos,
      unidades: p.quantidadeCombo,
      promocaoId: p.id,
    });
    const resto = l.quantidade - combos * p.quantidadeCombo;
    if (resto) saida.push({ ...l, quantidade: resto, subtotalCentavos: resto * l.precoCentavos });
  }
  return saida;
}

/** "1h 23min" / "12min" / "menos de 1min" para a contagem regressiva. */
export function textoRestante(ms: number) {
  if (ms < 60_000) return 'menos de 1min';
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m}min`;
}

export interface ResultadoPromocao {
  combos: number;
  unidades: number;
  faturadoCentavos: number;
  custoCentavos: number;
  precoNormalCentavos: number;
  descontoCentavos: number;
}

/** Relatório: combos que valeram (sem cancelados), unidades entregues, faturado, custo e desconto dado. */
export function resultadoPromocao(itens: { quantidade: number; quantidadeCancelada: number; unidades: number; precoCentavos: number }[], custoUnitario: number | null, precoNormalUnitario: number): ResultadoPromocao {
  let combos = 0;
  let unidades = 0;
  let faturado = 0;
  for (const i of itens) {
    const q = i.quantidade - i.quantidadeCancelada;
    combos += q;
    unidades += q * i.unidades;
    faturado += q * i.precoCentavos;
  }
  const normal = unidades * precoNormalUnitario;
  return { combos, unidades, faturadoCentavos: faturado, custoCentavos: unidades * (custoUnitario ?? 0), precoNormalCentavos: normal, descontoCentavos: normal - faturado };
}

/** A promoção vale nesta mesa? Sem lista de mesas, vale em todas. */
export const valeNaMesa = (p: { mesas?: number[] | null }, numero: number) => !p.mesas || !p.mesas.length || p.mesas.includes(numero);

/** "Balcão 10, 5, 12" -> [1010, 5, 12] (Balcão N = 1000 + N; "balcão" sozinho = 0). */
export function lerMesas(texto: string): number[] {
  const out: number[] = [];
  for (const t of texto.split(/[,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    const b = t.match(/^balc[aã]o\s*(\d+)?$/);
    if (b) out.push(b[1] ? 1000 + Number(b[1]) : 0);
    else if (/^(mesa\s*)?\d+$/.test(t)) out.push(Number(t.replace(/\D/g, '')));
  }
  return [...new Set(out)];
}
