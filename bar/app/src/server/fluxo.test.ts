// Fluxo completo contra um PostgreSQL de verdade (PGlite em memória).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirPglite, schema, type Db } from '@/db';
import type { Usuario } from './auth';
import { definirLugaresBalcao, atualizarFuncionario, criarFuncionario, listarEquipe, listarMesas, listarProdutos, primeiroAcesso, atualizarProduto, criarProduto, excluirProduto, recusarConta, solicitarConta } from './cadastros';
import { cancelarItem, encerrar, recusar, solicitar, listarSolicitacoes } from './cancelamentos';
import { confirmarPagamento, detalhePedido, listarPedidos, previa } from './pedidos';
import { finalizarMesa, finalizarPedido, mudarStatus, painelSetor, prontosParaEntrega } from './preparo';
import { relatorio, mesasDoTurno } from './relatorios';
import { versaoAtual } from './eventos';
import { custosELucro, excluirDespesa, lancarDespesa } from './financeiro';
import { contaDaTela } from './acessoTela';
import { alterarEstoque, listarMovimentos } from './estoque';
import { conferirEstorno, estornosPendentes, fecharCaixa, movimentarCaixa, resumoCaixa } from './caixa';
import { listarPromocoes, promocoesAgora, salvarPromocao } from './promocoes';

let db: Db;
let admin: Usuario;
let garcom: Usuario;
let cozinha: Usuario;
let bar: Usuario;
let mesa: string;
let batata: { id: string; precoCentavos: number };
let chopp: { id: string; precoCentavos: number };

const comoUsuario = (x: { id: string; nome: string; usuario: string; papel: string }) => x as Usuario;

beforeAll(async () => {
  db = await abrirPglite();
  admin = await primeiroAcesso(db, { nome: 'Dona', usuario: 'dona', senha: '1234', exemplo: true, mesas: 5 });
  garcom = comoUsuario(await criarFuncionario(db, admin, { nome: 'Ana', usuario: 'ana', senha: '1111', papel: 'garcom' }));
  cozinha = comoUsuario(await criarFuncionario(db, admin, { nome: 'Cozinha', usuario: 'cozinha', senha: '2222', papel: 'cozinha' }));
  bar = comoUsuario(await criarFuncionario(db, admin, { nome: 'Bar', usuario: 'bar', senha: '3333', papel: 'bar' }));
  mesa = (await listarMesas(db)).find((m) => m.numero === 3)!.id;
  const prods = await listarProdutos(db);
  batata = prods.find((p) => p.nome === 'Batata frita')!;
  chopp = prods.find((p) => p.nome === 'Chopp 300 ml')!;
  // os testes do painel do bar usam bebidas que passam pelo bar; "sai direto" tem teste próprio
  for (const p of prods.filter((x) => x.servirDireto)) await atualizarProduto(db, admin, p.id, { servirDireto: false });
});

const pedidoBase = () => ({
  chave: randomUUID(),
  mesaId: mesa,
  itens: [{ produtoId: batata.id, quantidade: 1 }, { produtoId: chopp.id, quantidade: 2 }],
  formaPagamento: 'credito',
});

