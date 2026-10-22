// Motor contábil: transforma as operações (títulos, baixas, imobilizado, empréstimos) em
// lançamentos de partida dobrada. Os lançamentos são recalculados a partir das operações;
// o que fica gravado é a decisão do contador sobre cada um (status, conta ajustada, estorno).
import { arred } from './dinheiro';

export type StatusLanc = 'Automático' | 'Sugerido' | 'Em revisão' | 'Aprovado' | 'Contabilizado' | 'Estornado';
export const STATUS_NO_LIVRO: StatusLanc[] = ['Aprovado', 'Contabilizado', 'Estornado'];

export interface Lancamento {
  id: string;
  data: string;
  comp: string;
  deb: string;
  cred: string;
  valor: number;
  hist: string;
  origemId: string;
  modulo: string;
  doc: string;
  motivo: string;
  conf: number;
  auto: boolean;
  status: StatusLanc;
  /** permite trocar a conta e aprender a regra para o parceiro */
  editavel?: boolean;
  chaveRegra?: string;
}

export interface BaixaMotor {
  data: string;
  valor: number;
  estornada?: boolean;
}
export interface TituloMotor {
  id: string;
  tipo: 'pagar' | 'receber';
  nome: string;
  nf?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  contaContabil?: string | null;
  origem?: 'nf' | 'folha' | 'emprestimo' | 'manual' | string | null;
  folhaTipo?: string | null;
  contrato?: string | null;
  juros?: number | null;
  competencia?: string | null;
  emissao?: string | null;
  venc?: string | null;
  valor: number;
  status: string;
  retorno?: boolean;
  impostos?: { nome: string; valor: number }[] | null;
  baixas?: BaixaMotor[];
}
export interface ImobilizadoMotor {
  id: string;
  descricao: string;
  qtd: number;
  valor: number;
  data: string;
  taxa: number;
  residual?: number;
  origem: string;
  nf?: string | null;
}
export interface ContratoMotor {
  id: string;
  instituicao: string;
  contrato: string;
  tipo: string;
  valor: number;
  dataContr: string;
  status?: string;
  /** "recebido" = a empresa tomou o empréstimo (padrão); "concedido" = emprestou */
  natureza?: string;
}
export interface DecisoesContador {
  status?: Record<string, StatusLanc>;
  contas?: Record<string, string>;
  regras?: Record<string, string>;
  estornos?: Record<string, { motivo: string; data: string }>;
}
export interface EntradaMotor {
  titulos: TituloMotor[];
  imobilizado?: ImobilizadoMotor[];
  contratos?: ContratoMotor[];
  decisoes?: DecisoesContador;
  /** anos com extrato importado: nesses anos a baixa vem do extrato, não do título */
  anosComExtrato?: Set<string>;
  hoje?: string;
}

const REGRAS_DESPESA: [RegExp, string, string, number][] = [
  [/energia|eletric/, '4.1.3.01', 'energia elétrica', 96],
  [/aluguel|condom/, '4.1.3.02', 'aluguel', 94],
  [/manuten/, '4.1.3.03', 'manutenção', 90],
  [/combust|posto|ve[ií]culo/, '4.1.3.04', 'combustível ou veículo', 90],
  [/telefon|internet|\bclaro\b|\bvivo\b|\btim\b/, '4.1.3.05', 'telefone e internet', 92],
  [/tarifa|banc[áa]ria/, '4.2.1.02', 'tarifa bancária', 95],
  [/juros/, '4.2.1.01', 'juros', 92],
  [/darf|\bdas\b|tribut|imposto|receita federal|sefaz|icms|\biss\b|guia/, '2.1.4.01', 'guia de tributo', 88],
  [/mat[ée]ria|material|chapa|a[çc]o|alum[íi]nio|insumo|compra|pe[çc]a/, '4.1.1.01', 'compra de material aplicado nos pedidos (sem estoque)', 85],
  [/servi[çc]o|terceir|usinagem|transporte|frete/, '4.1.3.06', 'serviço de terceiros', 80],
];

export const chaveDoParceiro = (nome: string) => String(nome || '').toLowerCase().trim();

export function classificarDespesa(t: TituloMotor, regras: Record<string, string> = {}) {
  const chave = chaveDoParceiro(t.nome);
  if (regras[chave]) return { conta: regras[chave], motivo: `Regra aprendida para ${t.nome}`, conf: 98, auto: true };
  if (/^[34]\./.test(t.contaContabil || '') && t.origem === 'nf') {
    return { conta: t.contaContabil!, motivo: 'Compra por NF: conta definida na leitura do XML (empresa sob encomenda, sem estoque)', conf: 92, auto: true };
  }
  const texto = `${t.categoria || ''} ${t.nome} ${t.descricao || ''}`.toLowerCase();
  const r = REGRAS_DESPESA.find(([re]) => re.test(texto));
  if (r) return { conta: r[1], motivo: `Categoria "${t.categoria || '—'}" e fornecedor ${t.nome}: ${r[2]}`, conf: r[3], auto: r[3] >= 95 };
  return { conta: '4.1.3.09', motivo: `Sem regra para a categoria "${t.categoria || '—'}": despesas gerais, provisoriamente`, conf: 55, auto: false };
}

