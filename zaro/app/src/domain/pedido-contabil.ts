// Pedido em português ("balancete de 2026 até setembro em PDF", "DRE de março", "balanço em 30/09/2026 no Excel")
// vira o relatório certo da Contabilidade: qual demonstração, que período, modelo, formato e se é prévia.
// Não usa IA: regras fixas, para funcionar sempre e dar sempre o mesmo resultado.

export type Demonstracao = 'balancete' | 'dre' | 'balanco';
export type Formato = 'tela' | 'pdf' | 'excel';

export interface PedidoContabil {
  demonstracoes: Demonstracao[];
  de: string; // yyyy-mm
  ate: string; // yyyy-mm
  formato: Formato;
  modelo: 'escritorio' | 'zaro';
  /** null = o pedido não disse; quem atende decide (prévia quando há lançamentos sem aprovação) */
  previa: boolean | null;
}

export const NOME_DEMO: Record<Demonstracao, string> = { balancete: 'Balancete', dre: 'DRE', balanco: 'Balanço Patrimonial' };

const MESES: [RegExp, number][] = [
  [/\bjan(eiro)?\b/, 1], [/\bfev(ereiro)?\b/, 2], [/\bmar(ç|c)?(o)?\b/, 3], [/\babr(il)?\b/, 4], [/\bmai(o)?\b/, 5], [/\bjun(ho)?\b/, 6],
  [/\bjul(ho)?\b/, 7], [/\bago(sto)?\b/, 8], [/\bset(embro)?\b/, 9], [/\bout(ubro)?\b/, 10], [/\bnov(embro)?\b/, 11], [/\bdez(embro)?\b/, 12],
];
const p2 = (n: number) => String(n).padStart(2, '0');

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Mês citado no trecho (nome ou número "09/2026", "30/09/2026"), com o ano se vier junto. */
function mesDe(trecho: string): { mes: number; ano?: number } | null {
  const num = trecho.match(/\b(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})\b/) || trecho.match(/\b(\d{4})-(\d{2})\b/);
  if (num) {
    const [a, b] = num[0].includes('-') ? [Number(num[2]), Number(num[1])] : [Number(num[1]), Number(num[2])];
    if (a >= 1 && a <= 12) return { mes: a, ano: b };
  }
  // "mar" e "mai" isolados só valem como mês se não fizerem parte de outra palavra
  for (const [re, n] of MESES) if (re.test(trecho)) {
    const ano = trecho.match(/\b(20\d{2})\b/);
    return { mes: n, ano: ano ? Number(ano[1]) : undefined };
  }
  return null;
}

