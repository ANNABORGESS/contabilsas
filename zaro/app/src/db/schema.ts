// Banco de dados do ZARO. Todo dado pertence a um escritório (tenant_id) e, quando é de
// uma empresa cliente, também a ela (empresa_id). Nenhuma consulta pode ignorar esses filtros.
import { sql } from 'drizzle-orm';
import { boolean, customType, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2, mode: 'number' });
const tenant = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const empresa = () => uuid('empresa_id').notNull().references(() => empresas.id, { onDelete: 'cascade' });

export const tenants = pgTable('tenants', {
  id: id(),
  nome: text('nome').notNull(),
  criadoEm: criadoEm(),
});

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    tenantId: tenant(),
    nome: text('nome').notNull(),
    email: text('email').notNull(),
    senhaHash: text('senha_hash').notNull(),
    perfil: text('perfil').notNull().default('Contador'),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('usuarios_email_uq').on(t.email)],
);

export const sessoes = pgTable('sessoes', {
  id: text('id').primaryKey(), // hash do token do cookie
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

export interface PeriodoRegimeDb {
  regime: string;
  de?: string | null;
  ate?: string | null;
  fonte?: string;
}

export const empresas = pgTable(
  'empresas',
  {
    id: id(),
    tenantId: tenant(),
    cnpj: text('cnpj').notNull(),
    razao: text('razao').notNull(),
    fantasia: text('fantasia'),
    regime: text('regime'),
    regimeHist: jsonb('regime_hist').$type<PeriodoRegimeDb[]>().notNull().default([]),
    ie: text('ie'),
    im: text('im'),
    cidade: text('cidade'),
    uf: text('uf'),
    cnae: text('cnae'),
    contador: text('contador'),
    crc: text('crc'),
    semEstoque: boolean('sem_estoque').notNull().default(true),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    legadoId: text('legado_id'),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('empresas_tenant_cnpj_uq').on(t.tenantId, t.cnpj)],
);

export const parceiros = pgTable(
  'parceiros',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    tipo: text('tipo').notNull(), // 'cliente' | 'fornecedor'
    doc: text('doc'),
    razao: text('razao').notNull(),
    fantasia: text('fantasia'),
    categoria: text('categoria'),
    origem: text('origem'),
    ativo: boolean('ativo').notNull().default(true),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    criadoEm: criadoEm(),
  },
  (t) => [index('parceiros_empresa_idx').on(t.empresaId, t.tipo)],
);

export const arquivos = pgTable('arquivos', {
  id: id(),
  tenantId: tenant(),
  nome: text('nome').notNull(),
  mime: text('mime'),
  tamanho: integer('tamanho').notNull().default(0),
  caminho: text('caminho').notNull(), // relativo à pasta de arquivos (vazio quando guardado no banco)
  conteudo: bytea('conteudo'), // na nuvem o arquivo fica no próprio banco
  criadoEm: criadoEm(),
});

export const documentosEntrada = pgTable(
  'documentos_entrada',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    tipo: text('tipo').notNull(), // NF-e de saída, NF-e de entrada, NFS-e, Evento, ...
    chave: text('chave'),
    nomeArquivo: text('nome_arquivo').notNull(),
    arquivoId: uuid('arquivo_id').references(() => arquivos.id, { onDelete: 'set null' }),
    xml: text('xml'),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('Novo'), // Novo, Aprovado, Descartado, Duplicado, Erro
    destino: text('destino'),
    confianca: integer('confianca').notNull().default(0),
    valor: dinheiro('valor'),
    canal: text('canal').notNull().default('Upload'),
    resultado: text('resultado'),
    criadoEm: criadoEm(),
  },
  (t) => [index('docent_empresa_idx').on(t.empresaId, t.status), index('docent_chave_idx').on(t.tenantId, t.chave)],
);

