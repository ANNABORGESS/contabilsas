// Leitura de XML fiscal: NF-e (modelo 55/65), NFS-e (padrões ABRASF e nacional) e eventos
// (cancelamento 110111). Porta a lógica de lerNFXml do protótipo para rodar no servidor.
import { XMLParser } from 'fast-xml-parser';
import { arred, numero } from './dinheiro';

type No = Record<string, unknown>;

export interface ItemNF {
  desc: string;
  ncm: string;
  cfop: string;
  qtd: number;
  un: string;
  unit: number;
  total: number;
  /** tributos do item (NF-e): base para o crédito na entrada */
  icms?: number;
  ipi?: number;
  icmsSt?: number;
  cst?: string;
}
export interface Imposto {
  nome: string;
  base: number;
  aliq: number | null;
  valor: number;
}
export interface Parcela {
  n: string;
  venc: string;
  valor: number;
}
export interface DadosNF {
  emitNome: string;
  emitCnpj: string;
  emitUf: string;
  cliNome: string;
  cliDoc: string;
  cliIe: string;
  cliEmail: string;
  cliCidade: string;
  cliUf: string;
  numero: string;
  serie: string;
  chave: string;
  emissao: string;
  competencia: string;
  natureza: string;
  descricao: string;
  vProd: number;
  vDesc: number;
  vFrete: number;
  vNF: number;
  vLiq: number;
  infCpl: string;
  pedido: string;
  forma: string;
  condicao: string;
  /** chaves de NF referenciadas (NFref), usadas para ligar retorno à nota original */
  refChaves: string[];
}
export interface NotaFiscal {
  tipo: 'NF-e' | 'NFS-e';
  modelo: string;
  confianca: number;
  itens: ItemNF[];
  impostos: Imposto[];
  retencoes: { nome: string; valor: number }[];
  parcelas: Parcela[];
  dados: DadosNF;
}
export interface EventoNF {
  tipo: 'Evento';
  tpEvento: string;
  descricao: string;
  chave: string;
  data: string;
  protocolo: string;
  /** true quando é cancelamento homologado da NF (110111) */
  cancelamento: boolean;
}
export type DocumentoFiscal = NotaFiscal | EventoNF;

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // mantém tudo como texto: chaves, CNPJ e códigos começam com zero
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const comoLista = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Todos os nós com este nome em qualquer profundidade. */
function todos(raiz: unknown, nome: string): No[] {
  const out: No[] = [];
  const visitar = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visitar);
    for (const [k, v] of Object.entries(n as No)) {
      if (k === nome) comoLista(v).forEach((x) => out.push((typeof x === 'object' && x ? x : { '#text': x }) as No));
      visitar(v);
    }
  };
  visitar(raiz);
  return out;
}
const um = (raiz: unknown, nome: string): No | null => todos(raiz, nome)[0] || null;

/** Texto do primeiro nó encontrado entre os nomes, em qualquer profundidade. */
function tx(raiz: unknown, ...nomes: string[]): string {
  if (!raiz) return '';
  for (const nome of nomes) {
    for (const n of todos(raiz, nome)) {
      const t = typeof n === 'object' ? (n['#text'] ?? (Object.keys(n).length ? '' : '')) : n;
      const s = String(t ?? '').trim();
      if (s) return s;
    }
  }
  return '';
}
/** Texto de um filho direto (não desce na árvore). */
function filho(no: No | null, nome: string): string {
  if (!no) return '';
  const v = no[nome];
  if (v == null || typeof v === 'object') return v && typeof v === 'object' ? String((v as No)['#text'] ?? '') : '';
  return String(v).trim();
}

const d10 = (v: string) => String(v || '').slice(0, 10);

const FORMA_PAG: Record<string, string> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '05': 'Crédito loja',
  '15': 'Boleto', '16': 'Depósito bancário', '17': 'PIX', '18': 'Transferência', '90': 'Sem pagamento', '99': 'Outros',
};

