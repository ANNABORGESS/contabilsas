// Balancete, DRE e Balanço a partir dos lançamentos. Só entram no livro os lançamentos
// aprovados, contabilizados ou estornados (e o inverso do estorno), salvo na prévia.
import { arred } from './dinheiro';
import { STATUS_NO_LIVRO, type Lancamento } from './motor';
import { naturezaConta, nomeConta } from './plano-contas';

export interface Periodo {
  de: string; // competência inicial yyyy-mm
  ate: string; // competência final yyyy-mm
}

export const noLivro = (l: Lancamento, previa = false) => previa || STATUS_NO_LIVRO.includes(l.status);

export interface LinhaBalancete {
  conta: string;
  nome: string;
  natureza: 'D' | 'C';
  anterior: number;
  debitos: number;
  creditos: number;
  final: number;
}

const ehResultado = (conta: string) => conta.startsWith('3') || conta.startsWith('4');
export const CONTA_LUCROS_ACUMULADOS = '2.3.2.01';

/** Saldo pela natureza da conta: positivo = saldo normal. */
const saldo = (conta: string, d: number, c: number) => (naturezaConta(conta) === 'D' ? d - c : c - d);

export function balancete(lancs: Lancamento[], p: Periodo, previa = false): { linhas: LinhaBalancete[]; totalDebitos: number; totalCreditos: number } {
  const ant = new Map<string, { d: number; c: number }>();
  const per = new Map<string, { d: number; c: number }>();
  const inicioAno = `${p.de.slice(0, 4)}-01`;
  for (const l of lancs) {
    if (!noLivro(l, previa) || !l.comp || l.comp > p.ate) continue;
    const alvo = l.comp >= p.de ? per : ant;
    for (const [lancada, lado] of [[l.deb, 'd'], [l.cred, 'c']] as const) {
      // contas de resultado zeram a cada exercício: o resultado de anos anteriores já está em lucros acumulados
      const conta = alvo === ant && ehResultado(lancada) && l.comp < inicioAno ? CONTA_LUCROS_ACUMULADOS : lancada;
      const x = alvo.get(conta) || { d: 0, c: 0 };
      x[lado] += l.valor;
      alvo.set(conta, x);
    }
  }
  const contas = [...new Set([...ant.keys(), ...per.keys()])].sort();
  const linhas = contas.map((conta) => {
    const a = ant.get(conta) || { d: 0, c: 0 };
    const m = per.get(conta) || { d: 0, c: 0 };
    const anterior = arred(saldo(conta, a.d, a.c));
    return { conta, nome: nomeConta(conta), natureza: naturezaConta(conta), anterior, debitos: arred(m.d), creditos: arred(m.c), final: arred(anterior + saldo(conta, m.d, m.c)) };
  });
  return {
    linhas,
    totalDebitos: arred(linhas.reduce((s, l) => s + l.debitos, 0)),
    totalCreditos: arred(linhas.reduce((s, l) => s + l.creditos, 0)),
  };
}

export interface LinhaBalanceteGrupo {
  conta: string;
  nome: string;
  nivel: number; // 1 = grupo (Ativo), 2 = subgrupo, 3 = conta sintética, 4 = analítica
  sintetica: boolean;
  anterior: number; // positivo = devedor, negativo = credor
  debitos: number;
  creditos: number;
  final: number; // positivo = devedor, negativo = credor
}

