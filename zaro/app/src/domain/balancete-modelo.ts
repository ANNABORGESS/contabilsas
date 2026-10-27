// Balancete no modelo do escritório (1.1.01, 2.1.04…). Os lançamentos continuam no plano do ZARO;
// aqui cada conta (e cada tributo da NF) é levada à linha correspondente do modelo.
import { arred } from './dinheiro';
import type { Lancamento } from './motor';
import { noLivro, type Periodo } from './demonstracoes';
import { nomeConta } from './plano-contas';

export interface LinhaModelo { codigo: string; nome: string }

const L = (txt: string): LinhaModelo[] => txt.trim().split('\n').map((l) => { const [codigo, ...n] = l.trim().split(' '); return { codigo, nome: n.join(' ') }; });

export const SECOES = [
  { grupo: '1', titulo: '1. ATIVO', total: 'TOTAL DO ATIVO' },
  { grupo: '2', titulo: '2. PASSIVO E PATRIMÔNIO LÍQUIDO', total: 'TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO' },
  { grupo: '3', titulo: '3. RECEITAS', total: 'TOTAL DAS RECEITAS E DEDUÇÕES' },
  { grupo: '4', titulo: '4. CUSTOS E DESPESAS', total: 'TOTAL DOS CUSTOS E DESPESAS' },
];

export const MODELO: LinhaModelo[] = L(`
1 ATIVO
1.1 ATIVO CIRCULANTE
1.1.01 Caixa
1.1.02 Bancos Conta Movimento
1.1.03 Aplicações Financeiras
1.1.04 Clientes / Duplicatas a Receber
1.1.05 Estoques
1.1.06 Adiantamentos a Fornecedores
1.1.07 Tributos a Recuperar
1.1.08 Outros Créditos
1.2 ATIVO NÃO CIRCULANTE
1.2.01 Realizável a Longo Prazo
1.2.02 Investimentos
1.2.03 Máquinas e Equipamentos
1.2.04 Móveis e Utensílios
1.2.05 Veículos
1.2.06 Imóveis
1.2.07 Equipamentos de Informática
1.2.08 Depreciação Acumulada (-)
1.2.09 Intangível
2 PASSIVO
2.1 PASSIVO CIRCULANTE
2.1.01 Fornecedores
2.1.02 Salários a Pagar
2.1.03 Pró-labore a Pagar
2.1.04 INSS a Recolher
2.1.05 FGTS a Recolher
2.1.06 IRRF a Recolher
2.1.07 PIS a Recolher
2.1.08 Cofins a Recolher
2.1.09 IRPJ a Recolher
2.1.10 CSLL a Recolher
2.1.11 ISS a Recolher
2.1.12 ICMS a Recolher
2.1.13 Empréstimos e Financiamentos
2.1.14 Outras Obrigações
2.2 PASSIVO NÃO CIRCULANTE
2.2.01 Empréstimos de Longo Prazo
2.2.02 Financiamentos de Longo Prazo
2.2.03 Parcelamentos Tributários
2.2.04 Outras Obrigações de Longo Prazo
2.3 PATRIMÔNIO LÍQUIDO
2.3.01 Capital Social
2.3.02 Capital a Integralizar (-)
2.3.03 Reservas de Capital
2.3.04 Reservas de Lucros
2.3.05 Lucros ou Prejuízos Acumulados
2.3.06 Resultado do Exercício
3 RECEITAS OPERACIONAIS
3.1.01 Receita de Prestação de Serviços
3.1.02 Receita de Venda de Mercadorias
3.1.03 Receita de Venda de Produtos
3.1.04 Outras Receitas Operacionais
3.2 DEDUÇÕES DA RECEITA
3.2.01 Devoluções de Vendas (-)
3.2.02 Descontos Incondicionais (-)
3.2.03 PIS sobre Faturamento (-)
3.2.04 Cofins sobre Faturamento (-)
3.2.05 ISS sobre Serviços (-)
3.2.06 ICMS sobre Vendas (-)
3.2.07 Outros Tributos sobre Vendas — IPI, IBS, CBS (-)
3.3 OUTRAS RECEITAS
3.3.01 Receitas Financeiras
3.3.02 Outras Receitas
4 CUSTOS E DESPESAS
4.1 CUSTOS OPERACIONAIS
4.1.01 Custo dos Serviços Prestados
4.1.02 Custo das Mercadorias Vendidas
4.1.03 Custo dos Produtos Vendidos
4.1.04 Materiais e Insumos
4.1.05 Mão de Obra Direta
4.2 DESPESAS COM PESSOAL
4.2.01 Salários
4.2.02 Pró-labore
4.2.03 Encargos Sociais
4.2.04 Férias e 13º Salário
4.2.05 Benefícios e Vale-transporte
4.3 DESPESAS ADMINISTRATIVAS
4.3.01 Aluguéis
4.3.02 Energia Elétrica
4.3.03 Água e Esgoto
4.3.04 Telefone e Internet
4.3.05 Material de Escritório
4.3.06 Serviços Contábeis
4.3.07 Honorários Profissionais
4.3.08 Manutenção e Conservação
4.3.09 Seguros
4.3.10 Depreciação e Amortização
4.4 DESPESAS FINANCEIRAS
4.4.01 Juros e Encargos Financeiros
4.4.02 Tarifas Bancárias
4.4.03 Multas e Juros
4.5 TRIBUTOS SOBRE O LUCRO
4.5.01 Despesa com IRPJ
4.5.02 Despesa com Adicional de IRPJ
4.5.03 Despesa com CSLL
4.6 OUTRAS DESPESAS
4.6.01 Outras Despesas Operacionais
4.6.02 Outras Despesas Não Operacionais
`);

