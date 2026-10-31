import { describe, expect, it } from 'vitest';
import { filtrarMesas } from './mesas';

const mesas = Array.from({ length: 200 }, (_, i) => ({ numero: i + 1, nome: i === 4 ? 'Varanda' : null, clientes: i === 11 ? ['João Gonçalves'] : [], pedidos: i % 3 === 0 ? 1 : 0 }));

describe('busca de mesa', () => {
  it('pelo número: a mesa exata primeiro, depois as que começam com ele; zero à esquerda não atrapalha', () => {
    expect(filtrarMesas(mesas, '7').map((m) => m.numero)).toEqual([7, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79]);
    expect(filtrarMesas(mesas, '07')[0].numero).toBe(7);
    expect(filtrarMesas(mesas, '200').map((m) => m.numero)).toEqual([200]);
    expect(filtrarMesas(mesas, '201')).toEqual([]);
  });
  it('pelo apelido ou pelo nome do cliente, sem acento', () => {
    expect(filtrarMesas(mesas, 'varan').map((m) => m.numero)).toEqual([5]);
    expect(filtrarMesas(mesas, 'goncalves').map((m) => m.numero)).toEqual([12]);
  });
  it('aberta é a mesa com pedido ainda na cozinha ou no bar', () => {
    const ms = [{ numero: 1, pedidos: 2, abertos: 0 }, { numero: 2, pedidos: 1, abertos: 1 }];
    expect(filtrarMesas(ms, '', 'com-pedido').map((m) => m.numero)).toEqual([2]);
    expect(filtrarMesas(ms, '', 'livres').map((m) => m.numero)).toEqual([1]);
  });
  it('filtra mesas com pedido e livres', () => {
    expect(filtrarMesas(mesas, '', 'com-pedido').every((m) => m.pedidos)).toBe(true);
    expect(filtrarMesas(mesas, '', 'livres').every((m) => !m.pedidos)).toBe(true);
    expect(filtrarMesas(mesas, '', 'todas')).toHaveLength(200);
  });
});
