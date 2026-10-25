// Indicadores de endividamento. Sem base (EBITDA ou faturamento zero), o indicador fica nulo e a tela explica.
import { arred } from './dinheiro';

export interface BaseEndividamento {
  /** empréstimos e financiamentos em aberto + dívida ativa + parcelamentos (dívida que custa juros) */
  onerosa: number;
  /** onerosa + fornecedores e tributos vencidos */
  total: number;
  /** parte que vence em até 12 meses (inclui o que já venceu) */
  curtoPrazo: number;
  ebitda12: number;
  faturamento12: number;
  juros12: number;
  /** parcelas de empréstimo previstas para os próximos 12 meses */
  servico12: number;
}

export type Nivel = 'Saudável' | 'Atenção' | 'Crítico' | 'Sem dados';

export function indicadoresDivida(b: BaseEndividamento) {
  const dividaEbitda = b.ebitda12 > 0 ? arred(b.onerosa / b.ebitda12) : null;
  const coberturaJuros = b.juros12 > 0 ? arred(b.ebitda12 / b.juros12) : null;
  const dividaFaturamento = b.faturamento12 > 0 ? arred((b.onerosa / b.faturamento12) * 100) : null;
  const curtoPct = b.total > 0 ? arred((b.curtoPrazo / b.total) * 100) : null;
  const comprometimento = b.faturamento12 > 0 ? arred((b.servico12 / b.faturamento12) * 100) : null;
  const motivos: string[] = [];
  let nivel = 'Saudável' as Nivel;
  const sobe = (n: Nivel, m: string) => {
    motivos.push(m);
    if (n === 'Crítico' || nivel === 'Saudável') nivel = n;
  };
  if (!b.total && !b.faturamento12) nivel = 'Sem dados';
  else {
    if (b.onerosa > 0 && b.ebitda12 <= 0) sobe('Crítico', 'EBITDA dos últimos 12 meses zero ou negativo com dívida em aberto');
    if (dividaEbitda != null && dividaEbitda > 4) sobe('Crítico', `dívida/EBITDA de ${dividaEbitda}x (acima de 4x)`);
    else if (dividaEbitda != null && dividaEbitda > 2.5) sobe('Atenção', `dívida/EBITDA de ${dividaEbitda}x (acima de 2,5x)`);
    if (coberturaJuros != null && coberturaJuros < 1.5) sobe('Crítico', `EBITDA cobre só ${coberturaJuros}x os juros`);
    else if (coberturaJuros != null && coberturaJuros < 3) sobe('Atenção', `cobertura de juros de ${coberturaJuros}x (abaixo de 3x)`);
    if (curtoPct != null && curtoPct > 60) sobe('Atenção', `${curtoPct}% da dívida vence em até 12 meses`);
    if (comprometimento != null && comprometimento > 15) sobe('Atenção', `parcelas consomem ${comprometimento}% do faturamento`);
  }
  return { dividaEbitda, coberturaJuros, dividaFaturamento, curtoPct, comprometimento, nivel, motivos };
}

/** Custo médio ponderado (% ao mês) pelos valores dos contratos que têm taxa informada. */
export function custoMedio(contratos: { valor: number; taxa: number | null }[]) {
  const com = contratos.filter((c) => c.taxa != null && c.valor > 0);
  const base = com.reduce((a, c) => a + c.valor, 0);
  return base ? arred(com.reduce((a, c) => a + c.valor * (c.taxa as number), 0) / base) : null;
}

/** Dívida ativa negociada (parcelamento, SISPAR, transação) é exigível em parcelas: longo prazo. A ajuizada ou em cobrança é curto prazo. */
export const pgfnParcelada = (situacao: string | null | undefined) => /negociad|parcel|sispar|transa[cç]/i.test(situacao || '');