const NOMES = new Map(MODELO.map((l) => [l.codigo, l.nome]));

// conta do ZARO → linha do modelo (a mais específica vence)
const DE_PARA: [string, string][] = [
  ['1.1.1.01', '1.1.01'], ['1.1.1.02', '1.1.02'], ['1.1.1.03', '1.1.03'], ['1.1.1', '1.1.02'],
  ['1.1.2', '1.1.04'], ['1.1.3', '1.1.05'], ['1.1.4', '1.1.07'], ['1.1.5', '1.1.06'], ['1.1', '1.1.08'],
  ['1.2.1', '1.2.01'], ['1.2.2', '1.2.02'], ['1.2.3', '1.2.03'], ['1.2.4', '1.2.09'], ['1.2', '1.2.03'],
  ['2.1.1', '2.1.01'], ['2.1.2.01', '2.1.02'], ['2.1.2.02', '2.1.04'], ['2.1.2.03', '2.1.05'], ['2.1.2.04', '2.1.06'], ['2.1.2', '2.1.14'],
  ['2.1.3', '2.1.13'], ['2.1', '2.1.14'], ['2.2.3', '2.2.02'], ['2.2', '2.2.04'], ['2.3.1', '2.3.01'], ['2.3', '2.3.05'],
  ['3.1', '3.1.04'], ['3.2', '3.2.07'], ['3.3', '3.3.02'],
  ['4.1.1', '4.1.04'], ['4.1.2.01', '4.2.01'], ['4.1.2.02', '4.2.03'], ['4.1.2', '4.2.04'],
  ['4.1.3.01', '4.3.02'], ['4.1.3.02', '4.3.01'], ['4.1.3.03', '4.3.08'], ['4.1.3.05', '4.3.04'], ['4.1.3.06', '4.3.07'], ['4.1.3.10', '4.3.10'],
  ['4.1', '4.6.01'], ['4.2.1.02', '4.4.02'], ['4.2.1.03', '3.3.01'], ['4.2.1.04', '4.4.03'], ['4.2', '4.4.01'], ['4', '4.6.01'],
];

const RECEITA: Record<string, string> = { servico: '3.1.01', mercadoria: '3.1.02', produto: '3.1.03', outra: '3.1.04' };

/** Tributo pelo nome (na NF) ou pelo histórico (guia paga): [linha de dedução, linha da obrigação]. */
export function linhasDoTributo(texto: string): [string, string] {
  const t = texto.toLowerCase();
  if (/\bicms\b/.test(t) || /sefaz/.test(t)) return ['3.2.06', '2.1.12'];
  if (/cofins/.test(t)) return ['3.2.04', '2.1.08'];
  if (/\bpis\b/.test(t)) return ['3.2.03', '2.1.07'];
  if (/\biss\b|prefeitura|semef/.test(t)) return ['3.2.05', '2.1.11'];
  if (/irpj/.test(t)) return ['3.2.07', '2.1.09'];
  if (/csll/.test(t)) return ['3.2.07', '2.1.10'];
  if (/irrf/.test(t)) return ['3.2.07', '2.1.06'];
  if (/inss|\bgps\b/.test(t)) return ['3.2.07', '2.1.04'];
  if (/fgts/.test(t)) return ['3.2.07', '2.1.05'];
  return ['3.2.07', '2.1.14'];
}

/** Linha do modelo para uma conta do ZARO num lançamento. */
export function linhaDoModelo(conta: string, l?: Pick<Lancamento, 'hist' | 'tipoReceita'>): string {
  if (conta === '3.1.1.01' && l?.tipoReceita) return RECEITA[l.tipoReceita];
  if (conta.startsWith('2.1.4') && l) return linhasDoTributo(l.hist)[1];
  if (/^1\.2\.\d\.9\d$/.test(conta)) return '1.2.08'; // depreciação acumulada
  const regra = DE_PARA.find(([p]) => conta === p || conta.startsWith(p + '.'));
  return regra ? regra[1] : conta.startsWith('1') ? '1.1.08' : conta.startsWith('2') ? '2.1.14' : conta.startsWith('3') ? '3.3.02' : '4.6.01';
}

