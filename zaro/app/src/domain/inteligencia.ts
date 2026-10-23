// Regras da Inteligência Financeira (Executivo, Caixa, Inadimplência, Pagamentos, Orçamento).
// Funções puras, sem banco: recebem registros reais e devolvem números; sem evidência, devolvem vazio.
import { addDias, arred } from './dinheiro';
import type { Lancamento } from './motor';
import { STATUS_NO_LIVRO } from './motor';

// ---------------------------------------------------------------- Executivo

/** Linhas gerenciais da DRE, sem dupla contagem: cada conta de resultado cai em uma só linha. */
export const LINHAS_GERENCIAIS = ['faturamento', 'deducoes', 'custo', 'pessoal', 'operacionais', 'tributosLucro', 'depreciacao', 'financeiras'] as const;
export type LinhaGerencial = (typeof LINHAS_GERENCIAIS)[number];

const IR_CSLL = /\b(irpj|csll)\b/i;

/** Classifica um lançamento de resultado (conta de débito ou crédito 3.x / 4.x) numa linha gerencial. */
export function linhaDaConta(conta: string, hist = ''): LinhaGerencial | null {
  if (conta.startsWith('3.1')) return 'faturamento';
  if (conta.startsWith('3.2')) return 'deducoes';
  if (conta.startsWith('4.1.1')) return 'custo';
  if (conta.startsWith('4.1.2')) return 'pessoal';
  if (conta === '4.1.3.10') return 'depreciacao';
  if (conta.startsWith('4.1.4') && IR_CSLL.test(hist)) return 'tributosLucro';
  if (conta.startsWith('4.1.3') || conta.startsWith('4.1.4')) return 'operacionais';
  if (conta.startsWith('4.2')) return 'financeiras';
  return null;
}

export type Totais = Record<LinhaGerencial, number>;
const zero = (): Totais => ({ faturamento: 0, deducoes: 0, custo: 0, pessoal: 0, operacionais: 0, tributosLucro: 0, depreciacao: 0, financeiras: 0 });

/** Soma por linha gerencial (receitas positivas, custos e despesas positivos) dos lançamentos filtrados. */
export function totaisGerenciais(lancs: Lancamento[], filtro: (l: Lancamento) => boolean, previa: boolean): Totais {
  const t = zero();
  for (const l of lancs) {
    if (!filtro(l) || (!previa && !STATUS_NO_LIVRO.includes(l.status))) continue;
    const ld = linhaDaConta(l.deb, l.hist), lc = linhaDaConta(l.cred, l.hist);
    // receita: crédito aumenta; custo/despesa: débito aumenta (estorno inverte o sinal)
    if (ld) t[ld] += ld === 'faturamento' ? -l.valor : l.valor;
    if (lc) t[lc] += lc === 'faturamento' ? l.valor : -l.valor;
  }
  for (const k of LINHAS_GERENCIAIS) t[k] = arred(t[k]);
  return t;
}

export function resultadoGerencial(t: Totais) {
  const liquida = arred(t.faturamento - t.deducoes);
  const lucro = arred(liquida - t.custo - t.pessoal - t.operacionais - t.tributosLucro - t.depreciacao - t.financeiras);
  // EBITDA = lucro antes de juros, IR/CSLL, depreciação e amortização
  const ebitda = arred(lucro + t.financeiras + t.tributosLucro + t.depreciacao);
  return { liquida, lucro, ebitda, margem: liquida ? arred((lucro / liquida) * 100) : null, margemEbitda: liquida ? arred((ebitda / liquida) * 100) : null };
}

/** Composição de cada R$ 100 faturados (receita bruta). Perda maior que a receita aparece como lucro negativo. */
export function composicao100(t: Totais) {
  if (t.faturamento <= 0) return null;
  const r = resultadoGerencial(t);
  const p = (v: number) => arred((v / t.faturamento) * 100);
  return [
    { chave: 'custo', rotulo: 'Custos dos produtos e serviços', valor: p(t.custo) },
    { chave: 'pessoal', rotulo: 'Pessoal', valor: p(t.pessoal) },
    { chave: 'tributos', rotulo: 'Tributos e deduções', valor: p(t.deducoes + t.tributosLucro) },
    { chave: 'operacionais', rotulo: 'Despesas operacionais', valor: p(t.operacionais + t.depreciacao) },
    { chave: 'financeiras', rotulo: 'Despesas financeiras', valor: p(t.financeiras) },
    { chave: 'lucro', rotulo: r.lucro < 0 ? 'Prejuízo' : 'Lucro líquido', valor: p(r.lucro) },
  ];
}