describe('fluxo do pedido pago', () => {
  it('primeiro acesso cria administrador, mesas, balcão e cardápio', async () => {
    const mesas = await listarMesas(db);
    // balcão com 10 cadeiras primeiro (1001 = Balcão 1), depois as mesas; o balcão geral (0) fica guardado
    expect(mesas.map((m) => m.numero)).toEqual([...Array.from({ length: 10 }, (_, i) => 1001 + i), 1, 2, 3, 4, 5]);
    expect(mesas[0].nome).toBe('Balcão 1');
    expect((await listarMesas(db, true)).find((m) => m.numero === 0)).toMatchObject({ nome: 'Balcão', ativa: false });
    expect((await listarProdutos(db)).length).toBeGreaterThan(5);
    await expect(primeiroAcesso(db, { nome: 'X', usuario: 'x', senha: '1234' })).rejects.toThrow(/já foi configurado/);
  });

  it('prévia calcula o total antes de cobrar', async () => {
    const p = await previa(db, { mesaId: mesa, itens: pedidoBase().itens });
    expect(p.totalCentavos).toBe(batata.precoCentavos + 2 * chopp.precoCentavos);
    expect(p.mesa.numero).toBe(3);
  });

  it('nada vai para preparo antes da confirmação; depois, petiscos na cozinha e bebidas no bar', async () => {
    expect((await painelSetor(db, 'cozinha')).preparos).toHaveLength(0);
    const v0 = await versaoAtual(db);
    const { pedido, duplicado } = await confirmarPagamento(db, garcom, { ...pedidoBase(), cliente: '  Mariana   Souza ' });
    expect(duplicado).toBe(false);
    expect(pedido!.status).toBe('pago');
    expect(pedido!.confirmacao).toBe('manual_garcom');
    expect(pedido!.formaPagamento).toBe('credito');
    expect(pedido!.garcom).toBe('Ana');
    expect(pedido!.cliente).toBe('Mariana Souza');
    expect(await versaoAtual(db)).toBeGreaterThan(v0);
    const coz = await painelSetor(db, 'cozinha');
    const br = await painelSetor(db, 'bar');
    expect(coz.preparos).toHaveLength(1);
    expect(coz.preparos[0].itens).toEqual([{ nome: 'Batata frita', quantidade: 1, balde: null }]);
    expect(br.preparos[0].itens).toEqual([{ nome: 'Chopp 300 ml', quantidade: 2, balde: null }]);
    expect(br.preparos[0].mesa).toBe(3);
    expect(br.preparos[0].cliente).toBe('Mariana Souza');
  });

  it('o mesmo envio repetido (ou simultâneo) não cria outro pedido', async () => {
    const c = pedidoBase();
    const [a, b, d] = await Promise.all([confirmarPagamento(db, garcom, c), confirmarPagamento(db, garcom, c), confirmarPagamento(db, garcom, c)]);
    expect(new Set([a.pedido!.id, b.pedido!.id, d.pedido!.id]).size).toBe(1);
    expect([a, b, d].filter((r) => !r.duplicado)).toHaveLength(1);
    const outra = await confirmarPagamento(db, garcom, c);
    expect(outra.duplicado).toBe(true);
    const daMesa = await db.select().from(schema.pedidos);
    expect(daMesa.filter((p) => p.chave === c.chave)).toHaveLength(1);
  });

  it('a mesma mesa faz vários pedidos pagos, sem comanda', async () => {
    const lista = await listarPedidos(db, { mesaId: mesa });
    expect(lista.length).toBeGreaterThanOrEqual(2);
    const { mesas } = await mesasDoTurno(db, lista[0].dataOperacional);
    expect(mesas.find((m) => m.id === mesa)!.pedidos).toBe(lista.length); // todos ainda na cozinha e no bar
    expect(mesas.find((m) => m.id === mesa)!.clientes).toEqual(['Mariana Souza']);
  });

  it('mesa finalizada volta limpa (sem total, clientes ou pedidos), mas o turno e as vendas guardam tudo', async () => {
    const outra = (await listarMesas(db)).find((m) => m.numero === 4)!.id;
    const { pedido } = await confirmarPagamento(db, garcom, { ...pedidoBase(), mesaId: outra, cliente: 'Lia' });
    let r = await mesasDoTurno(db, pedido!.dataOperacional);
    expect(r.mesas.find((m) => m.id === outra)).toMatchObject({ pedidos: 1, clientes: ['Lia'], totalCentavos: pedido!.totalCentavos });
    const turnoAntes = r.turno.totalCentavos;
    await finalizarMesa(db, admin, outra, pedido!.dataOperacional);
    r = await mesasDoTurno(db, pedido!.dataOperacional);
    expect(r.mesas.find((m) => m.id === outra)).toMatchObject({ pedidos: 0, abertos: 0, clientes: [], totalCentavos: 0, porForma: {} });
    expect(r.turno.totalCentavos).toBe(turnoAntes);
    expect((await listarPedidos(db, { mesaId: outra })).some((p) => p.id === pedido!.id)).toBe(true);
  });

  it('recusa forma de pagamento ausente e total cobrado que não confere', async () => {
    await expect(confirmarPagamento(db, garcom, { ...pedidoBase(), formaPagamento: 'fiado' })).rejects.toThrow(/forma de pagamento/);
    await expect(
      confirmarPagamento(db, garcom, { ...pedidoBase(), totalCobradoCentavos: 1, precosCobrados: [{ produtoId: batata.id, precoCentavos: batata.precoCentavos }, { produtoId: chopp.id, precoCentavos: chopp.precoCentavos }] }),
    ).rejects.toThrow(/não confere/);
  });

  it('preço alterado entre a prévia e a confirmação: registra o cobrado e marca divergência', async () => {
    const itens = [{ produtoId: chopp.id, quantidade: 1 }];
    const pv = await previa(db, { mesaId: mesa, itens });
    await atualizarProduto(db, admin, chopp.id, { precoCentavos: chopp.precoCentavos + 100 });
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, itens, formaPagamento: 'pix', totalCobradoCentavos: pv.totalCentavos, precosCobrados: pv.linhas });
    expect(pedido!.totalCentavos).toBe(chopp.precoCentavos);
    expect(pedido!.divergenciaPreco).toBe(true);
    await atualizarProduto(db, admin, chopp.id, { precoCentavos: chopp.precoCentavos });
  });

  it('cozinha e bar atualizam o status; o garçom é avisado e marca entregue', async () => {
    const { pedido } = await confirmarPagamento(db, garcom, pedidoBase());
    const prc = pedido!.preparos.find((p) => p.setor === 'cozinha')!;
    await expect(mudarStatus(db, bar, prc.id, 'preparando')).rejects.toThrow();
    await expect(mudarStatus(db, cozinha, prc.id, 'pronto')).rejects.toThrow(/Não é possível/);
    await mudarStatus(db, cozinha, prc.id, 'preparando');
    await mudarStatus(db, cozinha, prc.id, 'preparando'); // toque repetido não dá erro
    await mudarStatus(db, cozinha, prc.id, 'pronto');
    const prontos = await prontosParaEntrega(db);
    expect(prontos.some((x) => x.id === prc.id && x.garcomId === garcom.id)).toBe(true);
    await expect(mudarStatus(db, cozinha, prc.id, 'entregue')).rejects.toThrow();
    await mudarStatus(db, garcom, prc.id, 'entregue');
    const d = await detalhePedido(db, pedido!.id);
    expect(d!.preparos.find((p) => p.setor === 'cozinha')!.status).toBe('entregue');
    expect(d!.situacao).toBe('parcial');
    expect(d!.linhaDoTempo.map((e) => e.tipo)).toEqual(expect.arrayContaining(['pagamento_confirmado', 'enviado_preparo', 'preparo_preparando', 'preparo_pronto', 'preparo_entregue']));
  });

  it('cancelamento: garçom só solicita; administrador autoriza e o pedido sai dos painéis', async () => {
    const { pedido } = await confirmarPagamento(db, garcom, pedidoBase());
    await expect(encerrar(db, garcom, pedido!.id, 'Cliente desistiu')).rejects.toThrow(/administrador/);
    await expect(solicitar(db, garcom, pedido!.id, '')).rejects.toThrow(/motivo/);
    const s = await solicitar(db, garcom, pedido!.id, 'Cliente desistiu');
    expect((await solicitar(db, garcom, pedido!.id, 'De novo')).id).toBe(s.id);
    expect((await listarSolicitacoes(db, 'pendente')).some((x) => x.id === s.id)).toBe(true);
    const r = await encerrar(db, admin, pedido!.id, 'Cliente desistiu', s.id);
    expect(r.tipo).toBe('cancelado');
    const d = await detalhePedido(db, pedido!.id);
    expect(d!.status).toBe('cancelado');
    expect(d!.encerradoPor).toBe('Dona');
    expect(d!.preparos.every((p) => p.status === 'cancelado')).toBe(true);
    expect((await painelSetor(db, 'bar')).preparos.some((p) => p.pedidoId === pedido!.id)).toBe(false);
    await expect(encerrar(db, admin, pedido!.id, 'De novo aqui')).rejects.toThrow(/já foi/);
    expect((await listarSolicitacoes(db)).find((x) => x.id === s.id)!.status).toBe('aprovada');
  });

  it('estorno quando já houve preparo; recusa de solicitação fica registrada', async () => {
    const { pedido } = await confirmarPagamento(db, garcom, pedidoBase());
    await mudarStatus(db, bar, pedido!.preparos.find((p) => p.setor === 'bar')!.id, 'preparando');
    const s = await solicitar(db, garcom, pedido!.id, 'Bebida errada');
    await recusar(db, admin, s.id);
    await expect(recusar(db, admin, s.id)).rejects.toThrow(/já foi decidida/);
    expect((await detalhePedido(db, pedido!.id))!.status).toBe('pago');
    expect((await encerrar(db, admin, pedido!.id, 'Bebida errada, devolvido')).tipo).toBe('estornado');
  });

  it('relatório separa bruto, cancelado, estornado e líquido', async () => {
    const lista = await listarPedidos(db, {});
    const data = lista[0].dataOperacional;
    const r = (await relatorio(db, data, data)).resumo;
    const soma = (st: string) => lista.filter((p) => p.status === st).reduce((a, p) => a + p.totalCentavos, 0);
    expect(r.brutoCentavos).toBe(lista.reduce((a, p) => a + p.totalCentavos, 0));
    expect(r.canceladoCentavos).toBe(soma('cancelado'));
    expect(r.estornadoCentavos).toBe(soma('estornado'));
    expect(r.liquidoCentavos).toBe(soma('pago'));
    expect(r.divergencias).toBe(1);
  });

  it('custos e lucro: despesas por categoria descontadas das vendas líquidas', async () => {
    const lista = await listarPedidos(db, {});
    const data = lista[0].dataOperacional;
    const liquido = lista.filter((p) => p.status === 'pago').reduce((a, p) => a + p.totalCentavos, 0);
    await lancarDespesa(db, admin, { data, categoria: 'funcionarios', descricao: 'Diária', valorCentavos: 8000, funcionarioNome: 'ana' });
    await expect(lancarDespesa(db, admin, { data, categoria: 'funcionarios', descricao: 'Diária', valorCentavos: 8000 })).rejects.toThrow(/nome do funcionário/);
    const beb = await lancarDespesa(db, admin, { data, categoria: 'bebidas', descricao: 'Caixas de chopp', valorCentavos: 5000 });
    await expect(lancarDespesa(db, admin, { data, categoria: 'bebidas', descricao: '', valorCentavos: 100 })).rejects.toThrow(/Descreva/);
    let r = await custosELucro(db, data, data);
    expect(r.resumo.vendasCentavos).toBe(liquido);
    expect(r.resumo.despesasCentavos).toBe(13000);
    expect(r.resumo.lucroCentavos).toBe(liquido - 13000);
    const paga = r.despesas.find((d) => d.categoria === 'funcionarios')!;
    expect(paga.funcionarioNome).toBe('Ana'); // gravado como no cadastro
    expect(paga.funcionarioId).toBe(garcom.id); // nome de alguém da equipe liga à conta dele
    expect(r.resumo.porFuncionario).toEqual([{ nome: 'Ana', valorCentavos: 8000, lancamentos: 1 }]);
    expect(r.vendasPorSetor.cozinha + r.vendasPorSetor.bar).toBe(liquido);
    await excluirDespesa(db, admin, beb.id);
    r = await custosELucro(db, data, data);
    expect(r.resumo.despesasCentavos).toBe(8000);
  });

  it('garçom cria a própria conta; só entra depois que o administrador aprovar', async () => {
    await expect(solicitarConta(db, { nome: 'Esperto', usuario: 'chefe', senha: '1234', papel: 'admin' })).rejects.toThrow(/Só o garçom/);
    await expect(solicitarConta(db, { nome: 'Cozinheira', usuario: 'cozinheira', senha: '1234', papel: 'cozinha' })).rejects.toThrow(/Só o garçom/);
    await expect(solicitarConta(db, { nome: 'Barman', usuario: 'barman', senha: '1234', papel: 'bar' })).rejects.toThrow(/Só o garçom/);
    await solicitarConta(db, { nome: 'Joao', usuario: 'joao', senha: '1234', papel: 'garcom' });
    await expect(solicitarConta(db, { nome: 'Outro', usuario: 'joao', senha: '1234', papel: 'garcom' })).rejects.toThrow(/já existe/);
    await solicitarConta(db, { nome: 'Fulano', usuario: 'fulano', senha: '1234', papel: 'garcom' });
    let equipe = await listarEquipe(db);
    const joao = equipe.find((f) => f.usuario === 'joao')!;
    expect(joao).toMatchObject({ pendente: true, ativo: false, papel: 'garcom' });
    await atualizarFuncionario(db, admin, joao.id, { ativo: true });
    await recusarConta(db, admin, equipe.find((f) => f.usuario === 'fulano')!.id);
    await expect(recusarConta(db, admin, joao.id)).rejects.toThrow(/não está mais aguardando/);
    equipe = await listarEquipe(db);
    expect(equipe.find((f) => f.usuario === 'joao')).toMatchObject({ pendente: false, ativo: true });
    expect(equipe.some((f) => f.usuario === 'fulano')).toBe(false);
  });

  it('balde: cervejas pequenas misturadas, até 10 por balde, chegam ao bar separadas por balde', async () => {
    const prods = await listarProdutos(db);
    const lata = prods.find((p) => p.nome === 'Cerveja lata 350 ml')!;
    const long = prods.find((p) => p.nome === 'Cerveja long neck')!;
    expect(lata.balde && long.balde).toBe(true);
    expect(prods.find((p) => p.nome === 'Chopp 300 ml')!.balde).toBe(false);
    const itens = [
      { produtoId: lata.id, quantidade: 6, balde: 1 },
      { produtoId: long.id, quantidade: 4, balde: 1 },
      { produtoId: lata.id, quantidade: 1 },
    ];
    await expect(confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, formaPagamento: 'pix', itens: [{ produtoId: lata.id, quantidade: 11, balde: 1 }] })).rejects.toThrow(/máximo é 10/);
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, formaPagamento: 'pix', itens });
    expect(pedido!.totalCentavos).toBe(7 * lata.precoCentavos + 4 * long.precoCentavos);
    const ticket = (await painelSetor(db, 'bar')).preparos.find((p) => p.pedidoId === pedido!.id)!;
    expect(ticket.itens.filter((i) => i.balde === 1).reduce((a, i) => a + i.quantidade, 0)).toBe(10);
    expect(ticket.itens.find((i) => !i.balde)).toMatchObject({ nome: 'Cerveja lata 350 ml', quantidade: 1 });
  });

  it('cozinha e bar sem senha: conta interna de cada tela, só do seu setor e fora da lista de funcionários', async () => {
    const coz = await contaDaTela(db, 'cozinha');
    const bar = await contaDaTela(db, 'bar');
    expect(coz).toMatchObject({ usuario: 'tela-cozinha', papel: 'cozinha', ativo: true });
    expect(bar).toMatchObject({ usuario: 'tela-bar', papel: 'bar', ativo: true });
    expect((await contaDaTela(db, 'cozinha')).id).toBe(coz.id); // não cria outra
    expect((await listarEquipe(db)).some((f) => f.usuario.startsWith('tela-'))).toBe(false);
  });

  it('cancelar item por item: só o administrador, desconta do pedido, tira do painel e encerra o pedido quando não sobra nada', async () => {
    const { pedido } = await confirmarPagamento(db, garcom, {
      chave: randomUUID(),
      mesaId: mesa,
      formaPagamento: 'credito',
      itens: [
        { produtoId: batata.id, quantidade: 2 },
        { produtoId: chopp.id, quantidade: 3 },
      ],
    });
    const p = pedido!;
    const itemChopp = p.itens.find((i) => i.produtoId === chopp.id)!;
    const itemBatata = p.itens.find((i) => i.produtoId === batata.id)!;
    await expect(cancelarItem(db, garcom, p.id, itemChopp.id, 1, 'cliente desistiu')).rejects.toThrow(/administrador/);
    await expect(cancelarItem(db, admin, p.id, itemChopp.id, 4, 'cliente desistiu')).rejects.toThrow(/de 1 a 3/);
    expect(await cancelarItem(db, admin, p.id, itemChopp.id, 1, 'cliente desistiu')).toMatchObject({ cancelados: 1, valorCentavos: chopp.precoCentavos, tipo: 'cancelado' });
    let lista = (await listarPedidos(db, {})).find((x) => x.id === p.id)!;
    expect(lista.liquidoCentavos).toBe(p.totalCentavos - chopp.precoCentavos);
    expect((await painelSetor(db, 'bar')).preparos.find((x) => x.pedidoId === p.id)!.itens).toEqual([{ nome: 'Chopp 300 ml', quantidade: 2, balde: null }]);
    // o resto do chopp: o bar fica sem nada desse pedido
    await cancelarItem(db, admin, p.id, itemChopp.id, 2, 'cliente desistiu');
    expect((await painelSetor(db, 'bar')).preparos.some((x) => x.pedidoId === p.id)).toBe(false);
    expect((await painelSetor(db, 'cozinha')).preparos.some((x) => x.pedidoId === p.id)).toBe(true);
    await expect(cancelarItem(db, admin, p.id, itemChopp.id, 1, 'de novo')).rejects.toThrow(/todo cancelado/);
    // sem nada valendo, o pedido inteiro fica cancelado
    await cancelarItem(db, admin, p.id, itemBatata.id, 2, 'cozinha sem batata');
    lista = (await listarPedidos(db, {})).find((x) => x.id === p.id)!;
    expect(lista.status).toBe('cancelado');
    expect(lista.liquidoCentavos).toBe(0);
  });

  it('administrador finaliza o pedido inteiro: tudo vira entregue e sai dos painéis', async () => {
    const { pedido } = await confirmarPagamento(db, garcom, pedidoBase());
    const p = pedido!;
    await expect(finalizarPedido(db, garcom, p.id)).rejects.toThrow(/Seu perfil/);
    expect(await finalizarPedido(db, admin, p.id)).toEqual({ finalizados: 2 });
    expect((await painelSetor(db, 'cozinha')).preparos.some((x) => x.pedidoId === p.id)).toBe(false);
    expect((await painelSetor(db, 'bar')).preparos.some((x) => x.pedidoId === p.id)).toBe(false);
    const depois = (await listarPedidos(db, {})).find((x) => x.id === p.id)!;
    expect(depois.preparos.every((x) => x.status === 'entregue')).toBe(true);
    expect(await finalizarPedido(db, admin, p.id)).toEqual({ finalizados: 0 }); // toque repetido
  });

  it('estoque: venda baixa, prévia barra quando falta, cancelamento devolve e estorno não', async () => {
    const lata = (await listarProdutos(db)).find((p) => p.nome === 'Cerveja lata 350 ml')!;
    await expect(alterarEstoque(db, garcom, lata.id, 'ajustar', 10)).rejects.toThrow(/Seu perfil/);
    expect(await alterarEstoque(db, admin, lata.id, 'ajustar', 10)).toEqual({ estoque: 10, trava: true });
    const est = async () => (await listarProdutos(db, true)).find((p) => p.id === lata.id)!.estoque;
    await expect(previa(db, { mesaId: mesa, itens: [{ produtoId: lata.id, quantidade: 11 }] })).rejects.toThrow(/restam 10/);
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, formaPagamento: 'pix', itens: [{ produtoId: lata.id, quantidade: 6, balde: 1 }, { produtoId: lata.id, quantidade: 1 }] });
    expect(await est()).toBe(3);
    // cancelar 2 antes de preparar: voltam para o estoque
    const item = pedido!.itens.find((i) => i.balde === 1)!;
    await cancelarItem(db, admin, pedido!.id, item.id, 2, 'cliente desistiu');
    expect(await est()).toBe(5);
    // já em preparo: estorno não devolve
    const prep = pedido!.preparos.find((x) => x.setor === 'bar')!;
    await mudarStatus(db, bar, prep.id, 'preparando');
    await cancelarItem(db, admin, pedido!.id, item.id, 1, 'derrubou no chão');
    expect(await est()).toBe(5);
    expect(await alterarEstoque(db, admin, lata.id, 'entrada', 24)).toEqual({ estoque: 29, trava: true });
    await alterarEstoque(db, admin, lata.id, 'desligar', null);
    expect(await est()).toBeNull();
    // sem controle, vende à vontade
    expect((await previa(db, { mesaId: mesa, itens: [{ produtoId: lata.id, quantidade: 50 }] })).totalCentavos).toBe(50 * lata.precoCentavos);
  });

  it('promoção em dobro: 2 por 1 até as 20h de Manaus, baixa 2 do estoque, preserva o preço cobrado antes do fim', async () => {
    const lata = (await listarProdutos(db)).find((p) => p.nome === 'Cerveja lata 350 ml')!;
    await alterarEstoque(db, admin, lata.id, 'ajustar', 20);
    const est = async () => (await listarProdutos(db, true)).find((p) => p.id === lata.id)!.estoque;
    await expect(salvarPromocao(db, garcom, null, {})).rejects.toThrow(/perfil/);
    const { promocao } = await salvarPromocao(db, admin, null, { nome: 'Lata em dobro', produtoId: lata.id, quantidadeCombo: 2, precoComboCentavos: lata.precoCentavos, dias: [0, 1, 2, 3, 4, 5, 6], inicio: '10:00', fim: '20:00', destaque: 'Lata em dobro até as 20h' });
    const as1930 = new Date('2026-11-06T19:30:00-04:00');
    expect((await promocoesAgora(db, as1930)).map((p) => p.id)).toEqual([promocao.id]);
    expect(await promocoesAgora(db, new Date('2026-11-06T20:00:00-04:00'))).toEqual([]);
    const conf = (agora: Date, cobrado?: boolean) =>
      confirmarPagamento(
        db,
        garcom,
        {
          chave: randomUUID(),
          mesaId: mesa,
          formaPagamento: 'pix',
          itens: [{ produtoId: lata.id, quantidade: 2 }],
          ...(cobrado ? { totalCobradoCentavos: lata.precoCentavos, precosCobrados: [{ produtoId: lata.id, precoCentavos: lata.precoCentavos, promocaoId: promocao.id }] } : {}),
        },
        agora,
      );
    const a = await conf(as1930);
    expect(a.pedido!.totalCentavos).toBe(lata.precoCentavos); // 2 pelo preço de 1
    expect(await est()).toBe(18); // baixa as 2 latas
    // cobrou às 19:58 e confirmou às 20:05: mantém o preço da promoção
    const b = await conf(new Date('2026-11-06T20:05:00-04:00'), true);
    expect(b.pedido!.totalCentavos).toBe(lata.precoCentavos);
    // pedido novo depois das 20h: preço normal
    const c = await conf(new Date('2026-11-06T20:30:00-04:00'));
    expect(c.pedido!.totalCentavos).toBe(2 * lata.precoCentavos);
    expect(await est()).toBe(14);
    // cancelar o combo antes de preparar devolve as 2 unidades
    await encerrar(db, admin, a.pedido!.id, 'Cliente desistiu');
    expect(await est()).toBe(16);
    // só no Balcão 10: na mesa comum volta ao preço normal
    await salvarPromocao(db, admin, promocao.id, { nome: 'Lata em dobro', produtoId: lata.id, quantidadeCombo: 2, precoComboCentavos: lata.precoCentavos, dias: [0, 1, 2, 3, 4, 5, 6], inicio: '10:00', fim: '20:00', mesas: [1010] });
    const d = await conf(as1930);
    expect(d.pedido!.totalCentavos).toBe(2 * lata.precoCentavos);
    await encerrar(db, admin, d.pedido!.id, 'teste de mesa');
    const r = (await listarPromocoes(db, '2026-11-06', '2026-11-06')).promocoes.find((p) => p.id === promocao.id)!;
    expect(r.resultado).toMatchObject({ combos: 1, unidades: 2, faturadoCentavos: lata.precoCentavos, descontoCentavos: lata.precoCentavos });
    await salvarPromocao(db, admin, promocao.id, { nome: 'Lata em dobro', produtoId: lata.id, quantidadeCombo: 2, precoComboCentavos: lata.precoCentavos, dias: [0], inicio: '10:00', fim: '20:00', ativa: false });
    await alterarEstoque(db, admin, lata.id, 'desligar', null);
  });

  it('cadeiras do balcão: o administrador define quantas; sem cadeiras volta o balcão geral', async () => {
    await expect(definirLugaresBalcao(db, garcom, 4)).rejects.toThrow();
    await definirLugaresBalcao(db, admin, 4);
    let ativas = (await listarMesas(db)).map((m) => m.numero);
    expect(ativas.filter((n) => n > 1000)).toEqual([1001, 1002, 1003, 1004]);
    expect(ativas.includes(0)).toBe(false);
    await definirLugaresBalcao(db, admin, 0);
    ativas = (await listarMesas(db)).map((m) => m.numero);
    expect(ativas[0]).toBe(0);
    expect(ativas.some((n) => n > 1000)).toBe(false);
    await definirLugaresBalcao(db, admin, 10);
    expect((await listarMesas(db)).filter((m) => m.numero > 1000)).toHaveLength(10);
  });

  it('estoque: entrada e saída com histórico; comida começa do zero sem travar a venda', async () => {
    const prods = await listarProdutos(db, true);
    const isca = prods.find((p) => p.nome === 'Isca de frango')!;
    // comida sem estoque inicial: a primeira entrada começa o controle do zero e não trava a venda
    expect(await alterarEstoque(db, admin, isca.id, 'entrada', 5, 'compra no açougue')).toEqual({ estoque: 5, trava: false });
    await expect(alterarEstoque(db, admin, isca.id, 'saida', 1, '')).rejects.toThrow(/motivo/);
    expect(await alterarEstoque(db, admin, isca.id, 'saida', 1, 'passou do ponto')).toMatchObject({ estoque: 4 });
    // vende 6 mesmo com 4: só registra (fica negativo)
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, formaPagamento: 'pix', itens: [{ produtoId: isca.id, quantidade: 6 }] });
    expect((await listarProdutos(db, true)).find((p) => p.id === isca.id)!.estoque).toBe(-2);
    const movs = (await listarMovimentos(db)).filter((m) => m.produto === 'Isca de frango');
    expect(movs.map((m) => [m.tipo, m.quantidade, m.saldo])).toEqual([
      ['venda', -6, -2],
      ['saida', -1, 4],
      ['entrada', 5, 5],
    ]);
    expect(movs[0].motivo).toBe(`Pedido #${pedido!.numero}`);
    // ligando a trava, passa a barrar
    await alterarEstoque(db, admin, isca.id, 'trava', true);
    await expect(previa(db, { mesaId: mesa, itens: [{ produtoId: isca.id, quantidade: 1 }] })).rejects.toThrow(/esgotado/);
    await alterarEstoque(db, admin, isca.id, 'desligar', null);
  });

  it('bebida que sai direto: o garçom já entrega ao confirmar; não vai para o painel nem deixa a mesa aberta', async () => {
    await atualizarProduto(db, admin, chopp.id, { servirDireto: true });
    const caipi = (await listarProdutos(db)).find((p) => p.nome === 'Aperol spritz')!;
    const outra = (await listarMesas(db)).find((m) => m.numero === 5)!.id;
    // só chopp: o bar já nasce entregue
    const so = (await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: outra, formaPagamento: 'pix', itens: [{ produtoId: chopp.id, quantidade: 4 }] })).pedido!;
    expect(so.preparos).toMatchObject([{ setor: 'bar', status: 'entregue' }]);
    expect((await painelSetor(db, 'bar')).preparos.some((x) => x.pedidoId === so.id)).toBe(false);
    expect((await listarPedidos(db, {})).find((x) => x.id === so.id)!.situacao).toBe('entregue');
    expect((await mesasDoTurno(db, so.dataOperacional)).mesas.find((m) => m.id === outra)!.abertos).toBe(0);
    // misturado com drink: o bar recebe só o drink
    const mix = (await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: outra, formaPagamento: 'pix', itens: [{ produtoId: chopp.id, quantidade: 2 }, { produtoId: caipi.id, quantidade: 1 }] })).pedido!;
    const ticket = (await painelSetor(db, 'bar')).preparos.find((x) => x.pedidoId === mix.id)!;
    expect(ticket.itens).toEqual([{ nome: 'Aperol spritz', quantidade: 1, balde: null }]);
    await atualizarProduto(db, admin, chopp.id, { servirDireto: false });
  });

  it('conta dividida: várias formas que fecham o total; item cancelado reparte entre elas; fechamento de caixa confere', async () => {
    const outra = (await listarMesas(db)).find((m) => m.numero === 2)!.id;
    const total = 2 * batata.precoCentavos;
    await expect(
      confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: outra, formaPagamento: null, itens: [{ produtoId: batata.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 100 }] }),
    ).rejects.toThrow(/falta/);
    const { pedido } = await confirmarPagamento(db, garcom, {
      chave: randomUUID(),
      mesaId: outra,
      formaPagamento: null,
      itens: [{ produtoId: batata.id, quantidade: 2 }],
      pagamentos: [
        { forma: 'pix', valorCentavos: total / 2, pessoa: 'Ana' },
        { forma: 'dinheiro', valorCentavos: total / 2, pessoa: 'Bia' },
      ],
    });
    expect(pedido!.formaPagamento).toBe('dividido');
    expect(pedido!.pagamentos).toEqual([
      { forma: 'pix', valorCentavos: total / 2, pessoa: 'Ana' },
      { forma: 'dinheiro', valorCentavos: total / 2, pessoa: 'Bia' },
    ]);
    const data = pedido!.dataOperacional;
    const antes = await resumoCaixa(db, data);
    // cancelar 1 batata: metade sai de cada forma
    await cancelarItem(db, admin, pedido!.id, pedido!.itens[0].id, 1, 'cliente desistiu');
    const depois = await resumoCaixa(db, data);
    expect(antes.sistema.pix - depois.sistema.pix).toBe(batata.precoCentavos / 2);
    expect(antes.sistema.dinheiro - depois.sistema.dinheiro).toBe(batata.precoCentavos / 2);
    expect(depois.divididos).toBeGreaterThanOrEqual(1);
    // fechamento: dinheiro contado com R$ 5,00 a menos
    await expect(fecharCaixa(db, garcom, data, { conferido: { dinheiro: 1 } })).rejects.toThrow(/Seu perfil/);
    const f = await fecharCaixa(db, admin, data, { trocoInicialCentavos: 10000, conferido: { dinheiro: 10000 + depois.sistema.dinheiro - 500, pix: depois.sistema.pix } });
    expect(f.linhas.find((l) => l.forma === 'dinheiro')!.diferenca).toBe(-500);
    expect(f.linhas.find((l) => l.forma === 'pix')!.diferenca).toBe(0);
    expect((await resumoCaixa(db, data)).fechamento).toMatchObject({ trocoInicialCentavos: 10000, fechadoPor: 'Dona' });
  });

  it('caixa do turno: abertura, suprimento e sangria entram no dinheiro esperado; caixa e estoquista com permissões próprias', async () => {
    const data = '2031-01-10';
    const caixa = { id: admin.id, nome: 'Caixa', usuario: 'cx', papel: 'caixa' } as Usuario;
    const estoquista = { ...caixa, papel: 'estoquista' } as Usuario;
    await expect(movimentarCaixa(db, estoquista, data, { tipo: 'abertura', valorCentavos: 10000 })).rejects.toThrow(/perfil/);
    await expect(movimentarCaixa(db, caixa, data, { tipo: 'sangria', valorCentavos: 100, motivo: 'banco' })).rejects.toThrow(/Abra o caixa/);
    await movimentarCaixa(db, caixa, data, { tipo: 'abertura', valorCentavos: 10000 });
    await expect(movimentarCaixa(db, caixa, data, { tipo: 'abertura', valorCentavos: 5000 })).rejects.toThrow(/já foi aberto/);
    await movimentarCaixa(db, caixa, data, { tipo: 'suprimento', valorCentavos: 5000 });
    await expect(movimentarCaixa(db, caixa, data, { tipo: 'sangria', valorCentavos: 3000 })).rejects.toThrow(/motivo/);
    await expect(movimentarCaixa(db, caixa, data, { tipo: 'sangria', valorCentavos: 999999, motivo: 'banco' })).rejects.toThrow(/maior/);
    await movimentarCaixa(db, caixa, data, { tipo: 'sangria', valorCentavos: 3000, motivo: 'depósito' });
    const r = await resumoCaixa(db, data);
    expect(r).toMatchObject({ aberto: true, fundoCentavos: 12000 });
    const f = await fecharCaixa(db, caixa, data, { trocoInicialCentavos: 1, conferido: { dinheiro: 12000 } });
    expect(f.linhas.find((l) => l.forma === 'dinheiro')).toMatchObject({ esperado: 12000, diferenca: 0 });
    await expect(alterarEstoque(db, caixa, randomUUID(), 'entrada', 1)).rejects.toThrow(/perfil/);
  });

  it('estorno: fica pendente até alguém confirmar que devolveu na maquininha', async () => {
    const lata = (await listarProdutos(db)).find((p) => p.nome === 'Cerveja lata 350 ml')!;
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, formaPagamento: 'credito', itens: [{ produtoId: lata.id, quantidade: 1 }] });
    await mudarStatus(db, bar, pedido!.preparos.find((x) => x.setor === 'bar')!.id, 'preparando');
    const gerente = { ...admin, papel: 'gerente' } as Usuario;
    expect((await encerrar(db, gerente, pedido!.id, 'Cobrado errado')).tipo).toBe('estornado');
    expect((await estornosPendentes(db)).some((e) => e.id === pedido!.id)).toBe(true);
    await expect(conferirEstorno(db, garcom, pedido!.id)).rejects.toThrow(/perfil/);
    expect(await conferirEstorno(db, gerente, pedido!.id)).toEqual({ ok: true, jaConferido: false });
    expect((await estornosPendentes(db)).some((e) => e.id === pedido!.id)).toBe(false);
    expect(await conferirEstorno(db, gerente, pedido!.id)).toEqual({ ok: true, jaConferido: true });
  });

  it('taxa de serviço desligada: a prévia não sugere os 10% e o pedido sai só com os itens', async () => {
    const batata = (await listarProdutos(db)).find((p) => p.setor === 'cozinha')!;
    const itens = [{ produtoId: batata.id, quantidade: 2 }];
    const pv = await previa(db, { mesaId: mesa, itens });
    expect(pv.taxaServicoCentavos).toBe(0);
    const { pedido } = await confirmarPagamento(db, garcom, { chave: randomUUID(), mesaId: mesa, itens, formaPagamento: 'credito', taxaServico: true });
    expect(pedido!).toMatchObject({ totalCentavos: pv.totalCentavos, taxaServicoCentavos: 0 });
  });

  it('custo do produto: só o administrador vê na lista completa', async () => {
    const p = await criarProduto(db, admin, { nome: 'Porção de queijo', categoria: 'Petiscos', setor: 'cozinha', precoCentavos: 3000, custoCentavos: 1200 });
    expect(p.custoCentavos).toBe(1200);
    expect((await listarProdutos(db, true)).find((x) => x.id === p.id)).toMatchObject({ custoCentavos: 1200 });
    expect((await listarProdutos(db)).find((x) => x.id === p.id)).not.toHaveProperty('custoCentavos');
    await expect(atualizarProduto(db, admin, p.id, { custoCentavos: -5 })).rejects.toThrow(/custo/);
    expect((await atualizarProduto(db, admin, p.id, { custoCentavos: null })).custoCentavos).toBeNull();
    await excluirProduto(db, admin, p.id);
  });

  it('excluir do cardápio: nunca vendido apaga; já vendido some das listas e o histórico continua', async () => {
    const novo = await criarProduto(db, admin, { nome: 'Pastel', categoria: 'Petiscos', setor: 'cozinha', precoCentavos: 1500 });
    expect(await excluirProduto(db, admin, novo.id)).toEqual({ apagado: true });
    expect((await listarProdutos(db, true)).some((p) => p.id === novo.id)).toBe(false);
    const vendidoAntes = (await listarPedidos(db, {})).find((p) => p.itens.some((i) => i.nome === 'Batata frita'))!;
    expect(await excluirProduto(db, admin, batata.id)).toEqual({ apagado: false });
    expect((await listarProdutos(db, true)).some((p) => p.id === batata.id)).toBe(false);
    expect((await listarProdutos(db)).some((p) => p.id === batata.id)).toBe(false);
    await expect(previa(db, { mesaId: mesa, itens: [{ produtoId: batata.id, quantidade: 1 }] })).rejects.toThrow(/indisponível/);
    const depois = await detalhePedido(db, vendidoAntes.id);
    expect(depois!.itens.some((i) => i.nome === 'Batata frita')).toBe(true);
    await expect(excluirProduto(db, admin, batata.id)).rejects.toThrow(/não encontrado/);
  });
});
