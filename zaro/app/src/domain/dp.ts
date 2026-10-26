// Departamento Pessoal — CONFERÊNCIA. O ZARO não calcula a folha nem transmite obrigações: ele lê a folha
// processada no sistema externo e confere cada valor contra as tabelas oficiais, o cadastro e as guias.
// Diferença encontrada não é erro comprovado: vira "Revisão necessária" quando depende de rubrica, base ou
// informação que o documento não traz (dependentes, pensão, incidências específicas).
import { arred } from './dinheiro';

// ——— Tabelas oficiais versionadas ———
export interface TabelaDP {
  versao: string;
  de: string; // competência inicial (AAAA-MM)
  ate: string | null;
  inss: { ate: number; aliq: number }[]; // faixas progressivas do segurado
  teto: number;
  irrf: { ate: number | null; aliq: number; deduzir: number }[];
  dependente: number;
  simplificado: number;
  redutor: { isentoAte: number; maxReducao: number; ate: number; a: number; b: number } | null;
  fonte: string;
}

export const TABELAS_DP: TabelaDP[] = [
  {
    versao: 'DP-2025.05', de: '2025-05', ate: '2025-12',
    inss: [{ ate: 1518, aliq: 7.5 }, { ate: 2793.88, aliq: 9 }, { ate: 4190.83, aliq: 12 }, { ate: 8157.41, aliq: 14 }], teto: 8157.41,
    irrf: [{ ate: 2428.8, aliq: 0, deduzir: 0 }, { ate: 2826.65, aliq: 7.5, deduzir: 182.16 }, { ate: 3751.05, aliq: 15, deduzir: 394.16 }, { ate: 4664.68, aliq: 22.5, deduzir: 675.49 }, { ate: null, aliq: 27.5, deduzir: 908.73 }],
    dependente: 189.59, simplificado: 607.2, redutor: null,
    fonte: 'INSS: Portaria Interministerial MPS/MF de 2025 · IRRF: Lei 15.191/2025 (tabela a partir de maio/2025)',
  },
  {
    versao: 'DP-2026.01', de: '2026-01', ate: null,
    inss: [{ ate: 1621, aliq: 7.5 }, { ate: 2902.84, aliq: 9 }, { ate: 4354.27, aliq: 12 }, { ate: 8157.41, aliq: 14 }], teto: 8157.41,
    irrf: [{ ate: 2428.8, aliq: 0, deduzir: 0 }, { ate: 2826.65, aliq: 7.5, deduzir: 182.16 }, { ate: 3751.05, aliq: 15, deduzir: 394.16 }, { ate: 4664.68, aliq: 22.5, deduzir: 675.49 }, { ate: null, aliq: 27.5, deduzir: 908.73 }],
    dependente: 189.59, simplificado: 607.2, redutor: { isentoAte: 5000, maxReducao: 312.89, ate: 7350, a: 978.62, b: 0.133145 },
    fonte: 'INSS: Portaria Interministerial MPS/MF de 2026 (salário mínimo R$ 1.621,00) · IRRF: redução da Lei 15.270/2025',
  },
];

export const tabelaDe = (comp: string) => TABELAS_DP.find((t) => comp >= t.de && (!t.ate || comp <= t.ate)) || null;

/** INSS do segurado, progressivo por faixa, limitado ao teto. */
export function inssSegurado(base: number, t: TabelaDP) {
  let ant = 0;
  let total = 0;
  for (const f of t.inss) {
    const fatia = Math.min(base, f.ate) - ant;
    if (fatia <= 0) break;
    // cada faixa truncada no centavo, como fazem os sistemas de folha
    total += Math.floor((fatia * f.aliq) / 100 * 100 + 1e-9) / 100;
    ant = f.ate;
  }
  return arred(total);
}

/** IRRF mensal: base = rendimento − maior entre (INSS + dependentes) e o desconto simplificado; redutor de 2026. */
export function irrfMensal(rendimento: number, inss: number, t: TabelaDP, dependentes = 0) {
  const deducao = Math.max(inss + dependentes * t.dependente, t.simplificado);
  const base = Math.max(0, arred(rendimento - deducao));
  const f = t.irrf.find((x) => x.ate == null || base <= x.ate)!;
  let ir = Math.max(0, arred((base * f.aliq) / 100 - f.deduzir));
  if (t.redutor) {
    if (rendimento <= t.redutor.isentoAte) ir = Math.max(0, ir - Math.min(t.redutor.maxReducao, ir));
    else if (rendimento <= t.redutor.ate) ir = Math.max(0, arred(ir - arred(t.redutor.a - t.redutor.b * rendimento)));
  }
  return { base, ir: arred(ir), simplificado: deducao === t.simplificado && inss + dependentes * t.dependente < t.simplificado };
}