// ---------------------------------------------------------------- Caixa

export interface Previsto {
  venc: string | null;
  saldo: number;
  tipo: 'receber' | 'pagar';
  /** recebimento já vencido: incerto, fica fora salvo premissa */
  vencido?: boolean;
}

export interface Premissas {
  /** dias de atraso aplicados a todos os recebimentos */
  atrasoRecebimentos?: number;
  /** % de aumento nas saídas */
  aumentoDespesas?: number;
  /** % de redução nas entradas */
  reducaoFaturamento?: number;
  /** % dos recebimentos vencidos que entram em 30 dias (0 = conservador) */
  recuperacaoVencidos?: number;
  /** pagar hoje tudo o que vence nos próximos N dias */
  anteciparPagamentosDias?: number;
  financiamento?: { valor: number; data: string } | null;
}

/** Projeção diária de saldo; devolve o menor saldo, a data dele e o primeiro dia abaixo do mínimo. */
export function projecaoCaixa(saldoInicial: number, itens: Previsto[], hoje: string, dias: number, p: Premissas = {}, minimo = 0) {
  const fim = addDias(hoje, dias - 1);
  const ent = new Map<string, number>(), sai = new Map<string, number>();
  const soma = (m: Map<string, number>, d: string, v: number) => m.set(d, (m.get(d) || 0) + v);
  for (const i of itens) {
    if (i.tipo === 'receber') {
      let v = i.saldo * (1 - (p.reducaoFaturamento || 0) / 100);
      let d = i.venc;
      if (i.vencido || (d && d < hoje)) {
        v *= (p.recuperacaoVencidos || 0) / 100;
        d = addDias(hoje, 29);
      } else if (!d) continue;
      d = addDias(d!, p.atrasoRecebimentos || 0);
      if (d <= fim && v > 0) soma(ent, d, v);
    } else {
      if (!i.venc) continue;
      const v = i.saldo * (1 + (p.aumentoDespesas || 0) / 100);
      let d = i.venc < hoje ? hoje : i.venc; // vencido a pagar continua devido: entra hoje
      if (p.anteciparPagamentosDias && d <= addDias(hoje, p.anteciparPagamentosDias)) d = hoje;
      if (d <= fim) soma(sai, d, v);
    }
  }
  if (p.financiamento?.valor && p.financiamento.data >= hoje && p.financiamento.data <= fim) soma(ent, p.financiamento.data, p.financiamento.valor);
  const pontos: { data: string; entradas: number; saidas: number; saldo: number }[] = [];
  let s = saldoInicial;
  for (let d = hoje; d <= fim; d = addDias(d, 1)) {
    const e = arred(ent.get(d) || 0), x = arred(sai.get(d) || 0);
    s = arred(s + e - x);
    pontos.push({ data: d, entradas: e, saidas: x, saldo: s });
  }
  const menor = pontos.reduce((a, x) => (x.saldo < a.saldo ? x : a), pontos[0]);
  return {
    pontos,
    entradas: arred(pontos.reduce((a, x) => a + x.entradas, 0)),
    saidas: arred(pontos.reduce((a, x) => a + x.saidas, 0)),
    menor: menor ? { data: menor.data, saldo: menor.saldo } : null,
    abaixoDoMinimo: pontos.find((x) => x.saldo < minimo)?.data || null,
    negativo: pontos.find((x) => x.saldo < 0)?.data || null,
  };
}

/** Agrupa pontos diários em semanas (a partir de hoje). */
export function porSemana(pontos: { data: string; entradas: number; saidas: number; saldo: number }[]) {
  const out: { de: string; ate: string; entradas: number; saidas: number; saldo: number }[] = [];
  for (let i = 0; i < pontos.length; i += 7) {
    const b = pontos.slice(i, i + 7);
    out.push({ de: b[0].data, ate: b[b.length - 1].data, entradas: arred(b.reduce((a, x) => a + x.entradas, 0)), saidas: arred(b.reduce((a, x) => a + x.saidas, 0)), saldo: b[b.length - 1].saldo });
  }
  return out;
}

