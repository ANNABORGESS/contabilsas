import { describe, expect, it } from 'vitest';
import { entraPor, liberado, pode, tem } from './papeis';

describe('funções e permissões', () => {
  it('administrador pode tudo', () => {
    expect(tem('admin', 'equipe')).toBe(true);
    expect(pode('admin', 'cozinha')).toBe(true);
  });
  it('gerente opera e autoriza, mas não mexe em funcionários nem custos', () => {
    expect(tem('gerente', 'autorizar')).toBe(true);
    expect(tem('gerente', 'equipe')).toBe(false);
    expect(tem('gerente', 'financeiro')).toBe(false);
    expect(pode('gerente', 'garcom')).toBe(true);
  });
  it('caixa lança, cobra e fecha o caixa, sem autorizar estorno', () => {
    expect(pode('caixa', 'garcom')).toBe(true);
    expect(tem('caixa', 'fechamento')).toBe(true);
    expect(tem('caixa', 'autorizar')).toBe(false);
    expect(liberado('caixa', ['estoque'])).toBe(false);
  });
  it('estoquista só o estoque', () => {
    expect(liberado('estoquista', ['estoque'])).toBe(true);
    expect(liberado('estoquista', ['garcom'])).toBe(false);
    expect(liberado('estoquista', ['mesas'])).toBe(false);
  });
  it('gestão entra pelo link do administrador; garçom não', () => {
    expect(entraPor('caixa', 'admin')).toBe(true);
    expect(entraPor('garcom', 'admin')).toBe(false);
    expect(entraPor('garcom', 'garcom')).toBe(true);
  });
});
