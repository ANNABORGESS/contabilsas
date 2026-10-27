import { describe, expect, it } from 'vitest';
import { balanceteModelo, linhaDoModelo, MODELO } from './balancete-modelo';
import { classificarDespesa, gerarLancamentos, tipoDeReceita, type TituloMotor } from './motor';

const venda: TituloMotor = {
  id: 'CR-1', tipo: 'receber', nome: 'UCB DA AMAZONIA', nf: '1234', competencia: '2026-02', emissao: '2026-02-10', venc: '2026-03-10', cfop: '5101',
  valor: 1000, status: 'Recebido', impostos: [{ nome: 'ICMS', valor: 180 }, { nome: 'PIS', valor: 6.5 }, { nome: 'COFINS', valor: 30 }, { nome: 'IPI', valor: 0 }],
  baixas: [{ data: '2026-03-10', valor: 1000 }],
};
const servico: TituloMotor = { id: 'CR-2', tipo: 'receber', nome: 'Cliente X', nf: '25', categoria: 'Serviço prestado', contaContabil: '3.1.1.02', competencia: '2026-03', valor: 500, status: 'A receber', impostos: [{ nome: 'ISS', valor: 25 }] };
const compra: TituloMotor = { id: 'CP-1', tipo: 'pagar', nome: 'Amazonas Energia', categoria: 'Energia', competencia: '2026-01', valor: 300, status: 'A pagar' };
const L = gerarLancamentos({ titulos: [venda, servico, compra] });
const linha = (b: ReturnType<typeof balanceteModelo>, c: string) => b.linhas.find((l) => l.codigo === c)!;

describe('balancete no modelo do escritório', () => {
  const b = balanceteModelo(L, { de: '2026-01', ate: '2026-09' }, true);
  it('tem todas as linhas do modelo e fecha', () => {
    expect(b.linhas).toHaveLength(MODELO.length);
    expect(b.totalDebitos).toBe(b.totalCreditos);
    expect(b.totalDevedor).toBe(b.totalCredor);
  });
  it('receita pelo CFOP ou pelo tipo de nota', () => {
    expect(linha(b, '3.1.03').final).toBe(-1000); // 5101: produção própria
    expect(linha(b, '3.1.01').final).toBe(-500); // NFS-e
    expect(tipoDeReceita({ cfop: '5102' })).toBe('mercadoria');
    expect(tipoDeReceita({ cfop: '5949' })).toBe('outra');
  });
  it('separa os tributos da NF em dedução e obrigação próprias', () => {
    expect(linha(b, '3.2.06').final).toBe(180);
    expect(linha(b, '2.1.12').final).toBe(-180);
    expect(linha(b, '3.2.03').final).toBe(6.5);
    expect(linha(b, '2.1.08').final).toBe(-30);
    expect(linha(b, '3.2.05').final).toBe(25);
    expect(linha(b, '2.1.11').final).toBe(-25);
    expect(linha(b, '3.2').final).toBe(241.5);
  });
  it('grupos somam as linhas e o resumo separa devedor e credor', () => {
    expect(linha(b, '1.1.02').final).toBe(1000);
    expect(linha(b, '1.1.04').final).toBe(500);
    expect(linha(b, '1').final).toBe(1500);
    expect(linha(b, '4.3.02').final).toBe(300);
    expect(b.resumo.find((r) => r.grupo === 'Ativo')!.saldo).toBe(1500);
  });
  it('de-para das contas do ZARO', () => {
    expect(linhaDoModelo('2.1.1.01')).toBe('2.1.01');
    expect(linhaDoModelo('1.2.3.91')).toBe('1.2.08');
    expect(linhaDoModelo('4.1.1.01')).toBe('4.1.04');
    expect(linhaDoModelo('4.2.1.03')).toBe('3.3.01');
    expect(linhaDoModelo('2.1.4.01', { hist: 'Provisão DARF COFINS 09/2026' })).toBe('2.1.08');
  });
});

describe('classificação de compra não confunde com guia de tributo', () => {
  it('"das" no nome e substituição tributária na natureza', () => {
    expect(classificarDespesa({ id: 'a', tipo: 'pagar', nome: 'L J GUERRA E CIA LTDA (Casa das Correias)', categoria: 'Compra de mercadorias', descricao: 'NF 877803/2 · Venda de mercadoria', valor: 1, status: 'A pagar' }).conta).toBe('4.1.1.01');
    expect(classificarDespesa({ id: 'b', tipo: 'pagar', nome: 'SÃO JOAQUIM MATERIAIS', categoria: 'Material de construção', descricao: 'NF 143697/1 · Venda subst. tributária', valor: 1, status: 'A pagar' }).conta).toBe('4.1.1.01');
    expect(classificarDespesa({ id: 'c', tipo: 'pagar', nome: 'Receita Federal', categoria: 'DAS Simples 09/2026', valor: 1, status: 'A pagar' }).conta).toBe('2.1.4.01');
    expect(classificarDespesa({ id: 'd', tipo: 'pagar', nome: 'SEFAZ-AM', categoria: 'Impostos e taxas', valor: 1, status: 'A pagar' }).conta).toBe('2.1.4.01');
  });
});

describe('imobilizado antigo e resultado de anos anteriores', () => {
  const maq = { id: 'M1', descricao: 'Fresadora ferramenteira', qtd: 1, valor: 12000, data: '2003-01-01', taxa: 10, residual: 0, origem: 'abertura', nf: null };
  const L2 = gerarLancamentos({ titulos: [], imobilizado: [maq], hoje: '2026-09' } as never);
  it('saldo anterior fecha: depreciação de anos anteriores vai para lucros acumulados', () => {
    const b = balanceteModelo(L2, { de: '2026-01', ate: '2026-09' }, true);
    const v = (c: string) => b.linhas.find((l) => l.codigo === c)!;
    expect(v('1.2.03').anterior).toBe(12000);
    expect(v('1.2.08').anterior).toBe(-12000);
    expect(v('2.3.01').anterior).toBe(-12000);
    expect(v('2.3.05').anterior).toBe(12000); // prejuízo acumulado (depreciação até 2012)
    expect(v('4').final).toBe(0);
    expect(b.totalDevedor).toBe(b.totalCredor);
  });
  it('balancete do plano do ZARO também fecha', async () => {
    const { balancete } = await import('./demonstracoes');
    const b = balancete(L2, { de: '2026-01', ate: '2026-09' }, true);
    const soma = b.linhas.reduce((a, l) => a + (l.natureza === 'D' ? l.final : -l.final), 0);
    expect(Math.abs(soma)).toBeLessThan(0.01);
    expect(b.linhas.find((l) => l.conta === '2.3.2.01')!.final).toBe(-12000);
  });
});
