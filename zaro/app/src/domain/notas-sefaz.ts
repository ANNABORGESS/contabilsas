// Lista de NF exportada do portal da SEFAZ-AM (planilha): uma linha por nota, na ordem
// UF, chave, número, série, emissão, CNPJ/IE/razão do emissor, CNPJ/IE/razão do destinatário,
// CFOP, selagem, situação, tipo, valor. Se a 1ª linha tiver títulos conhecidos, usa os títulos.
import { arred, numero } from './dinheiro';

export interface NotaSefaz {
  chave: string;
  uf: string;
  numero: string;
  serie: string;
  emissao: string | null;
  cnpjEmit: string;
  ieEmit: string;
  razaoEmit: string;
  cnpjDest: string;
  ieDest: string;
  razaoDest: string;
  cfop: string;
  selagem: string;
  situacao: string;
  tipo: string;
  valor: number;
}

const CAMPOS: (keyof NotaSefaz)[] = ['uf', 'chave', 'numero', 'serie', 'emissao', 'cnpjEmit', 'ieEmit', 'razaoEmit', 'cnpjDest', 'ieDest', 'razaoDest', 'cfop', 'selagem', 'situacao', 'tipo', 'valor'];
// os mais específicos primeiro: "CNPJ emissor" não pode cair em "emissão"
const TITULOS: [RegExp, keyof NotaSefaz][] = [
  [/cnpj.*emi/, 'cnpjEmit'], [/^ie.*emi|inscri.*emi/, 'ieEmit'], [/raz.*emi|emitente/, 'razaoEmit'],
  [/cnpj.*dest|cpf.*dest/, 'cnpjDest'], [/^ie.*dest|inscri.*dest/, 'ieDest'], [/raz.*dest|destinat/, 'razaoDest'],
  [/^uf/, 'uf'], [/chave/, 'chave'], [/^(numero|nº|n\.)/, 'numero'], [/^serie/, 'serie'], [/emiss/, 'emissao'],
  [/cfop/, 'cfop'], [/selag/, 'selagem'], [/situa/, 'situacao'], [/^tipo/, 'tipo'], [/valor/, 'valor'],
];

const texto = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/^'+/, '').trim();

/** Data da planilha: número de série do Excel, Date, "dd/mm/aaaa" ou "aaaa-mm-dd". */
export function dataDaPlanilha(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : null;
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

export function lerListaSefaz(linhas: unknown[][]) {
  if (!linhas.length) return { notas: [] as NotaSefaz[], ignoradas: 0 };
  const cab = linhas[0].map((c) => texto(c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const porTitulo = new Map<keyof NotaSefaz, number>();
  cab.forEach((c, i) => { const t = TITULOS.find(([re]) => re.test(c)); if (t && !porTitulo.has(t[1])) porTitulo.set(t[1], i); });
  // layout padrão do portal (16 colunas, chave na 2ª): ordem fixa; senão, pelos títulos
  const layoutPadrao = cab.length >= 16 && /chave/.test(cab[1] || '');
  const usaTitulos = !layoutPadrao && porTitulo.has('chave') && porTitulo.size >= 6;
  const col = (k: keyof NotaSefaz) => (usaTitulos ? porTitulo.get(k) : CAMPOS.indexOf(k));
  const inicio = usaTitulos || cab.some((c) => /chave/.test(c)) ? 1 : 0;
  const notas = new Map<string, NotaSefaz>();
  let ignoradas = 0;
  for (const l of linhas.slice(inicio)) {
    const v = (k: keyof NotaSefaz) => { const i = col(k); return i == null || i < 0 ? '' : l[i]; };
    const chave = texto(v('chave')).replace(/\D/g, '');
    if (chave.length !== 44) { if (l.some((x) => texto(x))) ignoradas++; continue; }
    notas.set(chave, {
      chave, uf: texto(v('uf')), numero: texto(v('numero')).replace(/^0+(?=\d)/, ''), serie: texto(v('serie')), emissao: dataDaPlanilha(v('emissao')),
      cnpjEmit: texto(v('cnpjEmit')).replace(/\D/g, ''), ieEmit: texto(v('ieEmit')), razaoEmit: texto(v('razaoEmit')),
      cnpjDest: texto(v('cnpjDest')).replace(/\D/g, ''), ieDest: texto(v('ieDest')), razaoDest: texto(v('razaoDest')),
      cfop: texto(v('cfop')), selagem: texto(v('selagem')), situacao: texto(v('situacao')), tipo: texto(v('tipo')), valor: arred(numero(v('valor'))),
    });
  }
  return { notas: [...notas.values()], ignoradas };
}

export const notaCancelada = (situacao: string | null | undefined) => /cancel|denegad|inutiliz/i.test(situacao || '');
