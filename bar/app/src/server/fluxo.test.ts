// Fluxo completo contra um PostgreSQL de verdade (PGlite em memória).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirPglite, schema, type Db } from '@/db';
import type { Usuario } from './auth';
import { criarFuncionario, listarMesas, listarProdutos, primeiroAcesso, atualizarProduto } from './cadastros';
import { encerrar, recusar, solicitar, listarSolicitacoes } from './cancelamentos';
import { confirmarPagamento, detalhePedido, listarPedidos, previa } from './pedidos';
import { mudarStatus, painelSetor, prontosParaEntrega } from './preparo';
import { relatorio, mesasDoTurno } from './relatorios';
import { versaoAtual } from './eventos';
import { custosELucro, excluirDespesa, lancarDespesa } from './financeiro';

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
  mesa = (await listarMesas(db))[2].id;
  const prods = await listarProdutos(db);
  batata = prods.find((p) => p.nome === 'Batata frita')!;
  chopp = prods.find((p) => p.nome === 'Chopp 300 ml')!;
});

const pedidoBase = () => ({
  chave: randomUUID(),
  mesaId: mesa,
  itens: [{ produtoId: batata.id, quantidade: 1 }, { produtoId: chopp.id, quantidade: 2 }],
  formaPagamento: 'credito',
});

describe('fluxo do pedido pago', () => {
  it('primeiro acesso cria administrador, mesas e cardápio', async () => {
    expect(await listarMesas(db)).toHaveLength(5);
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
    expect(coz.preparos[0].itens).toEqual([{ nome: 'Batata frita', quantidade: 1 }]);
    expect(br.preparos[0].itens).toEqual([{ nome: 'Chopp 300 ml', quantidade: 2 }]);
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
    const turno = await mesasDoTurno(db, lista[0].dataOperacional);
    expect(turno.find((m) => m.id === mesa)!.pedidos).toBe(lista.length);
    expect(turno.find((m) => m.id === mesa)!.clientes).toEqual(['Mariana Souza']);
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
    await lancarDespesa(db, admin, { data, categoria: 'funcionarios', descricao: 'Diária da Ana', valorCentavos: 8000, funcionarioId: garcom.id });
    const beb = await lancarDespesa(db, admin, { data, categoria: 'bebidas', descricao: 'Caixas de chopp', valorCentavos: 5000 });
    await expect(lancarDespesa(db, admin, { data, categoria: 'bebidas', descricao: '', valorCentavos: 100 })).rejects.toThrow(/Descreva/);
    let r = await custosELucro(db, data, data);
    expect(r.resumo.vendasCentavos).toBe(liquido);
    expect(r.resumo.despesasCentavos).toBe(13000);
    expect(r.resumo.lucroCentavos).toBe(liquido - 13000);
    expect(r.despesas.find((d) => d.categoria === 'funcionarios')!.funcionario).toBe('Ana');
    expect(r.vendasPorSetor.cozinha + r.vendasPorSetor.bar).toBe(liquido);
    await excluirDespesa(db, admin, beb.id);
    r = await custosELucro(db, data, data);
    expect(r.resumo.despesasCentavos).toBe(8000);
  });
});