export function interpretarPedido(texto: string, hoje = new Date().toISOString().slice(0, 10)): PedidoContabil | null {
  const t = semAcento(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const demonstracoes: Demonstracao[] = [];
  if (/balancete/.test(t)) demonstracoes.push('balancete');
  if (/\bdre\b|demonstra\w* d[oe] resultado|resultado do (exercicio|periodo|mes|ano)/.test(t)) demonstracoes.push('dre');
  if (/balan[cç]o(?!te)|patrimonial/.test(t)) demonstracoes.push('balanco');
  if (/(todas|todos|as tres|demonstra[cç]oes|fechamento)/.test(t) && !demonstracoes.length) demonstracoes.push('balancete', 'dre', 'balanco');
  if (!demonstracoes.length) return null;

  const anoHoje = Number(hoje.slice(0, 4));
  const anoTxt = t.match(/\b(20\d{2})\b/);
  const ano = anoTxt ? Number(anoTxt[1]) : anoHoje;
  const mesAtual = Number(hoje.slice(5, 7));
  let de = `${ano}-01`;
  let ate = ano === anoHoje ? `${ano}-${p2(mesAtual)}` : `${ano}-12`;

  const tri = t.match(/\b([1-4])\s*(?:o|º|°)?\s*trimestre\b/) || t.match(/\btrimestre\s*([1-4])\b/);
  const sem = t.match(/\b([12])\s*(?:o|º|°)?\s*semestre\b/);
  const intervalo = t.match(/\b(?:de|entre)\s+(.+?)\s+(?:a|ate|e)\s+(.+)$/);
  const ateMatch = t.match(/\b(?:ate|em|ate o fim de|no fim de|fim de)\s+(.+)$/);
  if (tri) {
    const n = Number(tri[1]);
    de = `${ano}-${p2(n * 3 - 2)}`; ate = `${ano}-${p2(n * 3)}`;
  } else if (sem) {
    const n = Number(sem[1]);
    de = `${ano}-${p2(n * 6 - 5)}`; ate = `${ano}-${p2(n * 6)}`;
  } else if (intervalo && mesDe(intervalo[1]) && mesDe(intervalo[2])) {
    const a = mesDe(intervalo[1])!; const b = mesDe(intervalo[2])!;
    const anoB = b.ano ?? ano; const anoA = a.ano ?? (a.mes <= b.mes ? anoB : anoB - 1);
    de = `${anoA}-${p2(a.mes)}`; ate = `${anoB}-${p2(b.mes)}`;
  } else if (ateMatch && mesDe(ateMatch[1])) {
    const m = mesDe(ateMatch[1])!;
    const a = m.ano ?? ano;
    // balanço é posição numa data; balancete e DRE "até setembro" acumulam desde janeiro
    de = demonstracoes.length === 1 && demonstracoes[0] !== 'balanco' && /\bem\b/.test(t) && !/\bate\b/.test(t) ? `${a}-${p2(m.mes)}` : `${a}-01`;
    ate = `${a}-${p2(m.mes)}`;
  } else if (/\b(mes|mensal)\b/.test(t) && !mesDe(t)) {
    de = ate = `${ano}-${p2(ano === anoHoje ? mesAtual : 12)}`;
  } else if (mesDe(t)) {
    const m = mesDe(t)!;
    const a = m.ano ?? ano;
    de = ate = `${a}-${p2(m.mes)}`;
    if (demonstracoes.every((d) => d === 'balanco')) de = `${a}-01`;
  }
  if (de > ate) [de, ate] = [ate, de];

  const formato: Formato = /\b(excel|planilha|xlsx|xls)\b/.test(t) ? 'excel' : /\b(pdf|imprimir|impressao|imprime)\b/.test(t) ? 'pdf' : 'tela';
  const modelo = /(modelo|plano)( de contas)? (do )?zaro|detalhad/.test(t) ? 'zaro' : 'escritorio';
  const previa = /previa|nao aprovad|sem aprova|com tudo|todos os lancamentos/.test(t) ? true : /so aprovad|apenas aprovad|somente aprovad|oficial/.test(t) ? false : null;
  return { demonstracoes, de, ate, formato, modelo, previa };
}

/** Endereços da ZARO para o pedido: tela da Contabilidade, página de impressão (PDF) e Excel. */
export function linksDoPedido(p: PedidoContabil, d: Demonstracao, previa: boolean) {
  const q = new URLSearchParams({ aba: d, per: 'pers', de: p.de, ate: p.ate, ref: p.ate });
  if (previa) q.set('previa', '1');
  if (d === 'balancete' && p.modelo === 'zaro') q.set('modelo', 'zaro');
  const s = q.toString();
  return { tela: `/contabilidade?${s}`, pdf: `/relatorio-contabil?${s}`, excel: `/contabilidade/exportar?${s}` };
}

export const periodoTexto = (p: Pick<PedidoContabil, 'de' | 'ate'>) =>
  p.de === p.ate ? p.de.split('-').reverse().join('/') : `${p.de.split('-').reverse().join('/')} a ${p.ate.split('-').reverse().join('/')}`;

/** Outros pedidos comuns que não são demonstração: vão direto para a tela certa. */
export const ATALHOS: [RegExp, string, string][] = [
  [/impostos? a recuperar|credito d[eo] icms|credito de ipi|creditos? (de )?impost/, '/fiscal/creditos', 'Fiscal → Impostos a recuperar'],
  [/concilia|extrato/, '/financeiro?aba=conciliacao', 'Financeiro → Conciliação bancária'],
  [/folha|holerite|salario/, '/pessoal', 'Departamento Pessoal'],
  [/lancamentos? (a|para) aprovar|aprovar lancamento|em revisao/, '/contabilidade?aba=lancamentos&st=Em%20revis%C3%A3o', 'Contabilidade → Lançamentos em revisão'],
  [/excluid/, '/contabilidade?aba=lancamentos&st=Exclu%C3%ADdo', 'Contabilidade → Lançamentos excluídos'],
  [/imobilizad|deprecia/, '/contabilidade?aba=balancete', 'Contabilidade → Balancete (imobilizado e depreciação)'],
  [/apuracao|lucro presumido|irpj|csll|\bpis\b|cofins/, '/fiscal', 'Fiscal → Apuração'],
];

export function atalhoDoPedido(texto: string) {
  const t = semAcento(texto || '');
  const a = ATALHOS.find(([re]) => re.test(t));
  return a ? { href: a[1], nome: a[2] } : null;
}
