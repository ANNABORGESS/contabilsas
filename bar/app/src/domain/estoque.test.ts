import { describe, expect, it } from 'vitest';
import { faltaNoEstoque, quantidadeEstoque, situacaoEstoque } from './estoque';

describe('estoque', () => {
  it('situação: sem controle, esgotado, baixo e ok', () => {
    expect(situacaoEstoque(null)).toBe('sem-controle');
    expect(situacaoEstoque(0)).toBe('esgotado');
    expect(situacaoEstoque(-2)).toBe('esgotado');
    expect(situacaoEstoque(24)).toBe('baixo');
    expect(situacaoEstoque(215)).toBe('ok');
  });
  it('soma o mesmo produto em várias linhas (balde e solto) antes de conferir', () => {
    const est = new Map<string, number | null>([['heineken', 12], ['chopp', null], ['corona', 0]]);
    expect(faltaNoEstoque([{ produtoId: 'heineken', nome: 'Heineken', quantidade: 10 }, { produtoId: 'chopp', nome: 'Chopp', quantidade: 50 }], est)).toBeNull();
    expect(faltaNoEstoque([{ produtoId: 'heineken', nome: 'Heineken', quantidade: 10 }, { produtoId: 'heineken', nome: 'Heineken', quantidade: 3 }], est)).toBe('Só restam 12 de Heineken no estoque.');
    expect(faltaNoEstoque([{ produtoId: 'corona', nome: 'Corona', quantidade: 1 }], est)).toBe('Corona está esgotado.');
  });
  it('quantidade válida para entrada e ajuste', () => {
    expect(quantidadeEstoque('215')).toBe(215);
    expect(quantidadeEstoque(0)).toBe(0);
    expect(quantidadeEstoque(0, 1)).toBeNull();
    expect(quantidadeEstoque(-1)).toBeNull();
    expect(quantidadeEstoque(2.5)).toBeNull();
  });
});
