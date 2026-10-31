// Cancelamento e estorno sempre com autorização do administrador e motivo registrado.
// Cancelamento: nada foi preparado ainda. Estorno: já houve preparo ou entrega.
// Nos dois casos o valor deve ser devolvido na maquininha pelo procedimento da adquirente.

import type { StatusPreparo } from './preparo';

export type TipoEncerramento = 'cancelado' | 'estornado';

export const NOME_ENCERRAMENTO: Record<TipoEncerramento, string> = { cancelado: 'Cancelamento', estornado: 'Estorno' };

export const MOTIVO_MINIMO = 5;

export class ErroCancelamento extends Error {}

export function tipoEncerramento(statusPreparos: StatusPreparo[]): TipoEncerramento {
  return statusPreparos.every((s) => s === 'novo' || s === 'cancelado') ? 'cancelado' : 'estornado';
}

export function validarMotivo(motivo: unknown): string {
  const m = typeof motivo === 'string' ? motivo.trim() : '';
  if (m.length < MOTIVO_MINIMO) throw new ErroCancelamento('Descreva o motivo (pelo menos 5 letras).');
  if (m.length > 500) throw new ErroCancelamento('Motivo muito longo (até 500 letras).');
  return m;
}

/** Só o administrador encerra; o pedido precisa estar pago (não encerrado antes). */
export function conferirEncerramento(papel: string, statusPedido: string) {
  if (papel !== 'admin') throw new ErroCancelamento('Cancelamentos e estornos precisam de autorização do administrador.');
  if (statusPedido !== 'pago') throw new ErroCancelamento('Este pedido já foi cancelado ou estornado.');
}

/** Cancelar parte do pedido: o administrador escolhe o item e quantas unidades (das que ainda valem). */
export function conferirCancelamentoItem(papel: string, statusPedido: string, quantidade: unknown, restante: number): number {
  conferirEncerramento(papel, statusPedido);
  const q = Number(quantidade);
  if (restante <= 0) throw new ErroCancelamento('Este item já foi todo cancelado.');
  if (!Number.isInteger(q) || q < 1 || q > restante) throw new ErroCancelamento(`Escolha de 1 a ${restante} para cancelar.`);
  return q;
}

/** O que sobra valendo de um pedido depois dos itens cancelados um a um. */
export function valorRestante(p: { totalCentavos: number; itensCanceladosCentavos?: number }) {
  return p.totalCentavos - (p.itensCanceladosCentavos || 0);
}