class Somador {
  private m = new Map<string, { base: number; valor: number; aliqs: Set<string> }>();
  add(nome: string, base: number, aliq: number, valor: number) {
    if (!valor && !base) return;
    const a = this.m.get(nome) || { base: 0, valor: 0, aliqs: new Set<string>() };
    a.base += base;
    a.valor += valor;
    if (aliq) a.aliqs.add(String(aliq));
    this.m.set(nome, a);
  }
  lista(): Imposto[] {
    return [...this.m.entries()].map(([nome, a]) => ({
      nome,
      base: arred(a.base),
      aliq: a.aliqs.size === 1 ? numero([...a.aliqs][0]) : null,
      valor: arred(a.valor),
    }));
  }
}

export function lerXmlFiscal(xml: string): DocumentoFiscal {
  let doc: No;
  try {
    doc = parser.parse(xml) as No;
  } catch {
    throw new Error('XML inválido: o arquivo não pôde ser lido.');
  }
  if (!doc || typeof doc !== 'object' || !Object.keys(doc).length) throw new Error('XML inválido: o arquivo não pôde ser lido.');

  const infEvento = um(doc, 'infEvento');
  if (infEvento && !um(doc, 'infNFe')) return lerEvento(doc, infEvento);

  const inf = um(doc, 'infNFe');
  if (inf) return lerNFe(doc, inf);

  const nfse = um(doc, 'InfNfse') || um(doc, 'infNFSe') || um(doc, 'Nfse') || um(doc, 'NFSe') || (tx(doc, 'ValorServicos', 'vServ') ? doc : null);
  if (nfse) return lerNFSe(doc, nfse);

  throw new Error('O XML não foi reconhecido como NF-e, NFS-e ou evento de NF-e.');
}

function lerEvento(doc: No, inf: No): EventoNF {
  const tp = tx(inf, 'tpEvento');
  const ret = um(doc, 'retEvento');
  const cStat = ret ? tx(ret, 'cStat') : '';
  // evento só vale se homologado (135/136/155); sem retorno, assume que veio do procEvento autorizado
  const homologado = !ret || /^1(35|36|55)$/.test(cStat);
  return {
    tipo: 'Evento',
    tpEvento: tp,
    descricao: tx(inf, 'descEvento') || tx(doc, 'xEvento'),
    chave: tx(inf, 'chNFe'),
    data: d10(tx(inf, 'dhEvento')),
    protocolo: ret ? tx(ret, 'nProt') : '',
    cancelamento: homologado && (tp === '110111' || tp === '110112'),
  };
}