// ---------------------------------------------------------------- Inadimplência

export const FAIXAS_ATRASO = [[1, 15, '1–15 dias'], [16, 30, '16–30 dias'], [31, 60, '31–60 dias'], [61, 90, '61–90 dias'], [91, Infinity, 'Acima de 90 dias']] as const;

export interface ReceberAberto {
  id: string;
  cliente: string;
  doc: string | null;
  venc: string | null;
  saldo: number;
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 864e5);

/**
 * Indicadores de inadimplência sobre a carteira em aberto (saldo > 0).
 * Taxa = saldo vencido em aberto ÷ saldo total em aberto a receber (vencido + a vencer), na data.
 */
export function inadimplencia(abertos: ReceberAberto[], hoje: string) {
  const validos = abertos.filter((t) => t.saldo > 0.004);
  const vencidos = validos.filter((t) => t.venc && t.venc < hoje).map((t) => ({ ...t, dias: diasEntre(t.venc!, hoje) }));
  const totalAberto = arred(validos.reduce((a, t) => a + t.saldo, 0));
  const totalVencido = arred(vencidos.reduce((a, t) => a + t.saldo, 0));
  const faixas = FAIXAS_ATRASO.map(([de, ate, rotulo]) => {
    const f = vencidos.filter((t) => t.dias >= de && t.dias <= ate);
    const valor = arred(f.reduce((a, t) => a + t.saldo, 0));
    return { rotulo, valor, n: f.length, pct: totalVencido ? arred((valor / totalVencido) * 100) : 0 };
  });
  const chave = (t: ReceberAberto) => (t.doc || t.cliente).toLowerCase().trim();
  const porCliente = new Map<string, { cliente: string; doc: string | null; valor: number; titulos: number; maiorAtraso: number; ids: string[] }>();
  for (const t of vencidos) {
    const c = porCliente.get(chave(t)) || { cliente: t.cliente, doc: t.doc, valor: 0, titulos: 0, maiorAtraso: 0, ids: [] };
    c.valor = arred(c.valor + t.saldo); c.titulos++; c.maiorAtraso = Math.max(c.maiorAtraso, t.dias); c.ids.push(t.id);
    porCliente.set(chave(t), c);
  }
  return {
    totalAberto, totalVencido,
    taxa: totalAberto ? arred((totalVencido / totalAberto) * 100) : null,
    clientes: porCliente.size,
    atrasoMedio: vencidos.length ? Math.round(vencidos.reduce((a, t) => a + t.dias, 0) / vencidos.length) : null,
    atrasoMedioPonderado: totalVencido ? Math.round(vencidos.reduce((a, t) => a + t.dias * t.saldo, 0) / totalVencido) : null,
    faixas,
    ranking: [...porCliente.entries()].map(([k, v]) => ({ chave: k, ...v })).sort((a, b) => b.valor - a.valor),
  };
}

export const STATUS_COBRANCA = ['Ainda não contatado', 'Em cobrança', 'Em negociação', 'Acordo registrado', 'Promessa de pagamento', 'Revisão necessária'] as const;

// ---------------------------------------------------------------- Pagamentos

/**
 * Linha digitável de boleto bancário (47 dígitos): banco, valor e vencimento.
 * O fator de vencimento conta dias desde 07/10/1997 e reiniciou em 1000 no dia 22/02/2025;
 * entre as duas leituras possíveis, fica a mais próxima de hoje.
 */
export function lerLinhaDigitavel(entrada: string, hoje: string) {
  const d = entrada.replace(/\D/g, '');
  if (d.length !== 47) return null;
  const mod10 = (s: string) => {
    let soma = 0;
    [...s].reverse().forEach((c, i) => { let n = Number(c) * (i % 2 === 0 ? 2 : 1); if (n > 9) n -= 9; soma += n; });
    return String((10 - (soma % 10)) % 10);
  };
  const camposOk = mod10(d.slice(0, 9)) === d[9] && mod10(d.slice(10, 20)) === d[20] && mod10(d.slice(21, 31)) === d[31];
  const fator = Number(d.slice(33, 37));
  let venc: string | null = null;
  if (fator >= 1000) {
    const antigo = addDias('1997-10-07', fator), novo = addDias('2025-02-22', fator - 1000);
    venc = Math.abs(diasEntre(antigo, hoje)) <= Math.abs(diasEntre(novo, hoje)) ? antigo : novo;
  }
  return { banco: d.slice(0, 3), valor: Number(d.slice(37, 47)) / 100, venc, camposOk };
}