export const titulos = pgTable(
  'titulos',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    codigo: text('codigo').notNull(), // CP-0001 / CR-0001
    tipo: text('tipo').notNull(), // 'pagar' | 'receber'
    parceiroId: uuid('parceiro_id').references(() => parceiros.id, { onDelete: 'set null' }),
    nome: text('nome').notNull(),
    docParceiro: text('doc_parceiro'),
    descricao: text('descricao'),
    nf: text('nf'),
    serie: text('serie'),
    nfChave: text('nf_chave'),
    nfEmissao: date('nf_emissao', { mode: 'string' }),
    competencia: text('competencia'),
    parcela: text('parcela').notNull().default('1/1'),
    venc: date('venc', { mode: 'string' }),
    valor: dinheiro('valor').notNull(),
    valorFiscal: dinheiro('valor_fiscal'),
    status: text('status').notNull(),
    retorno: boolean('retorno').notNull().default(false),
    impactaCaixa: boolean('impacta_caixa').notNull().default(true),
    vencEstimado: boolean('venc_estimado').notNull().default(false),
    natureza: text('natureza'),
    cfop: text('cfop'),
    categoria: text('categoria'),
    centro: text('centro'),
    contaContabil: text('conta_contabil'),
    origem: text('origem').notNull().default('manual'), // nf, folha, emprestimo, manual, legado
    folhaTipo: text('folha_tipo'),
    contrato: text('contrato'),
    juros: dinheiro('juros'),
    impostos: jsonb('impostos').$type<{ nome: string; valor: number }[]>().notNull().default([]),
    retencoes: jsonb('retencoes').$type<{ nome: string; valor: number }[]>().notNull().default([]),
    documentoId: uuid('documento_id').references(() => documentosEntrada.id, { onDelete: 'set null' }),
    obs: text('obs'),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    legadoId: text('legado_id'),
    criadoEm: criadoEm(),
  },
  (t) => [
    index('titulos_empresa_idx').on(t.empresaId, t.tipo, t.status),
    index('titulos_chave_idx').on(t.tenantId, t.nfChave),
    uniqueIndex('titulos_codigo_uq').on(t.empresaId, t.codigo),
  ],
);

export const baixas = pgTable('baixas', {
  id: id(),
  tenantId: tenant(),
  tituloId: uuid('titulo_id').notNull().references(() => titulos.id, { onDelete: 'cascade' }),
  data: date('data', { mode: 'string' }).notNull(),
  valor: dinheiro('valor').notNull(),
  forma: text('forma'),
  obs: text('obs'),
  estornada: boolean('estornada').notNull().default(false),
  criadoEm: criadoEm(),
});

export const extratoMovimentos = pgTable(
  'extrato_movimentos',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    conta: text('conta').notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    valor: dinheiro('valor').notNull(),
    memo: text('memo').notNull().default(''),
    fitid: text('fitid'),
    arquivo: text('arquivo'),
    legadoId: text('legado_id'),
    criadoEm: criadoEm(),
  },
  (t) => [index('extrato_empresa_idx').on(t.empresaId, t.data)],
);

/** Decisão do contador sobre cada lançamento calculado pelo motor. */
export const lancamentoDecisoes = pgTable(
  'lancamento_decisoes',
  {
    tenantId: tenant(),
    empresaId: empresa(),
    lancamentoId: text('lancamento_id').notNull(),
    status: text('status'),
    conta: text('conta'),
    motivoEstorno: text('motivo_estorno'),
    dataEstorno: date('data_estorno', { mode: 'string' }),
    usuario: text('usuario'),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.lancamentoId] })],
);

export const regrasClassificacao = pgTable(
  'regras_classificacao',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    chave: text('chave').notNull(),
    conta: text('conta').notNull(),
    usuario: text('usuario'),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('regras_empresa_chave_uq').on(t.empresaId, t.chave)],
);

export const imobilizado = pgTable('imobilizado', {
  id: id(),
  tenantId: tenant(),
  empresaId: empresa(),
  descricao: text('descricao').notNull(),
  qtd: integer('qtd').notNull().default(1),
  valor: dinheiro('valor').notNull(),
  data: date('data', { mode: 'string' }).notNull(),
  taxa: numeric('taxa', { precision: 6, scale: 2, mode: 'number' }).notNull().default(10),
  residual: dinheiro('residual').notNull().default(0),
  origem: text('origem').notNull().default('compra'), // abertura | compra
  nf: text('nf'),
  legadoId: text('legado_id'),
  criadoEm: criadoEm(),
});