function lerNFe(doc: No, inf: No): NotaFiscal {
  const ide = um(inf, 'ide');
  const emit = um(inf, 'emit');
  const dest = um(inf, 'dest');
  const tot = um(inf, 'ICMSTot');
  const ret = um(inf, 'retTrib');
  const imp = new Somador();

  const itens: ItemNF[] = todos(inf, 'det').map((d) => {
    const p = um(d, 'prod');
    const i = um(d, 'imposto');
    const fiscal: { icms?: number; ipi?: number; icmsSt?: number; cst?: string } = {};
    if (i) {
      const icms = um(i, 'ICMS');
      if (icms) {
        imp.add('ICMS', numero(tx(icms, 'vBC')), numero(tx(icms, 'pICMS')), numero(tx(icms, 'vICMS')));
        fiscal.icms = numero(tx(icms, 'vICMS'));
        fiscal.icmsSt = numero(tx(icms, 'vICMSST')) || numero(tx(icms, 'vICMSSTRet'));
        fiscal.cst = tx(icms, 'CST', 'CSOSN');
      }
      const ipi = um(i, 'IPI');
      if (ipi) {
        imp.add('IPI', numero(tx(ipi, 'vBC')), numero(tx(ipi, 'pIPI')), numero(tx(ipi, 'vIPI')));
        fiscal.ipi = numero(tx(ipi, 'vIPI'));
      }
      const pis = um(i, 'PIS');
      if (pis) imp.add('PIS', numero(tx(pis, 'vBC')), numero(tx(pis, 'pPIS')), numero(tx(pis, 'vPIS')));
      const cof = um(i, 'COFINS');
      if (cof) imp.add('COFINS', numero(tx(cof, 'vBC')), numero(tx(cof, 'pCOFINS')), numero(tx(cof, 'vCOFINS')));
      const iss = um(i, 'ISSQN');
      if (iss) imp.add('ISS', numero(tx(iss, 'vBC')), numero(tx(iss, 'vAliq')), numero(tx(iss, 'vISSQN')));
      const ibs = um(i, 'IBSCBS');
      if (ibs) {
        imp.add('IBS', numero(tx(ibs, 'vBC')), numero(tx(ibs, 'pIBSUF')) + numero(tx(ibs, 'pIBSMun')), numero(tx(ibs, 'vIBS')));
        imp.add('CBS', numero(tx(ibs, 'vBC')), numero(tx(ibs, 'pCBS')), numero(tx(ibs, 'vCBS')));
      }
    }
    return {
      desc: tx(p, 'xProd'), ncm: tx(p, 'NCM'), cfop: tx(p, 'CFOP'), qtd: numero(tx(p, 'qCom')),
      un: tx(p, 'uCom'), unit: numero(tx(p, 'vUnCom')), total: numero(tx(p, 'vProd')), ...fiscal,
    };
  });

  const retencoes = (
    [['PIS retido', 'vRetPIS'], ['COFINS retida', 'vRetCOFINS'], ['CSLL retida', 'vRetCSLL'], ['IRRF', 'vIRRF'], ['INSS retido', 'vRetPrev']] as const
  )
    .map(([nome, tag]): { nome: string; valor: number } => ({ nome, valor: numero(tx(ret, tag)) }))
    .filter((x) => x.valor > 0);

  const parcelas: Parcela[] = todos(inf, 'dup').map((d) => ({ n: filho(d, 'nDup'), venc: d10(filho(d, 'dVenc')), valor: numero(filho(d, 'vDup')) }));
  const pag = um(inf, 'pag');
  const tPag = tx(pag, 'tPag');
  const indPag = tx(pag, 'indPag') || tx(ide, 'indPag');
  const vNF = numero(tx(tot, 'vNF'));
  const emissao = d10(tx(ide, 'dhEmi', 'dEmi'));
  const chave = (String(inf['@Id'] || '').replace(/\D/g, '') || tx(doc, 'chNFe')).slice(-44);
  const infAdic = um(inf, 'infAdic');

  return {
    tipo: 'NF-e',
    modelo: tx(ide, 'mod') || '55',
    confianca: 98,
    itens,
    impostos: imp.lista(),
    retencoes,
    parcelas,
    dados: {
      emitNome: tx(emit, 'xNome'), emitCnpj: filho(emit, 'CNPJ') || filho(emit, 'CPF'), emitUf: tx(um(emit, 'enderEmit'), 'UF'),
      cliNome: tx(dest, 'xNome'), cliDoc: filho(dest, 'CNPJ') || filho(dest, 'CPF') || filho(dest, 'idEstrangeiro'), cliIe: filho(dest, 'IE'),
      cliEmail: tx(dest, 'email'), cliCidade: tx(um(dest, 'enderDest'), 'xMun'), cliUf: tx(um(dest, 'enderDest'), 'UF'),
      numero: tx(ide, 'nNF'), serie: tx(ide, 'serie'), chave, emissao, competencia: emissao.slice(0, 7),
      natureza: tx(ide, 'natOp'),
      descricao: itens.map((i) => i.desc).filter(Boolean).slice(0, 3).join('; ') + (itens.length > 3 ? '…' : ''),
      vProd: numero(tx(tot, 'vProd')), vDesc: numero(tx(tot, 'vDesc')), vFrete: numero(tx(tot, 'vFrete')), vNF,
      vLiq: Math.max(0, arred(vNF - retencoes.reduce((a, r) => a + r.valor, 0))),
      infCpl: [tx(infAdic, 'infCpl'), tx(infAdic, 'infAdFisco')].filter(Boolean).join(' '),
      pedido: tx(um(inf, 'compra'), 'xPed') || tx(inf, 'xPed'),
      forma: FORMA_PAG[tPag] || '',
      condicao: parcelas.length > 1 ? `${parcelas.length} parcelas` : indPag === '1' ? 'A prazo' : indPag === '0' ? 'À vista' : '',
      refChaves: todos(ide, 'refNFe').map((r) => String(r['#text'] ?? '')).filter((c) => c.length === 44),
    },
  };
}