export interface LinhaBalModelo {
  codigo: string;
  nome: string;
  nivel: number;
  sintetica: boolean;
  anterior: number; // positivo = devedor, negativo = credor
  debitos: number;
  creditos: number;
  final: number;
}

/** Partidas do lançamento já no modelo: a dedução de NF vira uma partida por tributo. */
function partidas(l: Lancamento): { deb: string; cred: string; valor: number; de: [string, string] }[] {
  if (l.partes?.length && l.deb.startsWith('3.2') && l.cred.startsWith('2.1.4')) {
    const soma = l.partes.reduce((a, p) => a + p.valor, 0);
    let resto = l.valor;
    return l.partes.map((p, i) => {
      const v = i === l.partes!.length - 1 ? arred(resto) : arred((l.valor * p.valor) / soma);
      resto -= v;
      const [ded, obr] = linhasDoTributo(p.nome);
      return { deb: ded, cred: obr, valor: v, de: [l.deb, l.cred] as [string, string] };
    });
  }
  return [{ deb: linhaDoModelo(l.deb, l), cred: linhaDoModelo(l.cred, l), valor: l.valor, de: [l.deb, l.cred] }];
}

const ehResultado = (c: string) => c.startsWith('3') || c.startsWith('4');

export function balanceteModelo(lancs: Lancamento[], p: Periodo, previa = false) {
  const ant = new Map<string, number>(); // devedor positivo
  const deb = new Map<string, number>();
  const cred = new Map<string, number>();
  const dePara = new Map<string, { conta: string; nome: string; linha: string; valor: number }>();
  const inicioAno = `${p.de.slice(0, 4)}-01`;
  const somar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
  for (const l of lancs) {
    if (!noLivro(l, previa) || !l.comp || l.comp > p.ate) continue;
    for (const x of partidas(l)) {
      for (const [linha, conta, sinal] of [[x.deb, x.de[0], 1], [x.cred, x.de[1], -1]] as const) {
        if (l.comp < p.de) {
          // resultado de exercícios anteriores já está em lucros ou prejuízos acumulados
          somar(ant, ehResultado(linha) && l.comp < inicioAno ? '2.3.05' : linha, sinal * x.valor);
        } else {
          somar(sinal > 0 ? deb : cred, linha, x.valor);
          const k = `${conta}>${linha}`;
          const d = dePara.get(k) || { conta, nome: nomeConta(conta), linha, valor: 0 };
          d.valor = arred(d.valor + x.valor);
          dePara.set(k, d);
        }
      }
    }
  }
  const analiticas = MODELO.filter((m) => !MODELO.some((o) => o.codigo.startsWith(m.codigo + '.')));
  const valores = new Map<string, LinhaBalModelo>();
  for (const m of MODELO) valores.set(m.codigo, { ...m, nivel: m.codigo.split('.').length, sintetica: !analiticas.includes(m), anterior: 0, debitos: 0, creditos: 0, final: 0 });
  for (const a of analiticas) {
    const an = ant.get(a.codigo) || 0, d = deb.get(a.codigo) || 0, c = cred.get(a.codigo) || 0;
    // soma na própria linha e em todos os grupos do modelo acima dela
    for (const g of MODELO.filter((m) => a.codigo === m.codigo || a.codigo.startsWith(m.codigo + '.'))) {
      const v = valores.get(g.codigo)!;
      v.anterior = arred(v.anterior + an); v.debitos = arred(v.debitos + d); v.creditos = arred(v.creditos + c); v.final = arred(v.final + an + d - c);
    }
  }
  const linhas = MODELO.map((m) => valores.get(m.codigo)!);
  const v = (c: string) => valores.get(c)!.final;
  const resumo = [
    { grupo: 'Ativo', saldo: v('1') },
    { grupo: 'Passivo', saldo: arred(v('2.1') + v('2.2')) },
    { grupo: 'Patrimônio Líquido', saldo: v('2.3') },
    { grupo: 'Receitas e Deduções', saldo: v('3') },
    { grupo: 'Custos e Despesas', saldo: v('4') },
  ];
  const totalDevedor = arred(resumo.reduce((a, r) => a + Math.max(r.saldo, 0), 0));
  const totalCredor = arred(resumo.reduce((a, r) => a + Math.max(-r.saldo, 0), 0));
  return {
    linhas,
    totalDebitos: arred([...deb.values()].reduce((a, x) => a + x, 0)),
    totalCreditos: arred([...cred.values()].reduce((a, x) => a + x, 0)),
    resumo,
    totalDevedor,
    totalCredor,
    dePara: [...dePara.values()].sort((a, b) => a.linha.localeCompare(b.linha) || a.conta.localeCompare(b.conta)),
  };
}

export const nomeDaLinha = (codigo: string) => NOMES.get(codigo) || codigo;