export const contratosDivida = pgTable('contratos_divida', {
  id: id(),
  tenantId: tenant(),
  empresaId: empresa(),
  instituicao: text('instituicao').notNull(),
  contrato: text('contrato').notNull(),
  tipo: text('tipo').notNull().default('Empréstimo'),
  natureza: text('natureza').notNull().default('recebido'),
  valor: dinheiro('valor').notNull(),
  taxa: numeric('taxa', { precision: 8, scale: 4, mode: 'number' }),
  sistema: text('sistema'),
  parcelas: integer('parcelas'),
  dataContr: date('data_contr', { mode: 'string' }),
  status: text('status').notNull().default('Ativo'),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
  legadoId: text('legado_id'),
  criadoEm: criadoEm(),
});

export const funcionarios = pgTable('funcionarios', {
  id: id(),
  tenantId: tenant(),
  empresaId: empresa(),
  nome: text('nome').notNull(),
  cargo: text('cargo'),
  admissao: date('admissao', { mode: 'string' }),
  salario: dinheiro('salario'),
  ativo: boolean('ativo').notNull().default(true),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
  legadoId: text('legado_id'),
  criadoEm: criadoEm(),
});

/** Produtos e serviços que a empresa vende (cadastro usado no lançamento de vendas). */
export const catalogo = pgTable(
  'catalogo',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    tipo: text('tipo').notNull(), // 'produto' | 'servico'
    nome: text('nome').notNull(),
    unidade: text('unidade'),
    ncm: text('ncm'), // produto: NCM; serviço: item da LC 116
    categoria: text('categoria'),
    preco: dinheiro('preco'),
    custo: dinheiro('custo'),
    descricao: text('descricao'),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index('catalogo_empresa').on(t.empresaId)],
);

export interface ItemVenda {
  catalogoId: string | null;
  tipo: 'produto' | 'servico';
  nome: string;
  qtd: number;
  preco: number;
  total: number;
}

/** Venda lançada no Comercial: gera os títulos a receber das parcelas. */
export const vendas = pgTable(
  'vendas',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    numero: integer('numero').notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    parceiroId: uuid('parceiro_id').references(() => parceiros.id, { onDelete: 'set null' }),
    cliente: text('cliente').notNull(),
    docCliente: text('doc_cliente'),
    itens: jsonb('itens').$type<ItemVenda[]>().notNull().default([]),
    total: dinheiro('total').notNull(),
    parcelas: integer('parcelas').notNull().default(1),
    primeiroVenc: date('primeiro_venc', { mode: 'string' }).notNull(),
    obs: text('obs'),
    status: text('status').notNull().default('Lançada'),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('vendas_numero').on(t.empresaId, t.numero)],
);

/** Skills e agentes enviados pelo escritório (o conteúdo licenciado fica só no banco, nunca no repositório). */
export const especialistas = pgTable(
  'especialistas',
  {
    id: id(),
    tenantId: tenant(),
    tipo: text('tipo').notNull(), // 'skill' | 'agente'
    slug: text('slug').notNull(),
    nome: text('nome').notNull(),
    descricao: text('descricao').notNull().default(''),
    conteudo: text('conteudo').notNull(),
    pacote: text('pacote'),
    ativo: boolean('ativo').notNull().default(true),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('especialistas_slug').on(t.tenantId, t.tipo, t.slug)],
);

/** Perguntas feitas a um especialista, com a resposta, por empresa. */
export const consultasEspecialista = pgTable(
  'consultas_especialista',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    especialistaId: uuid('especialista_id').notNull().references(() => especialistas.id, { onDelete: 'cascade' }),
    usuario: text('usuario').notNull(),
    pergunta: text('pergunta').notNull(),
    resposta: text('resposta').notNull(),
    usouDados: boolean('usou_dados').notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index('consultas_especialista_emp').on(t.empresaId, t.especialistaId)],
);

