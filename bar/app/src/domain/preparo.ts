// Fluxo de preparo de cada setor: novo → preparando → pronto → entregue.
// Cozinha e bar avançam até "pronto"; o garçom marca "entregue". Cancelado é só por autorização.

import type { Setor } from './pedido';

export const STATUS_PREPARO = ['novo', 'preparando', 'pronto', 'entregue', 'cancelado'] as const;
export type StatusPreparo = (typeof STATUS_PREPARO)[number];

export const NOME_STATUS: Record<StatusPreparo, string> = {
  novo: 'Novo',
  preparando: 'Em preparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const SEGUINTE: Partial<Record<StatusPreparo, StatusPreparo>> = { novo: 'preparando', preparando: 'pronto', pronto: 'entregue' };

export function ehStatusPreparo(s: unknown): s is StatusPreparo {
  return typeof s === 'string' && (STATUS_PREPARO as readonly string[]).includes(s);
}

export function proximoStatus(s: StatusPreparo): StatusPreparo | null {
  return SEGUINTE[s] ?? null;
}

/**
 * Quem pode levar um preparo de um status a outro. Avança um passo por vez; a equipe do setor
 * pode voltar um passo (toque errado) enquanto o item não foi entregue.
 */
export function podeMudarStatus(de: StatusPreparo, para: StatusPreparo, papel: string, setor: Setor): boolean {
  if (de === para || de === 'cancelado' || de === 'entregue' || para === 'cancelado') return false;
  const doSetor = papel === 'admin' || papel === setor;
  const avanco = SEGUINTE[de] === para;
  const volta = SEGUINTE[para] === de;
  if (para === 'entregue') return avanco && (papel === 'garcom' || papel === 'admin');
  return doSetor && (avanco || volta);
}

export interface PreparoResumo {
  setor: Setor;
  status: StatusPreparo;
}

export type SituacaoPedido = 'aguardando' | 'em_preparo' | 'parcial' | 'pronto' | 'entregue' | 'cancelado';

export const NOME_SITUACAO: Record<SituacaoPedido, string> = {
  aguardando: 'Aguardando preparo',
  em_preparo: 'Em preparo',
  parcial: 'Parte pronta',
  pronto: 'Pronto para entregar',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

/** Situação do pedido inteiro a partir dos preparos dos setores. */
export function situacaoPedido(preparos: PreparoResumo[]): SituacaoPedido {
  const ativos = preparos.filter((p) => p.status !== 'cancelado');
  if (ativos.length === 0) return 'cancelado';
  if (ativos.every((p) => p.status === 'entregue')) return 'entregue';
  if (ativos.every((p) => p.status === 'pronto' || p.status === 'entregue')) return 'pronto';
  if (ativos.some((p) => p.status === 'pronto' || p.status === 'entregue')) return 'parcial';
  if (ativos.some((p) => p.status === 'preparando')) return 'em_preparo';
  return 'aguardando';
}
