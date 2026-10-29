// Plano de contas padrão do ZARO (o mesmo do protótipo). Natureza D = devedora, C = credora.

export interface Conta {
  codigo: string;
  nome: string;
  natureza: 'D' | 'C';
}

export const PLANO_PADRAO: Conta[] = [
  ['1.1.1.01', 'Caixa', 'D'],
  ['1.1.1.02', 'Bancos conta movimento', 'D'],
  ['1.1.1.03', 'Aplicações financeiras', 'D'],
  ['1.1.2.01', 'Clientes', 'D'],
  ['1.1.3.01', 'Estoques / matéria-prima', 'D'],
  ['1.1.4.01', 'Tributos a recuperar', 'D'],
  ['1.1.9.01', 'Créditos com empresas ligadas', 'D'],
  ['1.1.9.97', 'Transferências entre contas próprias (em trânsito)', 'D'],
  ['1.1.9.98', 'Pagamentos e recebimentos a conciliar com o extrato', 'D'],
  ['1.1.9.99', 'Pagamentos a identificar', 'D'],
  ['1.2.1.01', 'Depósitos judiciais', 'D'],
  ['1.2.3.01', 'Máquinas e equipamentos', 'D'],
  ['1.2.3.02', 'Equipamentos de informática', 'D'],
  ['1.2.3.03', 'Veículos', 'D'],
  ['1.2.3.91', '(−) Depreciação acumulada — máquinas', 'C'],
  ['1.2.3.92', '(−) Depreciação acumulada — informática', 'C'],
  ['1.2.3.93', '(−) Depreciação acumulada — veículos', 'C'],
  ['2.1.1.01', 'Fornecedores', 'C'],
  ['2.1.2.01', 'Salários a pagar', 'C'],
  ['2.1.2.02', 'INSS a recolher', 'C'],
  ['2.1.2.03', 'FGTS a recolher', 'C'],
  ['2.1.2.04', 'IRRF a recolher', 'C'],
  ['2.1.2.06', 'Outras retenções de empregados a recolher', 'C'],
  ['2.1.3.01', 'Empréstimos e financiamentos', 'C'],
  ['2.1.3.02', 'Empréstimos de terceiros (pessoas físicas)', 'C'],
  ['2.1.3.03', 'Financiamento de veículo', 'C'],
  ['2.1.4.01', 'Tributos a recolher', 'C'],
  ['2.1.5.01', 'Empréstimos de sócios e empresas ligadas', 'C'],
  ['2.1.9.99', 'Entradas bancárias a identificar', 'C'],
  ['2.3.1.01', 'Capital social / saldos de abertura', 'C'],
  ['2.3.2.01', 'Lucros ou prejuízos acumulados', 'C'],
  ['2.3.9.99', 'Contrapartida dos saldos de abertura (fica zerada)', 'C'],
  ['3.1.1.01', 'Receita de vendas e serviços', 'C'],
  ['3.2.1.01', 'Deduções — tributos sobre vendas', 'D'],
  ['4.1.1.01', 'Custo de materiais e serviços', 'D'],
  ['4.1.2.01', 'Despesas com pessoal — salários', 'D'],
  ['4.1.2.02', 'Encargos sociais (FGTS)', 'D'],
  ['4.1.2.03', 'Férias e 13º salário', 'D'],
  ['4.1.2.04', 'Benefícios (cesta básica, vale-transporte)', 'D'],
  ['4.1.2.05', 'Encargos sociais (INSS patronal)', 'D'],
  ['4.1.3.01', 'Energia elétrica', 'D'],
  ['4.1.3.02', 'Aluguel e condomínio', 'D'],
  ['4.1.3.03', 'Manutenção industrial', 'D'],
  ['4.1.3.04', 'Combustíveis e veículos', 'D'],
  ['4.1.3.05', 'Telefone e internet', 'D'],
  ['4.1.3.06', 'Serviços de terceiros', 'D'],
  ['4.1.3.09', 'Despesas gerais', 'D'],
  ['4.1.3.10', 'Depreciação do imobilizado', 'D'],
  ['4.1.4.01', 'Tributos e taxas', 'D'],
  ['4.2.1.01', 'Despesas financeiras — juros', 'D'],
  ['4.2.1.02', 'Despesas bancárias — tarifas', 'D'],
  ['4.2.1.03', 'Descontos obtidos e juros recebidos', 'D'],
  ['4.2.1.04', 'Multas por atraso', 'D'],
  ['4.2.1.05', 'Descontos concedidos', 'D'],
  ['4.3.1.01', 'IRPJ sobre o lucro presumido', 'D'],
  ['4.3.1.02', 'Adicional de IRPJ', 'D'],
  ['4.3.1.03', 'CSLL sobre o lucro presumido', 'D'],
].map(([codigo, nome, natureza]) => ({ codigo, nome, natureza: natureza as 'D' | 'C' }));

export const GRUPOS: Record<string, string> = {
  '1': 'Ativo', '1.1': 'Ativo circulante', '1.2': 'Ativo não circulante',
  '2': 'Passivo', '2.1': 'Passivo circulante', '2.2': 'Passivo não circulante', '2.3': 'Patrimônio líquido',
  '3': 'Receitas', '3.1': 'Receita bruta', '3.2': 'Deduções da receita',
  '4': 'Custos e despesas', '4.1': 'Custos e despesas operacionais', '4.2': 'Resultado financeiro', '4.3': 'Tributos sobre o lucro', '4.3.1': 'IRPJ e CSLL',
  '1.1.1': 'Disponível', '1.1.2': 'Créditos com clientes', '1.1.3': 'Estoques', '1.1.4': 'Tributos a recuperar', '1.1.9': 'Outros créditos',
  '1.2.1': 'Realizável a longo prazo', '1.2.3': 'Imobilizado',
  '2.1.1': 'Fornecedores', '2.1.2': 'Obrigações trabalhistas', '2.1.3': 'Empréstimos e financiamentos', '2.1.4': 'Obrigações tributárias',
  '2.1.5': 'Partes relacionadas', '2.1.9': 'Outras obrigações', '2.3.1': 'Capital social', '2.3.2': 'Lucros ou prejuízos acumulados',
  '3.1.1': 'Receita de vendas e serviços', '3.2.1': 'Tributos sobre vendas',
  '4.1.1': 'Custos', '4.1.2': 'Despesas com pessoal', '4.1.3': 'Despesas gerais e administrativas', '4.1.4': 'Despesas tributárias',
  '4.2.1': 'Despesas e receitas financeiras',
};

const POR_CODIGO = new Map(PLANO_PADRAO.map((c) => [c.codigo, c]));

export const nomeConta = (codigo: string) => POR_CODIGO.get(codigo)?.nome || GRUPOS[codigo] || codigo;

/** Natureza pela conta cadastrada; contas novas herdam do grupo (1 e 4 devedoras, 2 e 3 credoras; 3.2 devedora). */
export function naturezaConta(codigo: string): 'D' | 'C' {
  const c = POR_CODIGO.get(codigo);
  if (c) return c.natureza;
  if (codigo.startsWith('3.2')) return 'D';
  return codigo.startsWith('1') || codigo.startsWith('4') ? 'D' : 'C';
}

export const rotuloConta = (codigo: string) => `${codigo} · ${nomeConta(codigo)}`;
