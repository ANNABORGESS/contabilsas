// Leitura de extratos em PDF (Itaú e Bradesco, texto com colunas preservadas).
// Cada movimento lido é conferido contra o saldo impresso pelo próprio banco.
import { arred } from './dinheiro';

export interface MovimentoExtrato { data: string; valor: number; memo: string }
export interface ExtratoLido {
  banco: string;
  conta: string;
  saldoInicial: number;
  dataSaldoInicial: string;
  movimentos: MovimentoExtrato[];
  saldoFinal: number;
  conferidos: number; // saldos do banco conferidos com a soma dos movimentos
  divergencias: { data: string; banco: number; calculado: number }[];
}

const DINHEIRO = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d/])/g;
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const iso = (d: string) => d.split('/').reverse().join('-');
const DATA_INICIO = /^\s*(\d{2}\/\d{2}\/\d{4})\b/;
const limpa = (s: string) => s.replace(DINHEIRO, ' ').replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' ').replace(/\s+/g, ' ').trim();

/** Liga as linhas de continuação (histórico quebrado em várias linhas) ao lançamento mais próximo. */
function juntarHistoricos(linhas: string[], ehLancamento: (i: number) => boolean, ignorar: (l: string) => boolean, temTipo: (i: number) => boolean = () => false) {
  const idx = linhas.map((_, i) => i).filter(ehLancamento);
  const extras = new Map<number, string[]>(idx.map((i) => [i, []]));
  linhas.forEach((l, i) => {
    if (ehLancamento(i) || ignorar(l) || !l.trim()) return;
    let melhor = -1;
    for (const j of idx) {
      const dj = Math.abs(j - i), dm = Math.abs(melhor - i);
      // empate entre o lançamento de cima e o de baixo: fica com o de baixo, a não ser que ele já traga o próprio histórico
      if (melhor < 0 || dj < dm || (dj === dm && j > melhor && !temTipo(j))) melhor = j;
    }
    if (melhor >= 0 && Math.abs(melhor - i) <= 3) extras.get(melhor)!.push(limpa(l));
  });
  return extras;
}

const CABECALHO_ITAU = /Data\s+Lan[çc]amentos|Saldo total|Limite da conta|^\s*R\$|Lan[çc]amentos do per[íi]odo|Ag[êe]ncia\s+\d+\s+Conta|aviso:|novos lan[çc]amentos|atualizado em|Em caso de d[úu]vidas|0728, 24 horas|Ouvidoria|^\s*\f|^\s*\d+\s*$|CNPJ \d/;