/** Lista de NF do portal da SEFAZ-AM, com o controle de recebimento e de lançamento. */
export const notasSefaz = pgTable(
  'notas_sefaz',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    chave: text('chave').notNull(),
    uf: text('uf'),
    numero: text('numero'),
    serie: text('serie'),
    emissao: date('emissao', { mode: 'string' }),
    cnpjEmit: text('cnpj_emit'),
    ieEmit: text('ie_emit'),
    razaoEmit: text('razao_emit'),
    cnpjDest: text('cnpj_dest'),
    ieDest: text('ie_dest'),
    razaoDest: text('razao_dest'),
    cfop: text('cfop'),
    selagem: text('selagem'),
    situacao: text('situacao'),
    tipo: text('tipo'),
    valor: dinheiro('valor').notNull().default(0),
    pedido: text('pedido'),
    recebidoEm: timestamp('recebido_em', { withTimezone: true }),
    recebidoPor: text('recebido_por'),
    lancadoEm: timestamp('lancado_em', { withTimezone: true }),
    lancadoPor: text('lancado_por'),
    importadoEm: timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notas_sefaz_chave').on(t.empresaId, t.chave), index('notas_sefaz_pedido').on(t.empresaId, t.pedido)],
);

export const dividasAtivas = pgTable('dividas_ativas', {
  id: id(),
  tenantId: tenant(),
  empresaId: empresa(),
  inscricao: text('inscricao').notNull(),
  natureza: text('natureza'),
  situacao: text('situacao'),
  valor: dinheiro('valor'),
  atualizadoEm: date('atualizado_em', { mode: 'string' }),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
  criadoEm: criadoEm(),
});

/** Histórico de cobrança de clientes em atraso: contatos, acordos e promessas de pagamento. */
export const cobrancas = pgTable(
  'cobrancas',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    cliente: text('cliente').notNull(), // chave do cliente: CNPJ/CPF ou nome em minúsculas
    nomeCliente: text('nome_cliente').notNull(),
    tipo: text('tipo').notNull(), // Contato, Acordo, Promessa, Observação
    status: text('status').notNull(), // STATUS_COBRANCA
    canal: text('canal'), // Telefone, E-mail, WhatsApp, Presencial
    valor: dinheiro('valor'),
    dataPrometida: date('data_prometida', { mode: 'string' }),
    obs: text('obs'),
    usuario: text('usuario').notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index('cobrancas_empresa_cliente').on(t.empresaId, t.cliente)],
);

/** Versões do orçamento anual (original, revisões, forecast). Versão aprovada não muda mais. */
export const orcamentos = pgTable(
  'orcamentos',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: empresa(),
    ano: integer('ano').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull().default('Original'), // Original, Revisão, Forecast
    status: text('status').notNull().default('Rascunho'), // Rascunho, Aprovado
    baseId: uuid('base_id'),
    aprovadoPor: text('aprovado_por'),
    aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [index('orcamentos_empresa_ano').on(t.empresaId, t.ano)],
);

/** Valores orçados por área (centro de custo ou categoria), natureza e mês. */
export const orcamentoLinhas = pgTable(
  'orcamento_linhas',
  {
    id: id(),
    tenantId: tenant(),
    orcamentoId: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
    area: text('area').notNull(),
    natureza: text('natureza').notNull().default('despesa'), // receita | despesa
    mes: integer('mes').notNull(), // 1..12
    valor: dinheiro('valor').notNull().default(0),
  },
  (t) => [uniqueIndex('orcamento_linhas_uq').on(t.orcamentoId, t.area, t.natureza, t.mes)],
);

export const auditoria = pgTable(
  'auditoria',
  {
    id: id(),
    tenantId: tenant(),
    empresaId: uuid('empresa_id').references(() => empresas.id, { onDelete: 'set null' }),
    usuarioId: uuid('usuario_id'),
    usuario: text('usuario').notNull(),
    quando: timestamp('quando', { withTimezone: true }).notNull().defaultNow(),
    acao: text('acao').notNull(),
    entidade: text('entidade'),
    antes: text('antes'),
    depois: text('depois'),
    justificativa: text('justificativa'),
  },
  (t) => [index('auditoria_tenant_idx').on(t.tenantId, t.quando)],
);

/** Configurações do escritório (integração SEFAZ, n8n, etc.). */
export const configuracoes = pgTable(
  'configuracoes',
  {
    tenantId: tenant(),
    chave: text('chave').notNull(),
    valor: jsonb('valor').$type<unknown>().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.chave] })],
);

/** Dados do protótipo que ainda não têm tela própria: guardados para não se perderem. */
export const legado = pgTable(
  'legado',
  {
    tenantId: tenant(),
    chave: text('chave').notNull(),
    valor: jsonb('valor').$type<unknown>().notNull(),
    importadoEm: timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.chave] })],
);
