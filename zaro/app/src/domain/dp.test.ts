import { describe, expect, it } from 'vitest';
import { conferirHolerite, conferirPrazos, inssSegurado, irrfMensal, lerHolerites, lerRetornoEsocial, mascararCpf, resumoItens, statusObrigacao, tabelaDe } from './dp';

// Holerite fictício no formato do "Demonstrativo de Pagamento" exportado pelo sistema de folha (dados inventados).
const RECIBO = (nome: string, cpf: string, verbas: string, liquido: string, base: string, inssBase: string, fgtsBase: string, fgts: string, irBase: string, faixa: string, tv: string, td: string) => `EMPRESA TESTE LTDA
00.000.000/0001-00
Demonstrativo de Pagamento
Depto.:
000099 - ${nome}
${cpf}\t000001 - PRODUÇÃO
Func.: Período:
CPF:
Cargo:
09/2026
Referência Vencimentos Descontos
Matrícula: CTPS:\t0002 - OPERADOR 00003-0001 0000000 / 00000
Admissão: 02/01/2020
Verbas
${verbas}
Valor Líquido ${liquido}
Recebi o valor líquido descrito neste recibo em Assinatura:
Salário Base
${base}
Sal. Contr. INSS
${inssBase}
Base Cálc. FGTS
${fgtsBase}
FGTS do Mês
${fgts}
Base Cálc. IRRF
${irBase}
Faixa IRRF
${faixa}
Total: Total:\t${tv} ${td}
`;
const A = RECIBO('FULANO DE TESTE', '111.222.333-44', `0001 - Salário Contratual 30,00 5.250,00
0100 - Hora Extra 50% 25:39 918,15
0506 - Descanso Remunerado s/ Horas Extras 9,00 393,49
0510 - Arredondamento 0,27
1001 - Cesta Basica 130,00
0511 - Arredondamento Mês Anterior 0,06
0515 - Desconto Adiantamento Salário 2.625,00
0520 - Desconto INSS 14,00 720,13
0530 - Desconto IRRF 27,50 592,72`, '2.754,00', '5.250,00', '6.561,64', '6.561,64', '524,93', '5.841,51', '27,5%', '6.691,91', '3.937,91');
const B = RECIBO('BELTRANA TESTE', '555.666.777-88', `0001 - Salário Contratual 30,00 2.500,00
0100 - Hora Extra 50% 5:35 95,17
0506 - Descanso Remunerado s/ Horas Extras 9,00 40,79
0510 - Arredondamento 0,42
1001 - Cesta Basica 130,00
0093 - Vale Transporte 150,00
0511 - Arredondamento Mês Anterior 0,47
0515 - Desconto Adiantamento Salário 1.250,00
0520 - Desconto INSS 9,00 212,91`, '1.153,00', '2.500,00', '2.635,96', '2.635,96', '210,87', '2.028,76', '', '2.766,38', '1.613,38');