/** Balancete com as contas sintéticas (1, 1.1, 1.1.1…) somando as analíticas, saldos com o lado D/C pelo sinal. */
export function balanceteComGrupos(linhas: LinhaBalancete[]): LinhaBalanceteGrupo[] {
  const sd = (v: number, nat: 'D' | 'C') => (nat === 'D' ? v : -v);
  const mapa = new Map<string, LinhaBalanceteGrupo>();
  for (const l of linhas) {
    const partes = l.conta.split('.');
    for (let n = 1; n < partes.length; n++) {
      const g = partes.slice(0, n).join('.');
      const x = mapa.get(g) || { conta: g, nome: nomeConta(g), nivel: n, sintetica: true, anterior: 0, debitos: 0, creditos: 0, final: 0 };
      x.anterior = arred(x.anterior + sd(l.anterior, l.natureza));
      x.debitos = arred(x.debitos + l.debitos);
      x.creditos = arred(x.creditos + l.creditos);
      x.final = arred(x.final + sd(l.final, l.natureza));
      mapa.set(g, x);
    }
    mapa.set(l.conta, { conta: l.conta, nome: l.nome, nivel: partes.length, sintetica: false, anterior: sd(l.anterior, l.natureza), debitos: l.debitos, creditos: l.creditos, final: sd(l.final, l.natureza) });
  }
  const chave = (c: string) => c.split('.').map((x) => x.padStart(4, '0')).join('.');
  return [...mapa.values()].sort((a, b) => chave(a.conta).localeCompare(chave(b.conta)));
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Período das demonstrações a partir dos filtros da tela (mês, trimestre, ano ou personalizado). */
export function periodoContabil(sp: { per?: string; ref?: string; de?: string; ate?: string }, comps: string[], hoje = new Date().toISOString().slice(0, 7)): Periodo & { titulo: string } {
  const ref = /^\d{4}-\d{2}$/.test(sp.ref || '') ? sp.ref! : comps.filter((c) => c && c <= hoje).sort().pop() || hoje;
  const ano = ref.slice(0, 4);
  switch (sp.per) {
    case 'mes': return { de: ref, ate: ref, titulo: `${MESES_ABREV[+ref.slice(5) - 1]}/${ano}` };
    case 'tri': { const t = Math.floor((+ref.slice(5) - 1) / 3); return { de: `${ano}-${String(t * 3 + 1).padStart(2, '0')}`, ate: `${ano}-${String(t * 3 + 3).padStart(2, '0')}`, titulo: `${t + 1}º trimestre/${ano}` }; }
    case 'pers': { const de = /^\d{4}-\d{2}$/.test(sp.de || '') ? sp.de! : `${ano}-01`; const ate = /^\d{4}-\d{2}$/.test(sp.ate || '') && sp.ate! >= de ? sp.ate! : ref; return { de, ate, titulo: `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}` }; }
    default: return { de: `${ano}-01`, ate: `${ano}-12`, titulo: `Anual ${ano}` };
  }
}

export interface LinhaDemo {
  rotulo: string;
  valor: number;
  nivel: 0 | 1 | 2;
  destaque?: boolean;
}

function movimentoPorConta(lancs: Lancamento[], p: Periodo, previa: boolean) {
  const m = new Map<string, number>();
  for (const l of lancs) {
    if (!noLivro(l, previa) || !l.comp || l.comp < p.de || l.comp > p.ate) continue;
    m.set(l.deb, (m.get(l.deb) || 0) + (naturezaConta(l.deb) === 'D' ? l.valor : -l.valor));
    m.set(l.cred, (m.get(l.cred) || 0) + (naturezaConta(l.cred) === 'C' ? l.valor : -l.valor));
  }
  return m;
}
const somaPrefixo = (m: Map<string, number>, prefixo: string) => arred([...m].filter(([c]) => c.startsWith(prefixo)).reduce((s, [, v]) => s + v, 0));

export function dre(lancs: Lancamento[], p: Periodo, previa = false): { linhas: LinhaDemo[]; resultado: number } {
  const m = movimentoPorConta(lancs, p, previa);
  const bruta = somaPrefixo(m, '3.1');
  const deducoes = somaPrefixo(m, '3.2');
  const liquida = arred(bruta - deducoes);
  const custo = somaPrefixo(m, '4.1.1');
  const lucroBruto = arred(liquida - custo);
  const pessoal = somaPrefixo(m, '4.1.2');
  const operacionais = arred(somaPrefixo(m, '4.1.3') + somaPrefixo(m, '4.1.4'));
  const financeiro = somaPrefixo(m, '4.2');
  const resultado = arred(lucroBruto - pessoal - operacionais - financeiro);
  return {
    resultado,
    linhas: [
      { rotulo: 'Receita bruta de vendas e serviços', valor: bruta, nivel: 0 },
      { rotulo: '(−) Deduções: tributos sobre vendas', valor: -deducoes, nivel: 2 },
      { rotulo: 'Receita líquida', valor: liquida, nivel: 0, destaque: true },
      { rotulo: '(−) Custo de materiais e serviços', valor: -custo, nivel: 2 },
      { rotulo: 'Lucro bruto', valor: lucroBruto, nivel: 0, destaque: true },
      { rotulo: '(−) Despesas com pessoal e encargos', valor: -pessoal, nivel: 2 },
      { rotulo: '(−) Despesas operacionais', valor: -operacionais, nivel: 2 },
      { rotulo: '(−) Resultado financeiro', valor: -financeiro, nivel: 2 },
      { rotulo: 'Resultado do período', valor: resultado, nivel: 0, destaque: true },
    ],
  };
}

export function balanco(lancs: Lancamento[], ate: string, previa = false) {
  const b = balancete(lancs, { de: ate, ate }, previa);
  // no ativo, conta credora (ex.: depreciação acumulada) reduz; no passivo, conta devedora reduz
  const valor = (l: LinhaBalancete) => (l.conta.startsWith('1') === (l.natureza === 'D') ? l.final : -l.final);
  const contas = (prefixo: string) => b.linhas.filter((l) => l.conta.startsWith(prefixo)).map((l) => ({ conta: l.conta, nome: l.nome, valor: valor(l) }));
  const soma = (prefixo: string) => arred(contas(prefixo).reduce((s, c) => s + c.valor, 0));
  // resultado acumulado (receitas menos custos e despesas até a data) entra no patrimônio líquido
  const resultadoAcumulado = dre(lancs, { de: '0000-01', ate }, previa).resultado;
  const ativo = soma('1');
  const passivo = arred(soma('2.1') + soma('2.2'));
  const pl = arred(soma('2.3') + resultadoAcumulado);
  return { ativo, passivo, pl, resultadoAcumulado, fecha: Math.abs(ativo - passivo - pl) < 0.01, contasAtivo: contas('1'), contasPassivo: contas('2') };
}
