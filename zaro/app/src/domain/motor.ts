// Motor contábil: transforma as operações (títulos, baixas, imobilizado, empréstimos) em
// lançamentos de partida dobrada. Os lançamentos são recalculados a partir das operações;
// o que fica gravado é a decisão do contador sobre cada um (status, conta ajustada, estorno).
import { arred } from './dinheiro';
import { lancamentosDaFolha, type FolhaImportada } from './folha-contabil';

export type StatusLanc = 'Automático' | 'Sugerido' | 'Em revisão' | 'Aprovado' | 'Contabilizado' | 'Estornado' | 'Excluído';
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
  /** movimento do extrato que quitou este título (a baixa do título não é lançada de novo) */
  tituloBaixado?: string;
  /** o vínculo extrato × título foi feito pelo usuário na conciliação */
  conciliadoManual?: boolean;
  /** tributos que compõem o lançamento (dedução de NF de saída), para o balancete por tributo */
  partes?: { nome: string; valor: number }[];
  /** natureza da receita pelo CFOP / tipo de nota, para o balancete no modelo do escritório */
  tipoReceita?: 'produto' | 'mercadoria' | 'servico' | 'outra';
}

export interface BaixaMotor {
  id?: string;
  data: string;
  valor: number;
  estornada?: boolean;
  /** encargos e abatimentos do pagamento (fora do principal do título) */
  desconto?: number;
  juros?: number;
  multa?: number;
  /** movimento do extrato conciliado manualmente com esta baixa (o banco sai uma vez só) */
  extratoId?: string | null;
  /** split payment CONFIRMADO com evidência: IBS/CBS segregados na liquidação e taxa do meio de pagamento */
  split?: { ibs: number; cbs: number; taxa: number } | null;
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
  cfop?: string | null;
  baixas?: BaixaMotor[];
}

