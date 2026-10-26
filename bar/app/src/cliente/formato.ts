export { reais } from '@/domain/dinheiro';

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const hora = (d: string | Date | null | undefined) => (d ? fmtHora.format(new Date(d)) : '—');
export const dataHora = (d: string | Date | null | undefined) => (d ? fmtDataHora.format(new Date(d)) : '—');
export const dataBr = (s: string) => s.split('-').reverse().join('/');

export function minutosDesde(d: string | Date, agora = Date.now()) {
  return Math.max(0, Math.floor((agora - new Date(d).getTime()) / 60000));
}

export function decorrido(d: string | Date, agora = Date.now()) {
  const m = minutosDesde(d, agora);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h ${m % 60} min`;
}
