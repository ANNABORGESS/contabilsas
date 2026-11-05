// Banco do bar. Um pedido só existe depois do pagamento confirmado pelo garçom: não há
// comanda aberta nem dívida. Cada pedido gera um preparo por setor (cozinha e/ou bar).
// A tabela de eventos guarda tudo o que aconteceu e também serve de relógio da sincronização.
import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const momento = (nome: string) => timestamp(nome, { withTimezone: true });

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    nome: text('nome').notNull(),
    usuario: text('usuario').notNull(), // login curto, minúsculo
    senhaHash: text('senha_hash').notNull(),
    papel: text('papel').notNull(), // admin | garcom | cozinha | bar
    ativo: boolean('ativo').notNull().default(true),
    // conta criada pelo próprio funcionário: só entra depois que o administrador aprovar
    pendente: boolean('pendente').notNull().default(false),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('usuarios_usuario_uq').on(t.usuario)],
);

export const sessoes = pgTable('sessoes', {
  id: text('id').primaryKey(), // hash do token do cookie
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  expiraEm: momento('expira_em').notNull(),
  criadoEm: criadoEm(),
});

export const mesas = pgTable(
  'mesas',
  {
    id: id(),
    numero: integer('numero').notNull(),
    nome: text('nome'),
    ativa: boolean('ativa').notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('mesas_numero_uq').on(t.numero)],
);

export const produtos = pgTable('produtos', {
  id: id(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  categoria: text('categoria').notNull(),
  setor: text('setor').notNull(), // cozinha (petiscos) | bar (bebidas)
  precoCentavos: integer('preco_centavos').notNull(),
  // quanto custa ao bar cada unidade (compra/ingredientes); só o administrador vê
  custoCentavos: integer('custo_centavos'),
  // cerveja pequena que pode ir no balde (até 10 por balde)
  balde: boolean('balde').notNull().default(false),
  // unidades em estoque; vazio = não controla estoque deste produto
  estoque: integer('estoque'),
  // com true, acabou o estoque não deixa vender; com false só registra (pode ficar negativo)
  estoqueTrava: boolean('estoque_trava').notNull().default(true),
  // sai direto (cerveja, refrigerante, água): o garçom entrega e já conta, sem passar pelo painel
  servirDireto: boolean('servir_direto').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  // excluído do cardápio depois de já ter sido vendido: some das listas, mas o histórico continua
  excluido: boolean('excluido').notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: criadoEm(),
  atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
});

export const pedidos = pgTable(
  'pedidos',
  {
    id: id(),
    numero: serial('numero').notNull(),
    chave: text('chave').notNull(), // gerada no celular: o mesmo envio repetido não cria outro pedido
    mesaId: uuid('mesa_id').notNull().references(() => mesas.id),
    garcomId: uuid('garcom_id').notNull().references(() => usuarios.id),
    totalCentavos: integer('total_centavos').notNull(),
    formaPagamento: text('forma_pagamento').notNull(),
    // confirmação manual do garçom; não é conciliação com a adquirente
    confirmacao: text('confirmacao').notNull().default('manual_garcom'),
    pagoEm: momento('pago_em').notNull(),
    dataOperacional: text('data_operacional').notNull(), // AAAA-MM-DD do turno
    status: text('status').notNull().default('pago'), // pago | cancelado | estornado
    estornoConferidoEm: momento('estorno_conferido_em'), // devolução feita na maquininha (ou em dinheiro) e conferida
    estornoConferidoPorId: uuid('estorno_conferido_por_id'),
    divergenciaPreco: boolean('divergencia_preco').notNull().default(false),
    observacao: text('observacao'),
    cliente: text('cliente'), // nome do cliente informado pelo garçom (opcional)
    // soma dos itens cancelados um a um pelo administrador (devolvidos na maquininha)
    itensCanceladosCentavos: integer('itens_cancelados_centavos').notNull().default(0),
    encerradoPorId: uuid('encerrado_por_id').references(() => usuarios.id),
    encerradoEm: momento('encerrado_em'),
    motivoEncerramento: text('motivo_encerramento'),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('pedidos_chave_uq').on(t.chave),
    uniqueIndex('pedidos_numero_uq').on(t.numero),
    index('pedidos_data_idx').on(t.dataOperacional),
    index('pedidos_mesa_idx').on(t.mesaId),
  ],
);

export const pedidoItens = pgTable(
  'pedido_itens',
  {
    id: id(),
    pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
    produtoId: uuid('produto_id').notNull().references(() => produtos.id),
    nome: text('nome').notNull(), // como estava no cardápio na hora da venda
    setor: text('setor').notNull(),
    quantidade: integer('quantidade').notNull(),
    precoCentavos: integer('preco_centavos').notNull(),
    subtotalCentavos: integer('subtotal_centavos').notNull(),
    balde: integer('balde'), // número do balde dentro do pedido (1, 2...); vazio quando não vai em balde
    quantidadeCancelada: integer('quantidade_cancelada').notNull().default(0), // cancelados um a um pelo administrador
    unidades: integer('unidades').notNull().default(1), // unidades do produto por item (combo da promoção: 2)
    promocaoId: uuid('promocao_id'), // promoção que deu o preço deste item
  },
  (t) => [index('pedido_itens_pedido_idx').on(t.pedidoId)],
);

export const preparos = pgTable(
  'preparos',
  {
    id: id(),
    pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
    setor: text('setor').notNull(),
    status: text('status').notNull().default('novo'), // novo | preparando | pronto | entregue | cancelado
    criadoEm: criadoEm(),
    iniciadoEm: momento('iniciado_em'),
    prontoEm: momento('pronto_em'),
    entregueEm: momento('entregue_em'),
  },
  (t) => [uniqueIndex('preparos_pedido_setor_uq').on(t.pedidoId, t.setor), index('preparos_status_idx').on(t.setor, t.status)],
);

export const solicitacoes = pgTable(
  'solicitacoes',
  {
    id: id(),
    pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
    solicitanteId: uuid('solicitante_id').notNull().references(() => usuarios.id),
    motivo: text('motivo').notNull(),
    status: text('status').notNull().default('pendente'), // pendente | aprovada | recusada
    decididoPorId: uuid('decidido_por_id').references(() => usuarios.id),
    decididoEm: momento('decidido_em'),
    criadoEm: criadoEm(),
  },
  (t) => [index('solicitacoes_status_idx').on(t.status)],
);

export const eventos = pgTable(
  'eventos',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tipo: text('tipo').notNull(),
    pedidoId: uuid('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    descricao: text('descricao').notNull(),
    dados: jsonb('dados'),
    criadoEm: criadoEm(),
  },
  (t) => [index('eventos_pedido_idx').on(t.pedidoId)],
);

/** Despesas do bar (funcionários, compras de bebidas e de comidas, contas...), lançadas pelo administrador. */
export const despesas = pgTable(
  'despesas',
  {
    id: id(),
    data: text('data').notNull(), // AAAA-MM-DD da despesa
    categoria: text('categoria').notNull(),
    descricao: text('descricao').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    funcionarioId: uuid('funcionario_id').references(() => usuarios.id), // quando é pagamento de funcionário
    funcionarioNome: text('funcionario_nome'), // nome digitado (vale também para quem não tem login)
    criadoPorId: uuid('criado_por_id').notNull().references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (t) => [index('despesas_data_idx').on(t.data)],
);

/** Configurações gerais (ex.: dados do site público: endereço, WhatsApp, horário). */
export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: jsonb('valor').notNull(),
  atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
});