/** Produto (fabricação própria / industrialização), mercadoria (revenda) ou serviço, pelo CFOP e pela nota. */
export function tipoDeReceita(t: Pick<TituloMotor, 'cfop' | 'categoria' | 'contaContabil'>): 'produto' | 'mercadoria' | 'servico' | 'outra' {
  const c = String(t.cfop || '').slice(1);
  if (['101', '103', '105', '109', '111', '116', '118', '122', '124', '125', '401', '402'].includes(c)) return 'produto';
  if (['102', '104', '106', '110', '112', '117', '119', '120', '123', '403', '404', '405'].includes(c)) return 'mercadoria';
  if (!t.cfop && (t.contaContabil === '3.1.1.02' || /servi[çc]o/i.test(t.categoria || ''))) return 'servico';
  return 'outra';
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
export interface MovimentoMotor {
  id: string;
  conta: string;
  data: string;
  valor: number;
  memo: string;
}
/** tributos do Lucro Presumido apurados no período (PIS/COFINS no mês; IRPJ, adicional e CSLL no trimestre) */
export interface TributoApurado {
  tributo: 'PIS' | 'COFINS' | 'IRPJ' | 'Adicional de IRPJ' | 'CSLL';
  comp: string; // último mês do período
  periodo: string; // ex.: "03/2026" ou "1º trimestre/2026"
  base: number;
  valor: number;
}
const CONTA_TRIBUTO: Record<TributoApurado['tributo'], string> = { PIS: '3.2.1.01', COFINS: '3.2.1.01', IRPJ: '4.3.1.01', 'Adicional de IRPJ': '4.3.1.02', CSLL: '4.3.1.03' };

export interface AberturaMotor {
  data: string;
  /** saldo por conta: positivo = devedor, negativo = credor; a soma tem de ser zero */
  contas: { conta: string; valor: number }[];
  fonte?: string;
}
export const CONTA_ABERTURA = '2.3.9.99';

export interface CreditoMotor {
  id: string;
  /** título da compra: o crédito sai da conta de custo em que a provisão foi lançada */
  tituloId: string;
  doc: string;
  nome: string;
  data: string;
  comp: string;
  icms: number;
  ipi: number;
}
export interface EntradaMotor {
  titulos: TituloMotor[];
  /** extrato bancário: nos anos que têm extrato, o caixa vem daqui */
  extrato?: MovimentoMotor[];
  /** nome da empresa, para reconhecer transferências entre contas próprias */
  empresaNome?: string;
  imobilizado?: ImobilizadoMotor[];
  contratos?: ContratoMotor[];
  /** saldo do banco informado (extrato) numa data: o banco do ZARO é acertado a ele */
  saldoInicialBanco?: { data: string; valor: number } | null;
  /** balanço de abertura (ex.: encerramento do exercício anterior): a partir da data, a contabilidade parte
   *  destes saldos e o histórico até ela fica de fora, porque já está dentro do balanço */
  abertura?: AberturaMotor | null;
  /** resumos da folha importados no Departamento Pessoal */
  folhas?: FolhaImportada[];
  /** ICMS/IPI das NF de compra que viram crédito (Fiscal → Impostos a recuperar) */
  creditos?: CreditoMotor[];
  /** PIS, COFINS, IRPJ e CSLL do Lucro Presumido, apurados pela Fiscal */
  tributosApurados?: TributoApurado[];
  /** crédito de ICMS usado para abater o ICMS das vendas, por competência */
  compensacoesIcms?: { comp: string; valor: number }[];
  decisoes?: DecisoesContador;
  hoje?: string;
}

const REGRAS_DESPESA: [RegExp, string, string, number][] = [
  [/energia|eletric/, '4.1.3.01', 'energia elétrica', 96],
  [/aluguel|condom/, '4.1.3.02', 'aluguel', 94],
  [/manuten/, '4.1.3.03', 'manutenção', 90],
  [/combust|\bposto\b|ve[ií]culo/, '4.1.3.04', 'combustível ou veículo', 90],
  [/telefon|internet|\bclaro\b|\bvivo\b|\btim\b/, '4.1.3.05', 'telefone e internet', 92],
  [/tarifa|banc[áa]ria/, '4.2.1.02', 'tarifa bancária', 95],
  [/juros/, '4.2.1.01', 'juros', 92],
  [/\bdarf\b|pgdas|\bdas[\s-]*(simples|mei|\d)|\bgps\b|tribut|imposto|receita federal|sefaz|\bicms\b|\biss\b|\bguia\b/, '2.1.4.01', 'guia de tributo', 88],
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
  // "subst. tributária" na natureza da NF de compra não é guia de tributo
  const texto = `${t.categoria || ''} ${t.nome} ${t.descricao || ''}`.toLowerCase().replace(/subst\w*\.?\s*tribut\w*/g, 'st');
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
  // o extrato vem primeiro: título quitado por um movimento do banco não ganha outra baixa
  const movimentos = (e.extrato || []).filter((m) => !ehSaldoAnterior(m.memo));
  const funcionarios = [...new Set((e.folhas || []).flatMap((f) => f.resumo.funcionarios || []))];
  const doExtrato = lancamentosDoExtrato(movimentos, e.titulos, e.empresaNome || '', dec, funcionarios);
  // no período coberto pelo extrato o banco vem só dele: pagamento registrado no título que não casou com
  // um movimento fica "a conciliar", senão o mesmo dinheiro sairia duas vezes do banco
  const datas = movimentos.map((m) => m.data).sort();
  const cobertura = datas.length ? [datas[0], datas[datas.length - 1]] : null;
  const banco = (data: string) => (cobertura && data >= cobertura[0] && data <= cobertura[1] ? '1.1.9.98' : '1.1.1.02');
  // títulos ligados ao extrato pela regra automática (os manuais já tiram a baixa vinculada abaixo)
  const quitadosNoExtrato = new Set(doExtrato.filter((l) => !l.conciliadoManual).map((l) => l.tituloBaixado).filter(Boolean));
  const hoje = (e.hoje || new Date().toISOString()).slice(0, 7);
  const L: Lancamento[] = [];

  const add = (l: Omit<Lancamento, 'status'>) => {
    const padrao: StatusLanc = /^(IMB|DEP|ABERT)\|/.test(l.id) ? 'Aprovado' : l.conf < 70 ? 'Em revisão' : l.auto ? 'Automático' : 'Sugerido';
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
    // baixa conciliada com o extrato já sai do banco pelo lançamento do extrato
    const semExtrato = baixas.filter((b) => !b.extratoId);
    const pagoV = baixas.length ? semExtrato.reduce((a, b) => a + b.valor, 0) : pagoTotal(t.status) ? v : 0;
    const dataPag = semExtrato.length ? semExtrato[semExtrato.length - 1].data : t.venc || data;
    const baixaNoExtrato = quitadosNoExtrato.has(t.id);
    const base = { origemId: t.id, doc };

    // juros, multa e desconto de cada pagamento/recebimento: resultado financeiro, contra o banco
    baixas.forEach((b, i) => {
      const k = `${t.id}|enc|${b.id || i}`;
      const comum = { ...base, data: b.data, comp: b.data.slice(0, 7), conf: 97, auto: true };
      if (t.tipo === 'pagar') {
        if (b.juros) add({ ...comum, id: `${k}|jur`, deb: '4.2.1.01', cred: banco(b.data), valor: b.juros, hist: `Juros pagos ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Pagar', motivo: 'Juros informados no registro do pagamento' });
        if (b.multa) add({ ...comum, id: `${k}|mul`, deb: '4.2.1.04', cred: banco(b.data), valor: b.multa, hist: `Multa por atraso ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Pagar', motivo: 'Multa informada no registro do pagamento' });
        if (b.desconto) add({ ...comum, id: `${k}|des`, deb: banco(b.data), cred: '4.2.1.03', valor: b.desconto, hist: `Desconto obtido ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Pagar', motivo: 'Desconto informado no registro do pagamento' });
      } else {
        if ((b.juros || 0) + (b.multa || 0)) add({ ...comum, id: `${k}|jur`, deb: banco(b.data), cred: '4.2.1.03', valor: (b.juros || 0) + (b.multa || 0), hist: `Juros e multa recebidos ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Receber', motivo: 'Encargos informados no registro do recebimento' });
        if (b.desconto) add({ ...comum, id: `${k}|des`, deb: '4.2.1.05', cred: banco(b.data), valor: b.desconto, hist: `Desconto concedido ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Receber', motivo: 'Desconto informado no registro do recebimento' });
      }
    });

    if (t.tipo === 'pagar') {
      if (t.origem === 'folha') {
        const passivo = { Salário: '2.1.2.01', INSS: '2.1.2.02', FGTS: '2.1.2.03', IRRF: '2.1.2.04' }[t.folhaTipo || ''] || '2.1.2.01';
        if (pagoV > 0) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: passivo, cred: banco(dataPag), valor: pagoV, hist: `Pagamento ${t.folhaTipo || 'folha'} — ${t.nome} — folha ${comp}`, modulo: 'Folha → Contas a Pagar', motivo: 'Baixa do passivo gerado no fechamento da folha', conf: 97, auto: true });
        continue;
      }
      if (t.origem === 'emprestimo') {
        const juros = t.juros != null ? Math.min(Number(t.juros) || 0, v) : null;
        const principal = juros != null ? v - juros : v;
        const contaEmp = /pessoa f[ií]sica/i.test(t.nome) ? '2.1.3.02' : '2.1.3.01';
        add({ ...base, id: `${t.id}|prov`, data: t.venc || data, comp, deb: contaEmp, cred: '2.1.1.01', valor: principal, hist: `Principal parcela — ${t.nome} — contrato ${t.contrato || ''}`, modulo: 'Empréstimos → Contas a Pagar', motivo: juros != null ? 'Amortização do principal conforme o contrato' : 'Parcela sem separação de juros: confirme o cronograma do contrato', conf: juros != null ? 92 : 68, auto: false });
        if (juros) add({ ...base, id: `${t.id}|jur`, data: t.venc || data, comp, deb: '4.2.1.01', cred: '2.1.1.01', valor: juros, hist: `Juros parcela — ${t.nome}`, modulo: 'Empréstimos → Contas a Pagar', motivo: `Juros do contrato ${t.contrato || ''}`, conf: 92, auto: false });
        if (pagoV > 0) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: '2.1.1.01', cred: banco(dataPag), valor: pagoV, hist: `Pagamento parcela — ${t.nome}`, modulo: 'Empréstimos → Contas a Pagar', motivo: 'Pagamento registrado no Contas a Pagar', conf: 97, auto: true });
        continue;
      }
      const k = classificarDespesa(t, dec.regras);
      const ajustada = contas[`${t.id}|prov`];
      add({
        ...base, id: `${t.id}|prov`, data, comp, deb: ajustada || k.conta, cred: '2.1.1.01', valor: v,
        hist: `Provisão ${doc} — ${t.nome} — competência ${comp.split('-').reverse().join('/')}`, modulo: 'Financeiro → Contas a Pagar',
        motivo: ajustada ? 'Conta ajustada pelo contador' : k.motivo, conf: ajustada ? 100 : k.conf, auto: !!ajustada || k.auto, editavel: true, chaveRegra: chaveDoParceiro(t.nome),
      });
      if (pagoV > 0 && !baixaNoExtrato) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: '2.1.1.01', cred: banco(dataPag), valor: pagoV, hist: `Pagamento ${doc} — ${t.nome}`, modulo: 'Financeiro → Contas a Pagar', motivo: 'Pagamento registrado no Contas a Pagar', conf: 97, auto: true });
    } else {
      const ajustada = contas[`${t.id}|prov`];
      add({ ...base, id: `${t.id}|prov`, data, comp, deb: '1.1.2.01', cred: ajustada || '3.1.1.01', valor: v, hist: `${t.nf ? `Venda NF ${t.nf}` : `Título ${t.id}`} — ${t.nome}`, modulo: 'Financeiro → Contas a Receber', motivo: t.nf ? 'NF de saída vinculada ao título (natureza de venda)' : 'Título a receber sem NF vinculada: confirme a natureza', conf: t.nf ? 95 : 68, auto: !!t.nf, editavel: true, tipoReceita: tipoDeReceita(t) });
      const partes = (t.impostos || []).filter((x) => /icms|pis|cofins|\biss|ipi|ibs|cbs/i.test(x.nome) && Number(x.valor) > 0).map((x) => ({ nome: x.nome, valor: Number(x.valor) }));
      const tributos = partes.reduce((a, x) => a + x.valor, 0);
      if (tributos > 0) add({ ...base, id: `${t.id}|ded`, data, comp, deb: '3.2.1.01', cred: '2.1.4.01', valor: tributos, hist: `Tributos destacados ${doc} — ${(t.impostos || []).filter((x) => x.valor > 0).map((x) => x.nome).join(', ')}`, modulo: 'Fiscal → NF de saída', motivo: 'Impostos destacados no XML da NF de saída', conf: 95, auto: true, partes });
      // split payment confirmado: o cliente pagou o total, o banco recebeu o líquido; a parte segregada extingue
      // a obrigação de IBS/CBS e a taxa do meio de pagamento é despesa bancária (não é tributo)
      const retido = semExtrato.reduce((a, b) => a + (b.split ? b.split.ibs + b.split.cbs + b.split.taxa : 0), 0);
      if (pagoV > 0 && !baixaNoExtrato && pagoV - retido > 0.004) add({ ...base, id: `${t.id}|pag`, data: dataPag, comp, deb: banco(dataPag), cred: '1.1.2.01', valor: Math.round((pagoV - retido) * 100) / 100, hist: `Recebimento ${doc} — ${t.nome}${retido ? ' (líquido do split payment)' : ''}`, modulo: 'Financeiro → Contas a Receber', motivo: 'Recebimento registrado no Contas a Receber', conf: 97, auto: true });
      baixas.forEach((b, i) => {
        if (!b.split) return;
        const k = `${t.id}|spl|${b.id || i}`;
        const comum = { ...base, data: b.data, comp: b.data.slice(0, 7), conf: 95, auto: true, modulo: 'Fiscal → Split Payment' };
        if (b.split.ibs + b.split.cbs > 0) add({ ...comum, id: `${k}|trib`, deb: '2.1.4.01', cred: '1.1.2.01', valor: Math.round((b.split.ibs + b.split.cbs) * 100) / 100, hist: `IBS ${b.split.ibs.toFixed(2)} + CBS ${b.split.cbs.toFixed(2)} segregados no pagamento ${doc} — ${t.nome}`, motivo: 'Split payment confirmado com evidência: extinção da obrigação na liquidação' });
        if (b.split.taxa > 0) add({ ...comum, id: `${k}|taxa`, deb: '4.2.1.02', cred: '1.1.2.01', valor: b.split.taxa, hist: `Taxa do meio de pagamento ${doc} — ${t.nome}`, motivo: 'Taxa do PSP informada na liquidação (despesa bancária)' });
      });
    }
  }

  // crédito de ICMS/IPI da compra: sai do custo e vai para tributos a recuperar
  const provPorTitulo = new Map(L.filter((l) => l.id.endsWith('|prov')).map((l) => [l.origemId, l]));
  for (const c of e.creditos || []) {
    const prov = provPorTitulo.get(c.tituloId);
    if (!prov || prov.status === 'Excluído' || !/^[34]\./.test(prov.deb)) continue;
    const partes = [['ICMS', c.icms], ['IPI', c.ipi]].filter(([, v]) => Number(v) > 0).map(([nome, valor]) => ({ nome: String(nome), valor: Number(valor) }));
    add({
      id: `CRED|${c.id}`, origemId: c.tituloId, doc: c.doc, data: c.data, comp: c.comp, deb: '1.1.4.01', cred: prov.deb, valor: c.icms + c.ipi,
      hist: `Crédito ${partes.map((p) => `${p.nome} ${p.valor.toFixed(2)}`).join(' + ')} na compra ${c.doc} — ${c.nome}`, modulo: 'Fiscal → Impostos a recuperar',
      motivo: 'Imposto destacado em item de insumo/matéria-prima: recuperável, não é custo', conf: 92, auto: true, partes,
    });
  }
  for (const t of e.tributosApurados || []) {
    const [a, m] = t.comp.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    const deducao = t.tributo === 'PIS' || t.tributo === 'COFINS';
    add({
      id: `TRIB|${t.tributo}|${t.comp}`, origemId: `TRIB|${t.comp}`, doc: `Apuração ${t.periodo}`, data: fim, comp: t.comp,
      deb: CONTA_TRIBUTO[t.tributo], cred: '2.1.4.01', valor: t.valor,
      hist: `${t.tributo} ${deducao ? 'sobre o faturamento' : 'do Lucro Presumido'} — ${t.periodo} (base ${t.base.toFixed(2)})`, modulo: 'Fiscal → Apuração',
      motivo: deducao ? `${t.tributo} cumulativo do Lucro Presumido sobre a receita do mês, sem o ICMS destacado` : `${t.tributo} pela presunção do Lucro Presumido no trimestre`,
      conf: 93, auto: true, ...(deducao ? { partes: [{ nome: t.tributo, valor: t.valor }] } : {}),
    });
  }
  for (const c of e.compensacoesIcms || []) {
    const [a, m] = c.comp.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    add({
      id: `APUR|ICMS|${c.comp}`, origemId: `APUR|ICMS|${c.comp}`, doc: `Apuração ICMS ${c.comp.split('-').reverse().join('/')}`, data: fim, comp: c.comp, deb: '2.1.4.01', cred: '1.1.4.01', valor: c.valor,
      hist: `ICMS — compensação de créditos na apuração ${c.comp.split('-').reverse().join('/')}`, modulo: 'Fiscal → Impostos a recuperar',
      motivo: 'Crédito das compras abatido do ICMS das vendas do mês', conf: 95, auto: true, partes: [{ nome: 'ICMS', valor: c.valor }],
    });
  }

  for (const c of e.contratos || []) {
    if (/cancel/i.test(c.status || '') || !(c.valor > 0) || !c.dataContr || /conced/i.test(c.natureza || '')) continue;
    add({ id: `EMPCAP|${c.id}`, data: c.dataContr, comp: c.dataContr.slice(0, 7), deb: banco(c.dataContr), cred: '2.1.3.01', valor: c.valor, hist: `Captação ${c.tipo} — ${c.instituicao} — contrato ${c.contrato}`, origemId: c.id, modulo: 'Empréstimos → captação', doc: `Contrato ${c.contrato}`, motivo: 'Valor liberado do contrato creditado no banco', conf: 92, auto: false });
  }

  for (const a of e.imobilizado || []) {
    if (!(a.valor > 0) || !a.data) continue;
    const v = a.valor * (a.qtd || 1);
    const abertura = /abertura/i.test(a.origem);
    const [contaBem, contaDep] = contasDoBem(a.descricao);
    add({ id: `IMB|${a.id}`, data: a.data, comp: a.data.slice(0, 7), deb: contaBem, cred: abertura ? '2.3.1.01' : '2.1.1.01', valor: v, hist: `${(a.qtd || 1) > 1 ? `${a.qtd} × ` : ''}${a.descricao}${abertura ? ' — saldo de abertura' : ' — aquisição'}`, origemId: a.id, modulo: 'Imobilizado', doc: a.nf ? `NF ${a.nf}` : 'Cadastro do imobilizado', motivo: abertura ? 'Bem já existente, reconhecido como saldo de abertura' : 'Aquisição de máquina: ativo imobilizado', conf: 90, auto: true });
    for (const d of depreciacaoMensal(a, hoje)) {
      add({ id: `DEP|${a.id}|${d.comp}`, data: `${d.comp}-28`, comp: d.comp, deb: '4.1.3.10', cred: contaDep, valor: d.valor, hist: `Depreciação ${a.taxa || 10}% a.a. — ${a.descricao}`, origemId: a.id, modulo: 'Imobilizado · depreciação', doc: 'Cálculo mensal', motivo: `Depreciação linear ${a.taxa || 10}% a.a.`, conf: 92, auto: true });
    }
  }

  for (const { status: _s, ...l } of lancamentosDaFolha(e.folhas || [])) add(l);

  for (const l of doExtrato) add(l);

  // balanço de abertura: o que é até a data já está nos saldos dele
  const ab = e.abertura;
  if (ab?.data && ab.contas.length) {
    for (let i = L.length - 1; i >= 0; i--) if (L[i].data <= ab.data) L.splice(i, 1);
    for (const c of ab.contas) {
      const v = arred(c.valor);
      if (Math.abs(v) < 0.005 || c.conta === CONTA_ABERTURA) continue;
      add({
        id: `ABERT|${c.conta}`, data: ab.data, comp: ab.data.slice(0, 7), deb: v > 0 ? c.conta : CONTA_ABERTURA, cred: v > 0 ? CONTA_ABERTURA : c.conta, valor: Math.abs(v),
        hist: `Saldo de abertura em ${ab.data.split('-').reverse().join('/')}${ab.fonte ? ` — ${ab.fonte}` : ''}`, origemId: 'abertura', modulo: 'Contabilidade · saldos de abertura',
        doc: ab.fonte || 'Balanço de abertura', motivo: 'Saldo do balanço de encerramento do exercício anterior', conf: 99, auto: true,
      });
    }
  }

  // saldo de abertura do banco = saldo anterior do extrato; a diferença para o que o ZARO tinha acumulado vira ajuste
  // (com balanço de abertura na mesma data ou depois, o banco já vem dele)
  const ini = e.saldoInicialBanco;
  if (ini && cobertura && ini.data < cobertura[1] && !(ab?.contas.length && ini.data <= ab.data)) {
    const dataSaldo = ini.data;
    const acumulado = L.filter((l) => l.data <= dataSaldo && l.status !== 'Excluído').reduce((a, l) => a + (l.deb === '1.1.1.02' ? l.valor : 0) - (l.cred === '1.1.1.02' ? l.valor : 0), 0);
    const extrato = ini.valor;
    const dif = arred(extrato - acumulado);
    add({
      id: 'BKSALDO|abertura', data: dataSaldo, comp: dataSaldo.slice(0, 7), deb: dif > 0 ? '1.1.1.02' : '2.3.1.01', cred: dif > 0 ? '2.3.1.01' : '1.1.1.02', valor: Math.abs(dif),
      hist: `Ajuste do saldo bancário ao saldo do extrato em ${dataSaldo.split('-').reverse().join('/')} (${extrato.toFixed(2)})`,
      origemId: 'extrato', modulo: 'Extrato bancário · saldo de abertura', doc: 'Extrato', motivo: `O extrato mostra ${extrato.toFixed(2)} e o ZARO tinha ${arred(acumulado).toFixed(2)} no banco nessa data`, conf: 90, auto: true,
    });
  }

  const estornos: Lancamento[] = L.filter((l) => l.status === 'Estornado').map((l) => ({
    ...l, id: `${l.id}|est`, data: dec.estornos?.[l.id]?.data || l.data, deb: l.cred, cred: l.deb,
    hist: `Estorno — ${l.hist} — motivo: ${dec.estornos?.[l.id]?.motivo || '—'}`, motivo: 'Lançamento inverso do estorno', conf: 100, auto: true, status: 'Contabilizado', editavel: false,
  }));
  return L.concat(estornos).sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
}

/** Depreciação linear mensal a partir do mês seguinte à aquisição, até o mês atual ou o valor residual. */
/** Conta do bem e da depreciação acumulada pela descrição: informática, veículos ou máquinas. */
export function contasDoBem(descricao: string): [string, string] {
  if (/notebook|computador|all in one|desktop|monitor|impressora|servidor|inform[aá]tica/i.test(descricao)) return ['1.2.3.02', '1.2.3.92'];
  if (/\bvan\b|ve[ií]culo|carro|caminh[aã]o|minibus|\bmoto|utilit[aá]rio|renault|fiat|toyota/i.test(descricao)) return ['1.2.3.03', '1.2.3.93'];
  return ['1.2.3.01', '1.2.3.91'];
}

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

// ---------- extrato bancário ----------

const normal = (s: string) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const PALAVRAS_VAZIAS = new Set(['LTDA', 'SA', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'ME', 'EPP', 'EIRELI', 'IND', 'COM', 'INDUSTRIA', 'COMERCIO', 'SERVICOS', 'PIX', 'TED', 'PAGTO', 'PAGAMENTO']);
const palavras = (s: string) => normal(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w));
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 864e5;
/** Linha de saldo anterior guardada com o extrato importado (não é movimento). */
export const ehSaldoAnterior = (memo: string) => /^SALDO ANTERIOR\b/i.test(memo || '');
export const chaveDoExtrato = (memo: string) => `extrato:${palavras(memo).slice(0, 3).join(' ')}`;

const SAIDAS: [RegExp, string, string, number][] = [
  [/JUDICIAL/, '1.2.1.01', 'Bloqueio ou transferência judicial: depósito judicial', 85],
  [/OPERAC\w* VENCID/, '2.1.3.01', 'Operação de crédito vencida debitada pelo banco: amortiza empréstimo (confirme o contrato)', 75],
  [/TARIFA|\bTAR\b|CESTA|PACOTE|MANUT CONTA|ANUIDADE/, '4.2.1.02', 'Tarifa bancária', 95],
  [/JUROS|MORA|ENCARGO|\bIOF\b|MULTA/, '4.2.1.01', 'Juros, mora ou IOF', 92],
  [/SAQUE/, '1.1.1.01', 'Saque em dinheiro: vai para o caixa', 90],
  [/FGTS/, '2.1.2.03', 'Recolhimento do FGTS: baixa de FGTS a recolher', 90],
  [/\bGPS\b|\bINSS\b/, '2.1.2.02', 'Recolhimento do INSS: baixa de INSS a recolher', 88],
  [/DARF|\bDAS\b|SIMPLES NAC|SEFAZ|\bDAR\b|RECEITA FED|TRIBUT|\bTRIB\b/, '2.1.4.01', 'Guia de tributo paga: baixa da obrigação tributária', 88],
  [/PREFEIT|DETRAN|IPVA|\bTAXA\b/, '4.1.4.01', 'Taxa paga', 85],
  [/FINANC|PARCELA|CONSORC|LEASING|EMPREST|CAPITAL DE GIRO|CAPITAL GIRO/, '2.1.3.01', 'Parcela de empréstimo ou financiamento: reduz a dívida', 75],
  [/ENERGIA|ELETRICIDADE/, '4.1.3.01', 'Energia elétrica', 90],
  [/ALUGUEL|CONDOMIN/, '4.1.3.02', 'Aluguel', 85],
  [/POSTO|COMBUST|GASOLIN|DIESEL/, '4.1.3.04', 'Combustível', 85],
  [/TELEF|\bVIVO\b|\bCLARO\b|\bTIM\b|INTERNET/, '4.1.3.05', 'Telefone e internet', 85],
  [/SALARIO|FOLHA|PROVENTO|ADIANT/, '4.1.2.01', 'Pagamento a funcionário', 85],
  [/LTDA|EIRELI|\bME\b|\bSA\b|S\/A|BOLETO|TITULO/, '2.1.1.01', 'Pagamento a fornecedor (o custo vem da NF no Contas a Pagar)', 70],
];
const ENTRADAS: [RegExp, string, string, number][] = [
  [/EMPREST|CAPITAL DE GIRO|CAPITAL GIRO|LIBERAC/, '2.1.3.01', 'Crédito de empréstimo: aumenta a dívida', 85],
  [/JUDICIAL/, '1.2.1.01', 'Desbloqueio judicial: devolve o depósito judicial', 85],
  [/DEP\w* DIN|DEPOSITO EM DINHEIRO/, '1.1.1.01', 'Depósito em dinheiro: sai do caixa', 85],
  [/RENDIMENTO|REMUNERA/, '4.2.1.03', 'Rendimento de aplicação (receita financeira)', 90],
];

/** Classifica cada movimento do extrato. Saída que bate com título a pagar vira baixa de
 *  fornecedor; entrada que bate com título a receber vira baixa de clientes (sem dupla contagem). */
export function lancamentosDoExtrato(movs: MovimentoMotor[], titulos: TituloMotor[], empresaNome: string, dec: DecisoesContador, funcionarios: string[] = []): Omit<Lancamento, 'status'>[] {
  const proprios = palavras(empresaNome).slice(0, 2);
  // sigla do grupo (ex.: "A B S" → ABS): outras empresas com a mesma sigla são ligadas
  const sigla = (normal(empresaNome).match(/^((?:[A-Z]\.? ){2,})/)?.[1] || '').replace(/[^A-Z]/g, '');
  const juntaSiglas = (s: string) => s.replace(/\b([A-Z])\.? (?=[A-Z]\b)/g, '$1');
  const nomesFunc = funcionarios.map((n) => palavras(n)).filter((p) => p.length >= 2);
  const CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
  const temSigla = (memo: string) => !!sigla && sigla.length >= 2 && new RegExp(`\\b${sigla}\\b`).test(juntaSiglas(normal(memo)));
  // CNPJ que aparece junto da sigla do grupo é de empresa ligada também nos movimentos que só trazem o CNPJ
  const cnpjsLigados = new Set(movs.filter((m) => temSigla(m.memo) && !(proprios.length === 2 && proprios.every((w) => normal(m.memo).includes(w)))).flatMap((m) => m.memo.match(CNPJ) || []));
  const parceiros = (tipo: 'pagar' | 'receber') => [...new Map(titulos.filter((t) => t.tipo === tipo && t.valor > 0).map((t) => [chaveDoParceiro(t.nome), palavras(t.nome)])).values()].filter((p) => p.length);
  const regras = dec.regras || {};
  const contas = dec.contas || {};
  const candidatos = titulos
    .filter((t) => !t.retorno && !/cancel/i.test(t.status) && t.valor > 0)
    .map((t) => ({ t, tk: new Set(palavras(t.nome)), usado: false }));
  const out: Omit<Lancamento, 'status'>[] = [];
  // conciliação manual: a baixa aponta para o movimento do extrato
  const vinculo = new Map<string, (typeof candidatos)[number]>();
  for (const c of candidatos) for (const b of c.t.baixas || []) if (b.extratoId && !b.estornada) { vinculo.set(b.extratoId, c); c.usado = true; }
  for (const m of [...movs].sort((a, b) => a.data.localeCompare(b.data))) {
    const memo = normal(m.memo);
    const v = Math.abs(m.valor);
    if (!(v > 0)) continue;
    const manual = vinculo.get(m.id);
    if (manual) {
      const entradaM = m.valor > 0;
      out.push({ id: `BKX|${m.id}`, data: m.data, comp: m.data.slice(0, 7), valor: v, hist: `${m.memo.slice(0, 120)} — ${m.conta}`, origemId: m.id, doc: 'Extrato', modulo: `Extrato bancário · ${entradaM ? 'entrada' : 'saída'}`, chaveRegra: chaveDoExtrato(m.memo), deb: entradaM ? '1.1.1.02' : '2.1.1.01', cred: entradaM ? '1.1.2.01' : '1.1.1.02', motivo: `Conciliado manualmente com o título ${manual.t.id} (${manual.t.nome})`, conf: 99, auto: true, tituloBaixado: manual.t.id, conciliadoManual: true });
      continue;
    }
    const entrada = m.valor > 0;
    if (/MESMA TITUL|ENTRE CONTAS|TRANSF.*PROPRIA/.test(memo) || (proprios.length === 2 && proprios.every((w) => memo.includes(w)))) {
      // transferência entre contas da própria empresa: passa pela conta de trânsito (zera quando os dois lados estão no extrato)
      out.push({ id: `BKX|${m.id}`, data: m.data, comp: m.data.slice(0, 7), valor: v, hist: `${m.memo.slice(0, 120)} — ${m.conta}`, origemId: m.id, doc: 'Extrato', modulo: `Extrato bancário · ${entrada ? 'entrada' : 'saída'}`, deb: entrada ? '1.1.1.02' : '1.1.9.97', cred: entrada ? '1.1.9.97' : '1.1.1.02', motivo: 'Transferência entre contas da própria empresa', conf: 95, auto: true });
      continue;
    }
    const tk = palavras(m.memo);
    const tipo = entrada ? 'receber' : 'pagar';
    const par = candidatos.find((c) => !c.usado && c.t.tipo === tipo && Math.abs(c.t.valor - v) < 0.011 && tk.some((w) => c.tk.has(w)) && dias(c.t.venc || m.data, m.data) <= 45)
      || candidatos.find((c) => !c.usado && c.t.tipo === tipo && Math.abs(c.t.valor - v) < 0.011 && dias(c.t.venc || m.data, m.data) <= 7);
    const base = { id: `BKX|${m.id}`, data: m.data, comp: m.data.slice(0, 7), valor: v, hist: `${m.memo.slice(0, 120)} — ${m.conta}`, origemId: m.id, doc: 'Extrato', modulo: `Extrato bancário · ${entrada ? 'entrada' : 'saída'}`, chaveRegra: chaveDoExtrato(m.memo) };
    if (par) {
      par.usado = true;
      out.push({ ...base, deb: entrada ? '1.1.1.02' : '2.1.1.01', cred: entrada ? '1.1.2.01' : '1.1.1.02', motivo: `Baixa do título ${par.t.id} (${par.t.nome}): mesmo valor e data próxima`, conf: 92, auto: true, tituloBaixado: par.t.id });
      continue;
    }
    const ajustada = contas[base.id];
    const aprendida = regras[base.chaveRegra];
    const tks = new Set(tk);
    const contem = (p: string[]) => p.every((w) => tks.has(w)) || (p.length >= 3 && p.filter((w) => tks.has(w)).length >= 2);
    // quem é a contraparte: funcionário, empresa do grupo, cliente ou fornecedor conhecido
    const pessoa = !entrada && nomesFunc.some((p) => p.every((w) => tks.has(w)));
    const ligada = temSigla(m.memo) || (m.memo.match(CNPJ) || []).some((c) => cnpjsLigados.has(c));
    const parceiro = (entrada ? parceiros('receber') : parceiros('pagar')).some(contem);
    const r: [RegExp, string, string, number] | undefined = pessoa ? [/./, '2.1.2.01', 'Pagamento a funcionário (salário, adiantamento ou vale): baixa de salários a pagar', 88]
      : (entrada ? ENTRADAS : SAIDAS).find(([re]) => re.test(memo))
        || (parceiro ? [/./, entrada ? '1.1.2.01' : '2.1.1.01', entrada ? 'Recebimento de cliente com títulos no ZARO (nenhum de mesmo valor): baixa em clientes' : 'Pagamento a fornecedor com títulos no ZARO (nenhum de mesmo valor): baixa em fornecedores', 80] : undefined)
        || (ligada ? [/./, '2.1.5.01', `Empresa do grupo ${sigla}: conta corrente entre empresas ligadas`, 85] : undefined);
    const conta = ajustada || aprendida || (r ? r[1] : entrada ? '2.1.9.99' : '1.1.9.99');
    const motivo = ajustada ? 'Conta ajustada pelo contador' : aprendida ? 'Regra aprendida para este histórico' : r ? r[2] : entrada ? 'Entrada sem origem identificada: a identificar' : 'Saída sem histórico claro: a identificar';
    const conf = ajustada ? 100 : aprendida ? 98 : r ? r[3] : 50;
    out.push({ ...base, deb: entrada ? '1.1.1.02' : conta, cred: entrada ? conta : '1.1.1.02', motivo, conf, auto: conf >= 95, editavel: true });
  }
  return out;
}