function lerNFSe(doc: No, nf: No): NotaFiscal {
  const tom = um(nf, 'TomadorServico') || um(nf, 'Tomador') || um(nf, 'toma') || um(doc, 'toma');
  const prest = um(nf, 'PrestadorServico') || um(nf, 'Prestador') || um(nf, 'prest') || um(nf, 'emit');
  const imp = new Somador();
  const vServ = numero(tx(doc, 'ValorServicos', 'vServ'));
  const aR = numero(tx(doc, 'Aliquota', 'pAliqAplic', 'pAliq'));
  const aliq = aR > 0 && aR < 1 ? aR * 100 : aR;
  const vIss = numero(tx(doc, 'ValorIss', 'vISSQN'));
  const issRetido = tx(doc, 'IssRetido') === '1' || tx(doc, 'tpRetISSQN') === '2';
  if (vIss || aliq) imp.add('ISS', numero(tx(doc, 'BaseCalculo', 'vBC')) || vServ, aliq, vIss);
  const retencoes = (
    [['PIS retido', 'ValorPis', 'vRetPIS'], ['COFINS retida', 'ValorCofins', 'vRetCOFINS'], ['INSS retido', 'ValorInss', 'vRetCP'], ['IRRF', 'ValorIr', 'vRetIRRF'], ['CSLL retida', 'ValorCsll', 'vRetCSLL']] as const
  )
    .map(([nome, a, b]): { nome: string; valor: number } => ({ nome, valor: numero(tx(doc, a, b)) }))
    .filter((x) => x.valor > 0);
  if (issRetido && vIss) retencoes.push({ nome: 'ISS retido', valor: vIss });
  const liq = numero(tx(doc, 'ValorLiquidoNfse', 'vLiq')) || Math.max(0, arred(vServ - retencoes.reduce((a, r) => a + r.valor, 0)));
  const desc = tx(doc, 'Discriminacao', 'xDescServ');
  const emissao = d10(tx(doc, 'DataEmissao', 'dhEmi', 'dhProc'));
  const infNFSe = um(doc, 'infNFSe');
  return {
    tipo: 'NFS-e',
    modelo: 'NFS-e',
    confianca: 92,
    impostos: imp.lista(),
    retencoes,
    parcelas: [],
    itens: [{ desc: desc || 'Serviço prestado', ncm: tx(doc, 'ItemListaServico', 'cTribNac'), cfop: '', qtd: 1, un: 'SV', unit: vServ, total: vServ }],
    dados: {
      emitNome: tx(prest, 'RazaoSocial', 'xNome'), emitCnpj: tx(prest, 'Cnpj', 'CNPJ'), emitUf: '',
      cliNome: tx(tom, 'RazaoSocial', 'xNome'), cliDoc: tx(tom, 'Cnpj', 'CNPJ', 'Cpf', 'CPF'), cliIe: '', cliEmail: tx(tom, 'Email', 'email'),
      cliCidade: '', cliUf: tx(tom, 'Uf', 'UF'),
      numero: tx(nf, 'Numero', 'nNFSe'), serie: tx(nf, 'Serie'),
      chave: tx(doc, 'CodigoVerificacao', 'chNFSe') || String(infNFSe?.['@Id'] || ''),
      emissao, competencia: (d10(tx(doc, 'Competencia', 'dCompet')) || emissao).slice(0, 7),
      natureza: 'Prestação de serviço', descricao: desc,
      vProd: vServ, vDesc: numero(tx(doc, 'DescontoIncondicionado', 'vDescIncond')), vFrete: 0, vNF: vServ, vLiq: liq,
      infCpl: [tx(doc, 'OutrasInformacoes', 'xInfComp'), desc].filter(Boolean).join(' '),
      pedido: '', forma: '', condicao: '', refChaves: [],
    },
  };
}