// ——— Leitura do "Demonstrativo de Pagamento" (holerite) exportado do sistema de folha ———
export interface Verba { codigo: string; descricao: string; referencia: string | null; valor: number; tipo: 'provento' | 'desconto' }
export interface Holerite {
  matricula: string;
  nome: string;
  cpf: string | null;
  competencia: string;
  cargo: string | null;
  departamento: string | null;
  admissao: string | null;
  verbas: Verba[];
  totalVencimentos: number | null;
  totalDescontos: number | null;
  liquido: number | null;
  salarioBase: number | null;
  baseInss: number | null;
  baseFgts: number | null;
  fgtsMes: number | null;
  baseIrrf: number | null;
  faixaIrrf: string | null;
}

const dinheiroBr = (s: string | undefined | null) => (s == null ? null : Number(s.replace(/\./g, '').replace(',', '.')));
const MONEY = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
const DESCONTO = /desconto|inss|irrf|imposto de renda|adiantamento|vale.?transporte|falta|atraso|contribui[cç][aã]o|pens[aã]o|empr[eé]stimo|arredondamento m[eê]s anterior|coparticipa|plano de sa[uú]de|seguro/i;

/** Lê os holerites do texto do PDF (um "Demonstrativo de Pagamento" por funcionário). */
export function lerHolerites(texto: string): Holerite[] {
  const blocos = texto.split(/Demonstrativo de Pagamento/i).slice(1);
  return blocos.map((bloco) => {
    const t = bloco.replace(/\s+/g, ' ').trim();
    const func = t.match(/(\d{4,8}) - ([A-ZÀ-Üa-zà-ü'´`. ]+?) (\d{3}\.\d{3}\.\d{3}-\d{2})/) || t.match(/(\d{4,8}) - ([A-ZÀ-Ü'´`. ]{4,}?)(?= \d| Func)/);
    const comp = (t.match(/\b(\d{2})\/(\d{4})\b(?!\/)/) || []);
    const verbasTxt = ((t.match(/Verbas\s*(.*?)\s*Valor L[ií]quido/) || [])[1] || '').replace(/(,\d{2})(?=\d{4} - )/g, '$1 ');
    const verbas: Verba[] = verbasTxt.split(/ (?=\d{4} - )/).map((ch) => {
      const m = ch.trim().match(/^(\d{4}) - (.+)$/);
      if (!m) return null;
      const tk = m[2].trim().split(' ');
      const valor = dinheiroBr(tk.pop());
      if (valor == null || Number.isNaN(valor)) return null;
      const ref = tk.length > 1 && /^(\d+:\d{2}|\d{1,3}(?:\.\d{3})*,\d{2})$/.test(tk[tk.length - 1]) ? tk.pop()! : null;
      const descricao = tk.join(' ');
      return { codigo: m[1], descricao, referencia: ref, valor, tipo: DESCONTO.test(descricao) ? 'desconto' : 'provento' } as Verba;
    }).filter((v): v is Verba => !!v);
    const rot = (r: RegExp) => dinheiroBr((t.match(r) || [])[1]);
    const totais = t.match(new RegExp(`Total: Total: (${MONEY}) (${MONEY})`));
    const cargo = (t.match(/CTPS: \d{4} - ([A-ZÀ-Ü /.-]+?) \d/) || [])[1] || null;
    const adm = (t.match(/Admiss[aã]o: (\d{2})\/(\d{2})\/(\d{4})/) || []);
    return {
      matricula: func?.[1]?.replace(/^0+(?=\d)/, '') || '', nome: (func?.[2] || '').trim(), cpf: func?.[3] || null,
      competencia: comp[2] ? `${comp[2]}-${comp[1]}` : '', cargo: cargo?.trim() || null, departamento: (t.match(/\d{3}\.\d{3}\.\d{3}-\d{2} \d{6} - ([A-ZÀ-Ü /]+?) Func/) || [])[1]?.trim() || null,
      admissao: adm[3] ? `${adm[3]}-${adm[2]}-${adm[1]}` : null, verbas,
      totalVencimentos: totais ? dinheiroBr(totais[1]) : null, totalDescontos: totais ? dinheiroBr(totais[2]) : null,
      liquido: rot(new RegExp(`Valor L[ií]quido (${MONEY})`)), salarioBase: rot(new RegExp(`Sal[aá]rio Base (${MONEY})`)), baseInss: rot(new RegExp(`Sal\\. Contr\\. INSS (${MONEY})`)),
      baseFgts: rot(new RegExp(`Base C[aá]lc\\. FGTS (${MONEY})`)), fgtsMes: rot(new RegExp(`FGTS do M[eê]s (${MONEY})`)), baseIrrf: rot(new RegExp(`Base C[aá]lc\\. IRRF (${MONEY})`)),
      faixaIrrf: (t.match(/Faixa IRRF (\d{1,2}(?:,\d)?%)/) || [])[1] || null,
    };
  }).filter((h) => h.nome && h.verbas.length);
}

/** CPF só aparece mascarado na tela. */
export const mascararCpf = (cpf: string | null) => (cpf ? `***.${cpf.slice(4, 7)}.${cpf.slice(8, 11)}-**` : null);

// ——— Conferência ———
export type StatusItem = 'Conferido' | 'Divergente' | 'Pendente' | 'Aguardando Documento' | 'Revisão Necessária';
export interface ItemConferencia { item: string; informado: number | null; conferido: number | null; diferenca: number | null; status: StatusItem; motivo: string; acao: string }

const TOL = 0.05;
const INCIDE = /sal[aá]rio|hora extra|descanso remunerado|dsr|adicional|insalubr|periculos|comiss|gratifica|pr[eê]mio|f[eé]rias|13|d[eé]cimo|aviso pr[eé]vio trabalhado|sobreaviso/i;
const NAO_INCIDE = /arredondamento|cesta|vale|ajuda de custo|di[aá]ria|reembolso|sal[aá]rio fam[ií]lia|participa[cç][aã]o nos lucros|plr/i;

function item(nome: string, informado: number | null, conferido: number | null, ok: StatusItem, ruim: StatusItem, motivo: string, acao: string): ItemConferencia {
  if (informado == null || conferido == null) return { item: nome, informado, conferido, diferenca: null, status: 'Aguardando Documento', motivo: 'Valor não encontrado no documento', acao: 'Importar o documento completo da folha' };
  const d = arred(informado - conferido);
  return Math.abs(d) <= TOL ? { item: nome, informado, conferido, diferenca: d, status: ok, motivo: 'Confere', acao: '—' } : { item: nome, informado, conferido, diferenca: d, status: ruim, motivo, acao };
}

export interface ContextoConferencia { salarioCadastro?: number | null; piso?: number | null; pisoFonte?: string | null; aprendiz?: boolean }

export function conferirHolerite(h: Holerite, ctx: ContextoConferencia = {}) {
  const tab = tabelaDe(h.competencia);
  const soma = (tipo: Verba['tipo']) => arred(h.verbas.filter((v) => v.tipo === tipo).reduce((a, v) => a + v.valor, 0));
  const verbaValor = (r: RegExp) => { const v = h.verbas.find((x) => r.test(x.descricao)); return v ? v.valor : null; };
  const inssInf = verbaValor(/\binss\b/i) ?? 0;
  const irrfInf = verbaValor(/\birrf\b|imposto de renda/i) ?? 0;
  const itens: ItemConferencia[] = [];
  itens.push(item('Total de vencimentos (soma das rubricas)', h.totalVencimentos, soma('provento'), 'Conferido', 'Revisão Necessária', 'Soma das rubricas de provento diferente do total: confira a classificação das rubricas', 'Conferir as rubricas no relatório analítico'));
  itens.push(item('Total de descontos (soma das rubricas)', h.totalDescontos, soma('desconto'), 'Conferido', 'Revisão Necessária', 'Soma das rubricas de desconto diferente do total', 'Conferir as rubricas no relatório analítico'));
  if (h.totalVencimentos != null && h.totalDescontos != null) itens.push(item('Valor líquido', h.liquido, arred(h.totalVencimentos - h.totalDescontos), 'Conferido', 'Divergente', 'Líquido diferente de vencimentos − descontos', 'Corrigir o recibo no sistema de folha'));
  const incidentes = arred(h.verbas.filter((v) => v.tipo === 'provento' && INCIDE.test(v.descricao) && !NAO_INCIDE.test(v.descricao)).reduce((a, v) => a + v.valor, 0));
  itens.push(item('Base do INSS × rubricas que incidem', h.baseInss, incidentes, 'Conferido', 'Revisão Necessária', 'A base informada difere das rubricas que normalmente incidem; pode haver rubrica com incidência específica', 'Conferir a tabela de incidências das rubricas'));
  if (!tab) {
    itens.push({ item: 'INSS, IRRF e FGTS', informado: null, conferido: null, diferenca: null, status: 'Pendente', motivo: `Tabela oficial de ${h.competencia} não cadastrada no ZARO`, acao: 'Cadastrar a tabela da competência' });
  } else {
    if (h.baseInss != null) {
      const inss = inssSegurado(h.baseInss, tab);
      itens.push(item(`INSS do segurado (tabela ${tab.versao})`, inssInf, inss, 'Conferido', 'Divergente', 'INSS descontado diferente da tabela progressiva sobre a base informada', 'Conferir base e faixas no sistema de folha'));
      const ir = irrfMensal(h.baseInss, inssInf, tab);
      const it = item(`IRRF (tabela ${tab.versao}${tab.redutor ? ' com redutor' : ''})`, irrfInf, ir.ir, 'Conferido', 'Revisão Necessária', irrfInf < ir.ir ? 'IRRF menor que o calculado sem dependentes: pode haver dependentes ou pensão no cadastro' : 'IRRF maior que o calculado: confira a base e as deduções', 'Conferir dependentes, pensão e deduções no cadastro');
      itens.push(it);
      if (h.baseIrrf != null && irrfInf === 0 && ir.ir === 0) itens[itens.length - 1].motivo = 'Isento';
    } else itens.push({ item: 'INSS e IRRF', informado: inssInf, conferido: null, diferenca: null, status: 'Aguardando Documento', motivo: 'Base do INSS não encontrada no holerite', acao: 'Importar o holerite completo' });
    const aliqFgts = ctx.aprendiz ? 2 : 8;
    itens.push(item(`FGTS do mês (${aliqFgts}% da base)`, h.fgtsMes, h.baseFgts != null ? arred((h.baseFgts * aliqFgts) / 100) : null, 'Conferido', 'Divergente', 'FGTS diferente da alíquota sobre a base informada', 'Conferir a base do FGTS'));
  }
  const salario = h.verbas.find((v) => /sal[aá]rio contratual|sal[aá]rio base|sal[aá]rio mensal/i.test(v.descricao));
  if (ctx.salarioCadastro != null && h.salarioBase != null) itens.push(item('Salário base × cadastro', h.salarioBase, ctx.salarioCadastro, 'Conferido', 'Revisão Necessária', 'Salário do holerite diferente do cadastrado no ZARO (reajuste, promoção ou cadastro desatualizado)', 'Atualizar o cadastro ou conferir o reajuste'));
  if (ctx.piso != null && h.salarioBase != null) {
    const abaixo = h.salarioBase + TOL < ctx.piso && !/aprendiz|estagi/i.test(h.cargo || '');
    itens.push({ item: `Piso da convenção${ctx.pisoFonte ? ` (${ctx.pisoFonte})` : ''}`, informado: h.salarioBase, conferido: ctx.piso, diferenca: arred(h.salarioBase - ctx.piso), status: abaixo ? 'Revisão Necessária' : 'Conferido', motivo: abaixo ? 'Salário base abaixo do piso validado (verifique jornada parcial e função)' : 'Acima do piso', acao: abaixo ? 'Conferir enquadramento e jornada' : '—' });
  }
  return { itens, salarioRubrica: salario?.valor ?? null, inss: inssInf, irrf: irrfInf, tabela: tab?.versao || null };
}

export const resumoItens = (itens: ItemConferencia[]) => ({
  conferidos: itens.filter((i) => i.status === 'Conferido').length,
  divergentes: itens.filter((i) => i.status === 'Divergente').length,
  revisao: itens.filter((i) => i.status === 'Revisão Necessária').length,
  pendentes: itens.filter((i) => i.status === 'Pendente' || i.status === 'Aguardando Documento').length,
});

// ——— Encargos e guias ———
export type StatusObrigacao = 'Calculado' | 'Declarado' | 'Guia emitida' | 'Pago' | 'Conciliado' | 'Pendente de comprovação';

/** Situação da obrigação: guia emitida não é pagamento; pago sem comprovante ou baixa fica pendente de comprovação. */
export function statusObrigacao(o: { declarado: number | null; guia: number | null; pago: number | null; conciliado: boolean; comprovante: boolean; statusTitulo?: string | null }): StatusObrigacao {
  if (o.pago != null && o.conciliado) return 'Conciliado';
  if (o.pago != null && o.comprovante) return 'Pago';
  if (o.pago != null || /pago|quitad/i.test(o.statusTitulo || '')) return 'Pendente de comprovação';
  if (o.guia != null) return 'Guia emitida';
  if (o.declarado != null) return 'Declarado';
  return 'Calculado';
}

// ——— Férias, 13º e rescisões: prazos legais ———
export function conferirPrazos(r: { tipo: 'ferias' | '13-1' | '13-2' | 'rescisao'; referencia: string; pagoEm: string | null }) {
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (!r.pagoEm) return { status: 'Aguardando Documento' as StatusItem, motivo: 'Data do pagamento não informada' };
  if (r.tipo === 'ferias') return dias(r.pagoEm, r.referencia) >= 2 ? { status: 'Conferido' as StatusItem, motivo: 'Pago até 2 dias antes do início (CLT art. 145)' } : { status: 'Divergente' as StatusItem, motivo: 'Férias pagas com menos de 2 dias de antecedência (CLT art. 145): risco de pagamento em dobro' };
  if (r.tipo === '13-1') return r.pagoEm <= `${r.referencia.slice(0, 4)}-11-30` ? { status: 'Conferido' as StatusItem, motivo: '1ª parcela até 30/11 (Lei 4.749/65)' } : { status: 'Divergente' as StatusItem, motivo: '1ª parcela do 13º após 30/11' };
  if (r.tipo === '13-2') return r.pagoEm <= `${r.referencia.slice(0, 4)}-12-20` ? { status: 'Conferido' as StatusItem, motivo: '2ª parcela até 20/12 (Lei 4.749/65)' } : { status: 'Divergente' as StatusItem, motivo: '2ª parcela do 13º após 20/12' };
  return dias(r.referencia, r.pagoEm) <= 10 ? { status: 'Conferido' as StatusItem, motivo: 'Verbas pagas em até 10 dias do término (CLT art. 477 §6º)' } : { status: 'Divergente' as StatusItem, motivo: 'Rescisão paga após 10 dias do término (CLT art. 477 §6º): multa do §8º' };
}

/** Férias: 1/3 constitucional sobre a remuneração das férias. */
export function conferirTercoFerias(remuneracao: number, terco: number) {
  return item('1/3 constitucional de férias', terco, arred(remuneracao / 3), 'Conferido', 'Divergente', '1/3 diferente de um terço da remuneração de férias', 'Conferir médias e adicionais da remuneração');
}

// ——— eSocial: retorno do processamento ———
export function lerRetornoEsocial(xml: string) {
  const eventos = [...xml.matchAll(/<(?:\w+:)?(?:retornoEvento|evento)\b[^>]*Id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:retornoEvento|evento)>/g)];
  const tag = (s: string, t: string) => (s.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([^<]*)<`)) || [])[1] || '';
  const lista = eventos.map((m) => {
    const corpo = m[2];
    const cd = tag(corpo, 'cdResposta');
    const tipo = (corpo.match(/<(?:\w+:)?(evt[A-Za-z]+)\b/) || [])[1] || tag(corpo, 'tpEvento') || '';
    return { id: m[1], tipo, recibo: tag(corpo, 'nrRecibo') || null, cdResposta: cd, descricao: tag(corpo, 'descResposta'), situacao: cd === '201' || cd === '202' ? 'Aceito' : cd ? 'Rejeitado' : 'Pendente', ocorrencias: [...corpo.matchAll(/<(?:\w+:)?descricao>([^<]+)</g)].map((x) => x[1]).slice(0, 5) };
  });
  if (!lista.length && /cdResposta/.test(xml)) return [{ id: tag(xml, 'protocoloEnvio') || 'lote', tipo: 'Lote', recibo: null, cdResposta: tag(xml, 'cdResposta'), descricao: tag(xml, 'descResposta'), situacao: ['201', '202'].includes(tag(xml, 'cdResposta')) ? 'Aceito' : 'Rejeitado', ocorrencias: [] }];
  return lista;
}