/** Cada entrada, saída, venda, cancelamento e ajuste do estoque, com o saldo depois. */
export const estoqueMovimentos = pgTable(
  'estoque_movimentos',
  {
    id: id(),
    produtoId: uuid('produto_id').notNull().references(() => produtos.id),
    tipo: text('tipo').notNull(), // entrada | saida | venda | cancelamento | ajuste
    quantidade: integer('quantidade').notNull(), // + entra, - sai
    saldo: integer('saldo').notNull(),
    motivo: text('motivo'),
    pedidoId: uuid('pedido_id').references(() => pedidos.id, { onDelete: 'set null' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (t) => [index('estoque_mov_produto_idx').on(t.produtoId), index('estoque_mov_data_idx').on(t.criadoEm)],
)

/** Como o pedido foi pago. Uma linha por pagamento; conta dividida tem várias (ex.: metade Pix, metade crédito). */
export const pedidoPagamentos = pgTable(
  'pedido_pagamentos',
  {
    id: id(),
    pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
    forma: text('forma').notNull(), // credito | debito | pix | dinheiro
    valorCentavos: integer('valor_centavos').notNull(),
    pessoa: text('pessoa'), // quem pagou essa parte (opcional)
  },
  (t) => [index('pedido_pagamentos_pedido_idx').on(t.pedidoId)],
);

/** Fechamento de caixa do turno: o que o sistema registrou × o que foi contado e o que a maquininha mostra. */
export const caixaFechamentos = pgTable('caixa_fechamentos', {
  data: text('data').primaryKey(), // AAAA-MM-DD do turno
  trocoInicialCentavos: integer('troco_inicial_centavos').notNull().default(0),
  sistema: jsonb('sistema').notNull(), // por forma, no momento do fechamento
  conferido: jsonb('conferido').notNull(), // por forma: dinheiro contado, relatório da maquininha
  observacao: text('observacao'),
  fechadoPorId: uuid('fechado_por_id').notNull().references(() => usuarios.id),
  fechadoEm: criadoEm(),
});

/** Promoções programadas: combo de N unidades de um produto por um preço, nos dias e horário marcados. */
export const promocoes = pgTable('promocoes', {
  id: id(),
  nome: text('nome').notNull(),
  produtoId: uuid('produto_id').notNull().references(() => produtos.id),
  quantidadeCombo: integer('quantidade_combo').notNull(),
  precoComboCentavos: integer('preco_combo_centavos').notNull(),
  dias: jsonb('dias').$type<number[]>().notNull(), // 0 = domingo ... 6 = sábado
  inicio: text('inicio').notNull(), // HH:MM no horário de Manaus
  fim: text('fim').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  destaque: text('destaque'), // aviso no cardápio, ex.: "Original em dobro até as 20h"
  criadoEm: criadoEm(),
});

/** Abertura (troco), suprimentos e sangrias do caixa no turno. */
export const caixaMovimentos = pgTable(
  'caixa_movimentos',
  {
    id: id(),
    data: text('data').notNull(), // AAAA-MM-DD do turno
    tipo: text('tipo').notNull(), // abertura | suprimento | sangria
    valorCentavos: integer('valor_centavos').notNull(),
    motivo: text('motivo'),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (t) => [index('caixa_mov_data_idx').on(t.data)],
);
