import { describe, expect, it } from 'vitest';
import { conferirCaixa, dividirIgual, formaDoPedido, nomeForma, somarPorForma, validarPartes, valendoPorForma } from './pagamento';

describe('divisão de conta', () => {
  it('divide igual e os centavos que sobram vão para as primeiras partes', () => {
    expect(dividirIgual(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirIgual(5000, 2)).toEqual([2500, 2500]);
  });
  it('as partes precisam fechar o total, com formas válidas', () => {
    expect(validarPartes([{ forma: 'pix', valorCentavos: 6000, pessoa: ' Ana ' }, { forma: 'credito', valorCentavos: 4000 }], 10000)).toEqual([
      { forma: 'pix', valorCentavos: 6000, pessoa: 'Ana' },
      { forma: 'credito', valorCentavos: 4000, pessoa: null },
    ]);
    expect(() => validarPartes([{ forma: 'pix', valorCentavos: 6000 }], 10000)).toThrow(/falta/);
    expect(() => validarPartes([{ forma: 'pix', valorCentavos: 11000 }], 10000)).toThrow(/passam/);
    expect(() => validarPartes([{ forma: 'fiado', valorCentavos: 10000 }], 10000)).toThrow(/forma/);
    expect(formaDoPedido([{ forma: 'pix' }])).toBe('pix');
    expect(formaDoPedido([{ forma: 'pix' }, { forma: 'credito' }])).toBe('dividido');
    expect(nomeForma('dividido')).toBe('Dividido');
    expect(nomeForma('debito')).toBe('Débito');
  });
  it('item cancelado reparte o que ficou valendo entre as formas, sem perder centavo', () => {
    const v = valendoPorForma([{ forma: 'pix', valorCentavos: 6000 }, { forma: 'credito', valorCentavos: 4000 }], 10000, 7001);
    expect(v).toEqual([{ forma: 'pix', valorCentavos: 4201 }, { forma: 'credito', valorCentavos: 2800 }]);
    expect(v.reduce((a, x) => a + x.valorCentavos, 0)).toBe(7001);
  });
});

describe('fechamento de caixa', () => {
  it('dinheiro esperado soma o troco; diferença mostra o que sobrou ou faltou', () => {
    const sistema = somarPorForma([{ forma: 'dinheiro', valorCentavos: 5000 }, { forma: 'pix', valorCentavos: 3000 }, { forma: 'pix', valorCentavos: 2000 }]);
    const r = conferirCaixa(sistema, { dinheiro: 14500, pix: 5000 }, 10000);
    expect(r.linhas.find((l) => l.forma === 'dinheiro')).toMatchObject({ sistema: 5000, esperado: 15000, conferido: 14500, diferenca: -500 });
    expect(r.linhas.find((l) => l.forma === 'pix')).toMatchObject({ esperado: 5000, diferenca: 0 });
    expect(r.linhas.find((l) => l.forma === 'credito')).toMatchObject({ conferido: null, diferenca: null });
    expect(r.diferencaTotal).toBe(-500);
  });
});