describe('DP — conferência da folha', () => {
  const t26 = tabelaDe('2026-09')!;

  it('tabelas 2026 reproduzem a folha do sistema externo (INSS, IRRF com redutor, desconto simplificado)', () => {
    expect(inssSegurado(6561.64, t26)).toBe(720.13);
    expect(inssSegurado(2635.96, t26)).toBe(212.91);
    expect(irrfMensal(6561.64, 720.13, t26)).toMatchObject({ base: 5841.51, ir: 592.72 });
    expect(irrfMensal(2635.96, 212.91, t26)).toMatchObject({ base: 2028.76, ir: 0, simplificado: true });
    expect(inssSegurado(20000, t26)).toBe(inssSegurado(8157.41, t26)); // teto
    expect(tabelaDe('2024-01')).toBeNull();
  });

  it('lê os holerites do texto do PDF, com rubricas, bases e totais', () => {
    const h = lerHolerites(A + '\n-- 1 of 2 --\n' + B);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ matricula: '99', nome: 'FULANO DE TESTE', cpf: '111.222.333-44', competencia: '2026-09', cargo: 'OPERADOR', admissao: '2020-01-02', liquido: 2754, baseInss: 6561.64, fgtsMes: 524.93, totalVencimentos: 6691.91, totalDescontos: 3937.91 });
    expect(h[0].verbas.find((v) => v.codigo === '0100')).toMatchObject({ referencia: '25:39', valor: 918.15, tipo: 'provento' });
    expect(h[1].verbas.find((v) => v.codigo === '0093')).toMatchObject({ tipo: 'desconto', valor: 150 });
    expect(mascararCpf(h[0].cpf)).toBe('***.222.333-**');
  });

  it('confere: tudo bate nos dois recibos; diferença de INSS vira divergente; salário fora do cadastro vira revisão', () => {
    const [a, b] = lerHolerites(A + B);
    for (const h of [a, b]) expect(resumoItens(conferirHolerite(h).itens)).toMatchObject({ divergentes: 0, revisao: 0, pendentes: 0 });
    const errado = { ...a, verbas: a.verbas.map((v) => (v.codigo === '0520' ? { ...v, valor: 700 } : v)), totalDescontos: 3917.78, liquido: 2774.13 };
    const c = conferirHolerite(errado).itens;
    expect(c.find((i) => i.item.startsWith('INSS'))).toMatchObject({ status: 'Divergente', diferenca: -20.13 });
    expect(conferirHolerite(a, { salarioCadastro: 5000 }).itens.find((i) => i.item.startsWith('Salário base'))?.status).toBe('Revisão Necessária');
    expect(conferirHolerite(b, { piso: 2600, pisoFonte: 'CCT 2026' }).itens.find((i) => i.item.startsWith('Piso'))?.status).toBe('Revisão Necessária');
    expect(conferirHolerite({ ...a, competencia: '2024-03' }).itens.some((i) => i.status === 'Pendente')).toBe(true);
  });

  it('IRRF menor que o calculado sem dependentes não é erro: pede revisão', () => {
    const [a] = lerHolerites(A);
    const menos = { ...a, verbas: a.verbas.map((v) => (v.codigo === '0530' ? { ...v, valor: 540.58 } : v)), totalDescontos: 3885.77, liquido: 2806.14 };
    expect(conferirHolerite(menos).itens.find((i) => i.item.startsWith('IRRF'))).toMatchObject({ status: 'Revisão Necessária' });
  });

  it('obrigação: guia não é pagamento; pago sem comprovante fica pendente de comprovação', () => {
    expect(statusObrigacao({ declarado: null, guia: null, pago: null, conciliado: false, comprovante: false })).toBe('Calculado');
    expect(statusObrigacao({ declarado: 100, guia: 100, pago: null, conciliado: false, comprovante: false })).toBe('Guia emitida');
    expect(statusObrigacao({ declarado: 100, guia: 100, pago: 100, conciliado: false, comprovante: false })).toBe('Pendente de comprovação');
    expect(statusObrigacao({ declarado: 100, guia: 100, pago: 100, conciliado: false, comprovante: true })).toBe('Pago');
    expect(statusObrigacao({ declarado: 100, guia: 100, pago: 100, conciliado: true, comprovante: true })).toBe('Conciliado');
  });

  it('prazos de férias, 13º e rescisão', () => {
    expect(conferirPrazos({ tipo: 'ferias', referencia: '2026-11-10', pagoEm: '2026-11-08' }).status).toBe('Conferido');
    expect(conferirPrazos({ tipo: 'ferias', referencia: '2026-11-10', pagoEm: '2026-11-09' }).status).toBe('Divergente');
    expect(conferirPrazos({ tipo: '13-2', referencia: '2026-12-01', pagoEm: '2026-12-21' }).status).toBe('Divergente');
    expect(conferirPrazos({ tipo: 'rescisao', referencia: '2026-10-01', pagoEm: '2026-10-12' }).status).toBe('Divergente');
  });

  it('lê o retorno do eSocial (aceito e rejeitado)', () => {
    const r = lerRetornoEsocial('<retornoProcessamentoLoteEventos><retornoEventos><evento Id="ID1"><retornoEvento><eSocial><retornoEvento Id="ID1"><recepcao><nrRecibo>1.1.000</nrRecibo></recepcao><processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta></processamento></retornoEvento></eSocial></retornoEvento></evento><evento Id="ID2"><processamento><cdResposta>401</cdResposta><descResposta>Lote com erro</descResposta><ocorrencias><ocorrencia><descricao>CPF inválido</descricao></ocorrencia></ocorrencias></processamento></evento></retornoEventos></retornoProcessamentoLoteEventos>');
    expect(r.map((x) => [x.id, x.situacao])).toEqual([['ID1', 'Aceito'], ['ID2', 'Rejeitado']]);
    expect(r[1].ocorrencias).toEqual(['CPF inválido']);
  });
});
