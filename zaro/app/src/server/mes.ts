// Mês escolhido no topo (vale para a sessão do navegador, como a empresa ativa).
import 'server-only';
import { cookies } from 'next/headers';

export const COOKIE_MES = 'zaro_mes';

/** "AAAA-MM" escolhido no topo, ou null para todos os meses. */
export async function mesAtivo(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE_MES)?.value || '';
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export async function escolherMes(mes: string | null) {
  const c = await cookies();
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) c.set(COOKIE_MES, mes, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 864e2 });
  else c.delete(COOKIE_MES);
}

/** Opções do seletor: 6 meses à frente até 24 meses atrás. */
export function opcoesMes(hoje: string) {
  const [a, m] = hoje.slice(0, 7).split('-').map(Number);
  return Array.from({ length: 31 }, (_, i) => new Date(Date.UTC(a, m - 1 + 6 - i, 1)).toISOString().slice(0, 7));
}