export function lerExtratoItau(texto: string): ExtratoLido | null {
  const cab = texto.match(/Ag[êe]ncia\s+(\d+)\s+Conta\s+([\d-]+)/);
  if (!cab || !/SALDO ANTERIOR/.test(texto)) return null;
  const linhas = texto.split('\n');
  const ini = linhas.findIndex((l) => /SALDO ANTERIOR/.test(l));
  let fim = linhas.findIndex((l, i) => i > ini && /SALDO EM CONTA CORRENTE/.test(l));
  if (fim < 0) fim = linhas.length - 1;
  const corpo = linhas.slice(ini, fim + 1);
  const ehSaldo = (l: string) => /SALDO (ANTERIOR|TOTAL DISPON|EM CONTA)/.test(l);
  const ehLanc = (i: number) => DATA_INICIO.test(corpo[i]) && !ehSaldo(corpo[i]) && (corpo[i].match(DINHEIRO) || []).length > 0;
  const extras = juntarHistoricos(corpo, ehLanc, (l) => CABECALHO_ITAU.test(l) || ehSaldo(l) || DATA_INICIO.test(l), (i) => /^\s*\d{2}\/\d{2}\/\d{4}\s{1,8}\S/.test(corpo[i]));
  const saldoIni = num((corpo[0].match(DINHEIRO) || ['0,00']).pop()!);
  const out: ExtratoLido = { banco: 'Itaú', conta: `Itaú ${cab[1]}/${cab[2]}`, saldoInicial: saldoIni, dataSaldoInicial: iso(corpo[0].match(DATA_INICIO)![1]), movimentos: [], saldoFinal: saldoIni, conferidos: 0, divergencias: [] };
  let corrente = saldoIni;
  corpo.forEach((l, i) => {
    const d = l.match(DATA_INICIO);
    if (!d) return;
    const valores = l.match(DINHEIRO) || [];
    if (ehSaldo(l)) {
      if (/SALDO ANTERIOR/.test(l) || !valores.length) return;
      const banco = num(valores[valores.length - 1]);
      out.conferidos++;
      if (Math.abs(banco - corrente) > 0.005) out.divergencias.push({ data: iso(d[1]), banco, calculado: arred(corrente) });
      corrente = banco; // segue do saldo do banco para não arrastar uma diferença
      return;
    }
    if (!ehLanc(i)) return;
    const valor = num(valores[valores.length - 1]);
    const propria = limpa(l.slice(d[0].length));
    const memo = [propria, ...(extras.get(i) || [])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    out.movimentos.push({ data: iso(d[1]), valor, memo });
    corrente = arred(corrente + valor);
  });
  out.saldoFinal = arred(corrente);
  return out;
}

const CABECALHO_BRADESCO = /Extrato Mensal|Nome do usu[áa]rio|Data da opera[çc][ãa]o|Folha \d|Ag[êe]ncia \| Conta|Total Dispon|Extrato de:|Data\s+Lan[çc]amento|Os dados acima|[ÚU]ltimos Lan[çc]amentos|Saldos Invest|N[ãa]o h[áa] hist[óo]rico|SMC\.|^\s*Total\b|^\s*\d{5} \| /;

export function lerExtratoBradesco(texto: string): ExtratoLido | null {
  const cab = texto.match(/Ag:\s*(\d+)\s*\|\s*CC:\s*([\d-]+)/);
  if (!cab || !/SALDO ANTERIOR/.test(texto)) return null;
  const linhas = texto.split('\n');
  const ini = linhas.findIndex((l) => /SALDO ANTERIOR/.test(l));
  const corpo = linhas.slice(ini);
  // lançamento: termina com valor e saldo (dois valores); a data aparece só no primeiro do dia
  const ehLanc = (i: number) => !/SALDO ANTERIOR|^\s*Total\b/.test(corpo[i]) && (corpo[i].match(DINHEIRO) || []).length >= 2;
  const extras = juntarHistoricos(corpo, ehLanc, (l) => CABECALHO_BRADESCO.test(l) || /SALDO ANTERIOR/.test(l));
  const saldoIni = num((corpo[0].match(DINHEIRO) || ['0,00']).pop()!);
  const out: ExtratoLido = { banco: 'Bradesco', conta: `Bradesco ${cab[1]}/${cab[2]}`, saldoInicial: saldoIni, dataSaldoInicial: iso(corpo[0].match(DATA_INICIO)?.[1] || '01/01/1900'), movimentos: [], saldoFinal: saldoIni, conferidos: 0, divergencias: [] };
  let corrente = saldoIni;
  let dataAtual = out.dataSaldoInicial;
  corpo.forEach((l, i) => {
    const d = l.match(DATA_INICIO);
    if (d) dataAtual = iso(d[1]);
    if (/SALDO ANTERIOR/.test(l) && i > 0) {
      // "Últimos lançamentos" continua do saldo anterior informado
      const s = num((l.match(DINHEIRO) || ['0,00']).pop()!);
      if (Math.abs(s - corrente) > 0.005) out.divergencias.push({ data: dataAtual, banco: s, calculado: arred(corrente) });
      corrente = s;
      return;
    }
    if (!ehLanc(i)) return;
    const v = l.match(DINHEIRO)!;
    const valor = num(v[v.length - 2]);
    const banco = num(v[v.length - 1]);
    const propria = limpa(l.replace(DATA_INICIO, '')).replace(/^\d+\s*/, '');
    const memo = [propria, ...(extras.get(i) || [])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    out.movimentos.push({ data: dataAtual, valor, memo });
    corrente = arred(corrente + valor);
    out.conferidos++;
    if (Math.abs(banco - corrente) > 0.005) { out.divergencias.push({ data: dataAtual, banco, calculado: corrente }); corrente = banco; }
  });
  out.saldoFinal = arred(corrente);
  return out;
}

export function lerExtratoPdf(texto: string): ExtratoLido | null {
  if (/Ag:\s*\d+\s*\|\s*CC:/.test(texto)) return lerExtratoBradesco(texto);
  if (/Ag[êe]ncia\s+\d+\s+Conta\s+[\d-]+/.test(texto) && /SALDO TOTAL DISPON/i.test(texto)) return lerExtratoItau(texto);
  return null;
}
