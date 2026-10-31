// Busca de mesa: com muitas mesas (até 200), o garçom e o administrador digitam o número,
// o apelido ou o nome do cliente para achar a mesa.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type FiltroMesa = 'todas' | 'com-pedido' | 'livres';

/**
 * Número: "7" acha a mesa 7 primeiro e depois as que começam com 7 (70, 71...); "07" vale como "7".
 * Texto: procura no apelido da mesa e nos nomes dos clientes do turno, sem diferenciar acentos.
 */
export function filtrarMesas<T extends { numero: number; nome?: string | null; clientes?: string[]; pedidos?: number }>(mesas: T[], busca: string, filtro: FiltroMesa = 'todas'): T[] {
  const porSituacao = mesas.filter((m) => (filtro === 'com-pedido' ? (m.pedidos || 0) > 0 : filtro === 'livres' ? !m.pedidos : true));
  const b = busca.trim();
  if (!b) return porSituacao;
  if (/^\d+$/.test(b)) {
    const n = String(Number(b));
    const achadas = porSituacao.filter((m) => String(m.numero).startsWith(n));
    return achadas.sort((x, y) => (x.numero === Number(n) ? -1 : y.numero === Number(n) ? 1 : x.numero - y.numero));
  }
  const t = semAcento(b);
  return porSituacao.filter((m) => semAcento(m.nome || '').includes(t) || (m.clientes || []).some((c) => semAcento(c).includes(t)));
}

/** O balcão é o "lugar" de número 0: pedido de quem não está sentado em mesa. */
export const BALCAO = 0;

/** "Balcão" ou "Mesa 12". */
export function nomeLocal(numero: number) {
  return numero === BALCAO ? 'Balcão' : `Mesa ${numero}`;
}
