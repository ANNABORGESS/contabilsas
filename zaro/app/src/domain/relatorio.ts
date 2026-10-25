// Regras do Relatório Financeiro mensal (semanas do mês e agrupamento por situação).
import { addDias } from './dinheiro';
import { ultimoDia } from './painel';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

/** Semanas do relatório: 01–07, 08–14, 15–21 e 22 até o último dia do mês. */
export function semanasDoMes(mes: string) {
  const fim = ultimoDia(mes);
  return [1, 8, 15, 22].map((d, i) => {
    const de = `${mes}-${String(d).padStart(2, '0')}`;
    const ate = i < 3 ? addDias(de, 6) : fim;
    return { de, ate, rotulo: `${de.slice(8)}–${ate.slice(8)}/${CURTO[Number(mes.slice(5, 7)) - 1]}` };
  });
}

/** Grupo do título no relatório. Receber: vencidos, a vencer, recebidos. Pagar: vencidos, próximos 7 dias, restante, pagos. */
export function grupoDoTitulo(t: { tipo: 'pagar' | 'receber'; venc: string | null; saldo: number }, hoje: string) {
  if (t.saldo <= 0.004) return t.tipo === 'pagar' ? 'Pagos' : 'Recebidos';
  if (t.venc && t.venc < hoje) return 'Vencidos';
  if (t.tipo === 'receber') return 'A vencer';
  return t.venc && t.venc <= addDias(hoje, 7) ? 'Próximos 7 dias' : 'Restante do mês';
}

export const ORDEM_GRUPOS = { receber: ['Vencidos', 'A vencer', 'Recebidos'], pagar: ['Vencidos', 'Próximos 7 dias', 'Restante do mês', 'Pagos'] } as const;

const valorBr = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

/**
 * Principal e juros de uma parcela de empréstimo: usa o campo juros quando existe; senão lê a descrição
 * ("Juros 8%" = parcela só de juros; "principal R$ 10.000,00 + juros 4% R$ 400,00"). Sem informação, null.
 */
export function separarParcela(valor: number, juros: number | null, texto: string) {
  if (juros != null) return { principal: Math.round((valor - juros) * 100) / 100, juros };
  const m = texto.match(/principal\s*R\$\s*([\d.]+,\d{2}).*?juros[^R]*R\$\s*([\d.]+,\d{2})/i);
  if (m) return { principal: valorBr(m[1]), juros: valorBr(m[2]) };
  if (/^\s*juros\b/i.test(texto)) return { principal: 0, juros: valor };
  return { principal: null as number | null, juros: null as number | null };
}