const ehCancelado = (s: string) => /cancel/i.test(s);
const pagoTotal = (s: string) => /pago|recebido|quitad|liquidad/i.test(s) && !/parcial/i.test(s);

export function gerarLancamentos(e: EntradaMotor): Lancamento[] {
  const dec = e.decisoes || {};
  const statusDec = dec.status || {};
  const contas = dec.contas || {};
  const anosExt = e.anosComExtrato || new Set<string>();
  const hoje = (e.hoje || new Date().toISOString()).slice(0, 7);
  const L: Lancamento[] = [];

  const add = (l: Omit<Lancamento, 'status'>) => {
    const padrao: StatusLanc = /^(IMB|DEP)\|/.test(l.id) ? 'Aprovado' : l.conf < 70 ? 'Em revisão' : l.auto ? 'Automático' : 'Sugerido';
    if (!(l.valor > 0.004)) return;
    L.push({ ...l, valor: arred(l.valor), status: statusDec[l.id] || padrao });
  };

  for (const t of e.titulos) {
    const v = Number(t.valor || 0);
    if (!(v > 0) || t.retorno || ehCancelado(t.status)) continue;
    const comp = t.competencia || String(t.venc || t.emissao || '').slice(0, 7);
    const data = t.emissao || t.venc || `${comp}-01`;
    const doc = t.nf ? `NF ${t.nf}` : t.id;
    const baixas = (t.baixas || []).filter((b) => !b.estornada);
    const pagoV = baixas.reduce((a, b) => a + b.valor, 0) || (pagoTotal(t.status) ? v : 0);
    const dataPag = baixas.length ? baixas[baixas.length - 1].data : t.venc || data;
    const baixaNoExtrato = anosExt.has(String(dataPag).slice(0, 4));
    const base = { origemId: t.id, doc };

    if (t.tipo === 'pagar') {
      if (t.origem === 'folha') {
        const passivo = { Salário: '2.1.2.01', INSS: '2.1.2.02', FGTS: '2.1.2.03', IRRF: '2.1.2.04' }[t.folhaTipo || ''] || '2.1.2.01';
        if (pagoV > 0) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: passivo, cred: '1.1.1.02', valor: pagoV, hist: `Pagamento ${t.folhaTipo || 'folha'} — ${t.nome} — folha ${comp}`, modulo: 'Folha → Contas a Pagar', motivo: 'Baixa do passivo gerado no fechamento da folha', conf: 97, auto: true });
        continue;
      }
      if (t.origem === 'emprestimo') {
        const juros = t.juros != null ? Math.min(Number(t.juros) || 0, v) : null;
        const principal = juros != null ? v - juros : v;
        add({ ...base, id: `${t.id}|prov`, data: t.venc || data, comp, deb: '2.1.3.01', cred: '2.1.1.01', valor: principal, hist: `Principal parcela — ${t.nome} — contrato ${t.contrato || ''}`, modulo: 'Empréstimos → Contas a Pagar', motivo: juros != null ? 'Amortização do principal conforme o contrato' : 'Parcela sem separação de juros: confirme o cronograma do contrato', conf: juros != null ? 92 : 68, auto: false });
        if (juros) add({ ...base, id: `${t.id}|jur`, data: t.venc || data, comp, deb: '4.2.1.01', cred: '2.1.1.01', valor: juros, hist: `Juros parcela — ${t.nome}`, modulo: 'Empréstimos → Contas a Pagar', motivo: `Juros do contrato ${t.contrato || ''}`, conf: 92, auto: false });
        if (pagoV > 0) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: '2.1.1.01', cred: '1.1.1.02', valor: pagoV, hist: `Pagamento parcela — ${t.nome}`, modulo: 'Empréstimos → Contas a Pagar', motivo: 'Pagamento registrado no Contas a Pagar', conf: 97, auto: true });
        continue;
      }
      const k = classificarDespesa(t, dec.regras);
      const ajustada = contas[`${t.id}|prov`];
      add({
        ...base, id: `${t.id}|prov`, data, comp, deb: ajustada || k.conta, cred: '2.1.1.01', valor: v,
        hist: `Provisão ${doc} — ${t.nome} — competência ${comp.split('-').reverse().join('/')}`, modulo: 'Financeiro → Contas a Pagar',
        motivo: ajustada ? 'Conta ajustada pelo contador' : k.motivo, conf: ajustada ? 100 : k.conf, auto: !!ajustada || k.auto, editavel: true, chaveRegra: chaveDoParceiro(t.nome),
      });
      if (pagoV > 0 && !baixaNoExtrato) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: '2.1.1.01', cred: '1.1.1.02', valor: pagoV, hist: `Pagamento ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Pagar', motivo: 'Pagamento registrado no Contas a Pagar', conf: 97, auto: true });
    } else {
      const ajustada = contas[`${t.id}|prov`];
      add({ ...base, id: `${t.id}|prov`, data, comp, deb: '1.1.2.01', cred: ajustada || '3.1.1.01', valor: v, hist: `${t.nf ? `Venda NF ${t.nf}` : `Título ${t.id}`} — ${t.nome}`, modulo: 'Financeiro → Contas a Receber', motivo: t.nf ? 'NF de saída vinculada ao título (natureza de venda)' : 'Título a receber sem NF vinculada: confirme a natureza', conf: t.nf ? 95 : 68, auto: !!t.nf, editavel: true });
      const tributos = (t.impostos || []).filter((x) => /icms|pis|cofins|\biss|ipi|ibs|cbs/i.test(x.nome)).reduce((a, x) => a + (Number(x.valor) || 0), 0);
      if (tributos > 0) add({ ...base, id: `${t.id}|ded`, data, comp, deb: '3.2.1.01', cred: '2.1.4.01', valor: tributos, hist: `Tributos destacados ${doc} — ${(t.impostos || []).filter((x) => x.valor > 0).map((x) => x.nome).join(', ')}`, modulo: 'Fiscal → NF de saída', motivo: 'Impostos destacados no XML da NF de saída', conf: 95, auto: true });
      if (pagoV > 0 && !baixaNoExtrato) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: '1.1.1.02', cred: '1.1.2.01', valor: pagoV, hist: `Recebimento ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Receber', motivo: 'Recebimento registrado no Contas a Receber', conf: 97, auto: true });
    }
  }

  for (const c of e.contratos || []) {
    if (/cancel/i.test(c.status || '') || !(c.valor > 0) || !c.dataContr || /conced/i.test(c.natureza || '')) continue;
    add({ id: `EMPCAP|${c.id}`, data: c.dataContr, comp: c.dataContr.slice(0, 7), deb: '1.1.1.02', cred: '2.1.3.01', valor: c.valor, hist: `Captação ${c.tipo} — ${c.instituicao} — contrato ${c.contrato}`, origemId: c.id, modulo: 'Empréstimos → captação', doc: `Contrato ${c.contrato}`, motivo: 'Valor liberado do contrato creditado no banco', conf: 92, auto: false });
  }

  for (const a of e.imobilizado || []) {
    if (!(a.valor > 0) || !a.data) continue;
    const v = a.valor * (a.qtd || 1);
    const abertura = /abertura/i.test(a.origem);
    add({ id: `IMB|${a.id}`, data: a.data, comp: a.data.slice(0, 7), deb: '1.2.3.01', cred: abertura ? '2.3.1.01' : '2.1.1.01', valor: v, hist: `${(a.qtd || 1) > 1 ? `${a.qtd} × ` : ''}${a.descricao}${abertura ? ' — saldo de abertura' : ' — aquisição'}`, origemId: a.id, modulo: 'Imobilizado', doc: a.nf ? `NF ${a.nf}` : 'Cadastro do imobilizado', motivo: abertura ? 'Bem já existente, reconhecido como saldo de abertura' : 'Aquisição de máquina: ativo imobilizado', conf: 90, auto: true });
    for (const d of depreciacaoMensal(a, hoje)) {
      add({ id: `DEP|${a.id}|${d.comp}`, data: `${d.comp}-28`, comp: d.comp, deb: '4.1.3.10', cred: '1.2.3.91', valor: d.valor, hist: `Depreciação ${a.taxa || 10}% a.a. — ${a.descricao}`, origemId: a.id, modulo: 'Imobilizado · depreciação', doc: 'Cálculo mensal', motivo: `Depreciação linear ${a.taxa || 10}% a.a.`, conf: 92, auto: true });
    }
  }

  const estornos: Lancamento[] = L.filter((l) => l.status === 'Estornado').map((l) => ({
    ...l, id: `${l.id}|est`, data: dec.estornos?.[l.id]?.data || l.data, deb: l.cred, cred: l.deb,
    hist: `Estorno — ${l.hist} — motivo: ${dec.estornos?.[l.id]?.motivo || '—'}`, motivo: 'Lançamento inverso do estorno', conf: 100, auto: true, status: 'Contabilizado', editavel: false,
  }));
  return L.concat(estornos).sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
}

/** Depreciação linear mensal a partir do mês seguinte à aquisição, até o mês atual ou o valor residual. */
export function depreciacaoMensal(a: ImobilizadoMotor, ateComp: string): { comp: string; valor: number }[] {
  const v = a.valor * (a.qtd || 1);
  const mensal = arred((v * ((a.taxa || 10) / 100)) / 12);
  const limite = v - (a.residual || 0);
  const out: { comp: string; valor: number }[] = [];
  let y = +a.data.slice(0, 4);
  let m = +a.data.slice(5, 7);
  let acum = 0;
  for (let k = 0; k < 1200; k++) {
    m++;
    if (m > 12) { m = 1; y++; }
    const comp = `${y}-${String(m).padStart(2, '0')}`;
    if (comp > ateComp) break;
    const vv = Math.min(mensal, arred(limite - acum));
    if (vv <= 0.004) break;
    acum = arred(acum + vv);
    out.push({ comp, valor: vv });
  }
  return out;
}
