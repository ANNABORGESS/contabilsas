import { describe, expect, it } from 'vitest';
import { dataDaPlanilha, lerListaSefaz, notaCancelada } from './notas-sefaz';

const CH = '13261008201911000199550010000039701200000027';

describe('lista de NF da SEFAZ-AM', () => {
  it('lê na ordem fixa da planilha, limpa a chave e converte data do Excel e valor', () => {
    const r = lerListaSefaz([
      ['UF', 'CHAVE', 'NUMERO', 'SERIE', 'EMISSAO', 'CNPJ EMISSOR', 'IE EMISSOR', 'RAZAO SOCIAL', 'CNPJ/CPF DEST', 'IE DEST', 'RAZAO DEST', 'CFOP', 'SELAGEM', 'SITUACAO', 'TIPO', 'VALOR'],
      ['AM', `'${CH}`, '0003970', '1', 46302, '08.201.911/0001-99', '062345678', 'A B S', '04222931000195', '', 'CLIMAZON', '5101', 'SELADA', 'AUTORIZADA', 'SAIDA', '1.234,56'],
      ['AM', 'chave quebrada', '1', '1', '', '', '', '', '', '', '', '', '', '', '', ''],
      [],
    ]);
    expect(r.ignoradas).toBe(1);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0]).toMatchObject({ chave: CH, numero: '3970', emissao: '2026-10-07', cnpjEmit: '08201911000199', razaoEmit: 'A B S', razaoDest: 'CLIMAZON', cfop: '5101', selagem: 'SELADA', valor: 1234.56 });
  });

  it('usa os títulos quando as colunas vêm em outra ordem, e chave repetida fica uma vez', () => {
    const r = lerListaSefaz([
      ['Valor', 'Chave de acesso', 'Situação', 'Número', 'Emissão', 'CNPJ Emitente', 'Razão Social Emitente'],
      [99.9, CH, 'Cancelada', '15', '07/10/2026', '1', 'X'],
      [99.9, CH, 'Cancelada', '15', '07/10/2026', '1', 'X'],
    ]);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0]).toMatchObject({ valor: 99.9, situacao: 'Cancelada', numero: '15', emissao: '2026-10-07', razaoEmit: 'X' });
    expect(notaCancelada(r.notas[0].situacao)).toBe(true);
  });

  it('datas', () => {
    expect(dataDaPlanilha('2026-10-07T10:00:00')).toBe('2026-10-07');
    expect(dataDaPlanilha('texto')).toBeNull();
  });
});