export interface TituloPagar {
  id: string;
  codigo: string;
  nome: string;
  doc: string | null;
  nf: string | null;
  valor: number;
  venc: string | null;
  aberto: boolean;
}

/** Possíveis duplicidades: mesmo fornecedor e mesma NF, ou mesmo fornecedor, mesmo valor e vencimentos a até 5 dias. */
export function duplicidades(lista: TituloPagar[]) {
  const out: { a: TituloPagar; b: TituloPagar; motivo: string }[] = [];
  const forn = (t: TituloPagar) => (t.doc || t.nome).toLowerCase().trim();
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
    const a = lista[i], b = lista[j];
    if (forn(a) !== forn(b) || !(a.aberto || b.aberto)) continue;
    if (a.nf && b.nf && a.nf === b.nf && Math.abs(a.valor - b.valor) < 0.01) out.push({ a, b, motivo: `mesma NF ${a.nf} e mesmo valor` });
    else if (Math.abs(a.valor - b.valor) < 0.01 && a.venc && b.venc && Math.abs(diasEntre(a.venc, b.venc)) <= 5 && !(a.nf && b.nf && a.nf !== b.nf)) out.push({ a, b, motivo: 'mesmo valor com vencimentos próximos' });
  }
  return out;
}

/** Valor fora do padrão: acima de 2× a mediana dos títulos do mesmo fornecedor (com ao menos 3 de histórico). */
export function foraDoPadrao(t: TituloPagar, historico: TituloPagar[]) {
  const forn = (x: TituloPagar) => (x.doc || x.nome).toLowerCase().trim();
  const vals = historico.filter((x) => x.id !== t.id && forn(x) === forn(t)).map((x) => x.valor).sort((a, b) => a - b);
  if (vals.length < 3) return null;
  const med = vals[Math.floor(vals.length / 2)];
  return t.valor > med * 2 ? { mediana: med } : null;
}

export const ETAPAS_PAGAMENTO = ['Documento recebido', 'Conferência', 'Título preparado', 'Aprovado', 'Agendado', 'Pago', 'Conciliado', 'Contabilizado'] as const;

// ---------------------------------------------------------------- Orçamento

export interface Limites {
  /** consumo (%) até onde é verde */
  verde: number;
  /** consumo (%) até onde é amarelo; acima é coral */
  amarelo: number;
}
export const LIMITES_PADRAO: Limites = { verde: 90, amarelo: 100 };

/**
 * Semáforo do orçamento. Despesa: consumo = realizado ÷ orçado; verde até o limite verde, amarelo até o
 * limite amarelo, coral acima. Receita: atingimento = realizado ÷ orçado; verde a partir de 100%,
 * amarelo dentro da mesma folga (amarelo − verde pontos abaixo da meta), coral abaixo disso.
 */
export function semaforo(orcado: number, realizado: number, natureza: 'receita' | 'despesa', l: Limites = LIMITES_PADRAO) {
  if (!orcado) return { status: realizado && natureza === 'despesa' ? ('coral' as const) : ('verde' as const), consumo: null as number | null };
  const consumo = arred((realizado / orcado) * 100);
  if (natureza === 'despesa') return { consumo, status: consumo <= l.verde ? ('verde' as const) : consumo <= l.amarelo ? ('amarelo' as const) : ('coral' as const) };
  const folga = Math.max(0, l.amarelo - l.verde);
  return { consumo, status: consumo >= 100 ? ('verde' as const) : consumo >= 100 - folga ? ('amarelo' as const) : ('coral' as const) };
}

/** Distribui um valor anual em 12 meses iguais (centavos na última). */
export function distribuirAnual(total: number) {
  const base = Math.floor((total * 100) / 12) / 100;
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? arred(total - base * 11) : base));
}

/** Projeção anual pelo ritmo: realizado no ano ÷ meses decorridos × 12. */
export const ritmoAnual = (realizadoAno: number, mesesDecorridos: number) => (mesesDecorridos > 0 ? arred((realizadoAno / mesesDecorridos) * 12) : null);
