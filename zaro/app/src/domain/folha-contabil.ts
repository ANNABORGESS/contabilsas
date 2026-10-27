// Contabilização da folha a partir do resumo (Listagem Sintética) do sistema de folha.
// O ZARO não calcula a folha: lança o que o resumo informa, no último mês do período do resumo.
import { arred } from './dinheiro';
import type { Lancamento } from './motor';

export interface RubricaFolha { codigo: string; nome: string; valor: number }
export interface ResumoFolha {
  de: string; // yyyy-mm
  ate: string; // yyyy-mm
  vencimentos: RubricaFolha[];
  descontos: RubricaFolha[];
  bases: RubricaFolha[];
  totalVencimentos: number;
  totalDescontos: number;
  liquido: number;
  /** nomes dos empregados da listagem analítica (para reconhecer pagamentos no extrato) */
  funcionarios?: string[];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const mes = (nome: string, ano: string) => {
  const i = MESES.indexOf(nome.toLowerCase().replace('marco', 'março'));
  return i < 0 ? null : `${ano}-${String(i + 1).padStart(2, '0')}`;
};
const PALAVRAS_DESCONTO = /desc|arred|arr\.|vale transp|inss|irrf|adto|adiant|falta|atraso|pens[ãa]o|sindic|contrib|empr[ée]stimo|consign/i;

/** Lê a "Listagem Sintética da Folha de Pagamento" (texto do PDF). Retorna null se não for esse relatório. */
export function lerResumoFolha(texto: string): ResumoFolha | null {
  const ini = texto.search(/Listagem Sint[ée]tica da Folha/i);
  if (ini < 0) return null;
  const sec = texto.slice(ini);
  const per = sec.match(/Folha de Pagamento:[^-\n]*-\s*([A-Za-zçÇ]+)\/(\d{4})(?:\s*a\s*([A-Za-zçÇ]+)\/(\d{4}))?/);
  if (!per) return null;
  const de = mes(per[1], per[2]);
  const ate = per[3] ? mes(per[3], per[4]) : de;
  if (!de || !ate) return null;
  const tot = sec.match(/([\d.]+,\d{2})\s+\(([\d.]+,\d{2})\)\s+([\d.]+,\d{2})/) || sec.match(/Total Vencimentos\s+([\d.]+,\d{2}).*?Total Descontos\s+\(([\d.]+,\d{2})\).*?L[íi]quido\s+([\d.]+,\d{2})/s);
  if (!tot) return null;
  const totalVencimentos = num(tot[1]), totalDescontos = num(tot[2]), liquido = num(tot[3]);

  const bases: RubricaFolha[] = [];
  const pares: RubricaFolha[] = []; // linhas com vencimento e desconto: o primeiro é vencimento
  const vencimentos: RubricaFolha[] = [];
  const descontos: RubricaFolha[] = [];
  const soltos: RubricaFolha[] = []; // sozinhos na linha: decide pelos totais
  const item = /(\d{3,4}) - (.+?) (?:(?:\d+:\d+|[\d.]+,\d{2}) )?([\d.]+,\d{2})(?= \d{3,4} - |\s*$)/g;
  for (const linha of sec.split('\n').map((l) => l.replace(/\s+/g, ' ').trim())) {
    const itens = [...linha.matchAll(item)].map((m) => ({ codigo: m[1], nome: m[2].trim(), valor: num(m[3]) }));
    const quatro = itens.filter((x) => x.codigo.length === 4);
    bases.push(...itens.filter((x) => x.codigo.length === 3));
    if (quatro.length >= 2) { vencimentos.push(quatro[0]); descontos.push(...quatro.slice(1)); pares.push(...quatro); }
    else if (quatro.length === 1) soltos.push(quatro[0]);
  }
  // distribui os soltos entre vencimentos e descontos de modo que os totais do relatório batam
  const alvo = arred(totalVencimentos - vencimentos.reduce((a, x) => a + x.valor, 0));
  let escolha = -1;
  if (soltos.length <= 16) {
    for (let mask = 0; mask < 1 << soltos.length; mask++) {
      const s = soltos.reduce((a, x, i) => a + (mask & (1 << i) ? x.valor : 0), 0);
      if (Math.abs(arred(s) - alvo) < 0.01) { escolha = mask; break; }
    }
  }
  soltos.forEach((x, i) => {
    const ehVenc = escolha >= 0 ? !!(escolha & (1 << i)) : !PALAVRAS_DESCONTO.test(x.nome);
    (ehVenc ? vencimentos : descontos).push(x);
  });
  if (!vencimentos.length) return null;
  const funcionarios = [...new Set([...texto.matchAll(/EMPREGADO:\s*\d+\s*-\s*([A-ZÀ-Ü][A-ZÀ-Ü ]*[A-ZÀ-Ü])(?=\s*(?:\n|Cargo))/g)].map((m) => m[1].trim()))];
  return { de, ate, vencimentos, descontos, bases, totalVencimentos, totalDescontos, liquido, funcionarios };
}

/** Os totais do resumo batem com as rubricas lidas? */
export function resumoConfere(r: ResumoFolha) {
  const v = arred(r.vencimentos.reduce((a, x) => a + x.valor, 0));
  const d = arred(r.descontos.reduce((a, x) => a + x.valor, 0));
  return Math.abs(v - r.totalVencimentos) < 0.01 && Math.abs(d - r.totalDescontos) < 0.01 && Math.abs(arred(v - d) - r.liquido) < 0.01;
}

type Partida = { chave: string; deb: string; cred: string; valor: number; hist: string };

/** Partidas de um resumo: despesa × salários a pagar, retenções e encargos. Adiantamentos e férias pagas antes
 *  são pagamentos (saem do banco quando registrados), não reduzem a obrigação aqui. */
export function partidasDaFolha(r: ResumoFolha): Partida[] {
  const out: Partida[] = [];
  for (const v of r.vencimentos) {
    const conta = /f[ée]rias|1\/3|13/i.test(v.nome) ? '4.1.2.03' : /cesta|aliment|refei|sa[úu]de|plano|odonto|seguro de vida/i.test(v.nome) ? '4.1.2.04' : '4.1.2.01';
    out.push({ chave: `V${v.codigo}`, deb: conta, cred: '2.1.2.01', valor: v.valor, hist: v.nome });
  }
  for (const d of r.descontos) {
    const arredonda = /arred|arr\./i.test(d.nome);
    if (!arredonda && /adto|adiant|desc\.? f[ée]rias/i.test(d.nome)) continue; // já pago antes: abate no pagamento
    const cred = /inss/i.test(d.nome) ? '2.1.2.02' : /irrf|imposto de renda/i.test(d.nome) ? '2.1.2.04' : /vale transp|\bvt\b/i.test(d.nome) ? '4.1.2.04'
      : arredonda || /falta|atraso/i.test(d.nome) ? '4.1.2.01' : '2.1.2.06';
    out.push({ chave: `D${d.codigo}`, deb: '2.1.2.01', cred, valor: d.valor, hist: d.nome });
  }
  const base = (re: RegExp) => arred(r.bases.filter((b) => re.test(b.nome)).reduce((a, b) => a + b.valor, 0));
  const fgts = base(/^valor fgts/i);
  const patronal = base(/^gps - (empresa|terceiros|rat)/i);
  if (fgts) out.push({ chave: 'FGTS', deb: '4.1.2.02', cred: '2.1.2.03', valor: fgts, hist: 'FGTS 8% sobre a folha' });
  if (patronal) out.push({ chave: 'INSSPAT', deb: '4.1.2.05', cred: '2.1.2.02', valor: patronal, hist: 'INSS patronal (empresa, RAT e terceiros)' });
  return out;
}

export interface FolhaImportada { id: string; resumo: ResumoFolha; importadoEm?: string }

const rotuloPeriodo = (de: string, ate: string) => (de === ate ? de.split('-').reverse().join('/') : `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`);

/** Lançamentos da folha. Resumos acumulados com o mesmo início (jan–set e depois jan–out) lançam só a diferença
 *  no mês final de cada um, então o mesmo período nunca entra duas vezes. Resumo repetido (mesmo período) vale o mais novo. */
export function lancamentosDaFolha(folhas: FolhaImportada[]): Lancamento[] {
  const porPeriodo = new Map<string, FolhaImportada>();
  for (const f of [...folhas].sort((a, b) => String(a.importadoEm || '').localeCompare(String(b.importadoEm || '')))) porPeriodo.set(`${f.resumo.de}|${f.resumo.ate}`, f);
  const porInicio = new Map<string, FolhaImportada[]>();
  for (const f of porPeriodo.values()) porInicio.set(f.resumo.de, [...(porInicio.get(f.resumo.de) || []), f]);
  const out: Lancamento[] = [];
  for (const grupo of porInicio.values()) {
    grupo.sort((a, b) => a.resumo.ate.localeCompare(b.resumo.ate));
    let anterior = new Map<string, number>();
    for (const f of grupo) {
      const atual = new Map<string, Partida>();
      for (const p of partidasDaFolha(f.resumo)) {
        const k = `${p.chave}|${p.deb}|${p.cred}`;
        const x = atual.get(k);
        atual.set(k, x ? { ...x, valor: arred(x.valor + p.valor) } : p);
      }
      const prev = grupo[grupo.indexOf(f) - 1];
      const periodo = prev ? `${proximoMes(prev.resumo.ate)} a ${f.resumo.ate}`.split(' a ').map((c) => c.split('-').reverse().join('/')).join(' a ') : rotuloPeriodo(f.resumo.de, f.resumo.ate);
      const chaves = new Set([...atual.keys(), ...anterior.keys()]);
      for (const k of chaves) {
        const p = atual.get(k);
        const valor = arred((p?.valor || 0) - (anterior.get(k) || 0));
        if (Math.abs(valor) < 0.005) continue;
        const [chave, deb, cred] = k.split('|');
        // diferença negativa (estorno na folha acumulada) entra invertida
        out.push({
          id: `FOLHA|${f.id}|${chave}|${deb}|${cred}`, data: `${f.resumo.ate}-28`, comp: f.resumo.ate,
          deb: valor > 0 ? deb : cred, cred: valor > 0 ? cred : deb, valor: Math.abs(valor),
          hist: `Folha ${periodo} — ${p?.hist || chave}`, origemId: f.id, modulo: 'Departamento Pessoal → Folha',
          doc: 'Resumo da folha', motivo: 'Valores do resumo da folha do sistema de DP', conf: 95, auto: true, status: 'Automático',
        });
      }
      anterior = new Map([...atual].map(([k, p]) => [k, p.valor]));
    }
  }
  return out;
}

function proximoMes(c: string) {
  let y = +c.slice(0, 4), m = +c.slice(5) + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
