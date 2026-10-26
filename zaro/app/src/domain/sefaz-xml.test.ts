import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cifrar, corpoDistribuicao, dataEvento, decifrar, eventoManifestacao, lerDistribuicao } from './sefaz-xml';

const zip = (xml: string) => zlib.gzipSync(Buffer.from(xml)).toString('base64');
const CH = '13261008201911000199550010000039761000000001';

describe('SEFAZ', () => {
  it('lê a distribuição DF-e (resumo, NF-e completa e cancelamento), mesmo escapada', () => {
    const corpo = `<retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>000000000000012</ultNSU><maxNSU>000000000000015</maxNSU><loteDistDFeInt>`
      + `<docZip NSU="000000000000010" schema="resNFe_v1.01.xsd">${zip(`<resNFe><chNFe>${CH}</chNFe><vNF>10.00</vNF></resNFe>`)}</docZip>`
      + `<docZip NSU="000000000000011" schema="procNFe_v4.00.xsd">${zip(`<nfeProc><NFe><infNFe Id="NFe${CH}"></infNFe></NFe></nfeProc>`)}</docZip>`
      + `<docZip NSU="000000000000012" schema="procEventoNFe_v1.00.xsd">${zip(`<procEventoNFe><chNFe>${CH}</chNFe><tpEvento>110111</tpEvento></procEventoNFe>`)}</docZip></loteDistDFeInt></retDistDFeInt>`;
    for (const r of [corpo, corpo.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')]) {
      const d = lerDistribuicao(`<soap><nfeDistDFeInteresseResult>${r}</nfeDistDFeInteresseResult></soap>`);
      expect(d).toMatchObject({ cStat: '138', ultNSU: '000000000000012', maxNSU: '000000000000015' });
      expect(d.docs.map((x) => [x.nsu, x.tipo, x.chave, x.cancelada])).toEqual([['000000000000010', 'resumo', CH, false], ['000000000000011', 'nfe', CH, false], ['000000000000012', 'evento', CH, true]]);
    }
  });

  it('monta a consulta por NSU e por chave', () => {
    expect(corpoDistribuicao('1', '08201911000199', { ultNSU: '12' })).toContain('<distNSU><ultNSU>000000000000012</ultNSU></distNSU>');
    expect(corpoDistribuicao('2', '08201911000199', { chave: CH })).toContain(`<consChNFe><chNFe>${CH}</chNFe></consChNFe>`);
  });

  it('evento de manifestação com Id, órgão 91 e hora de Manaus', () => {
    const e = eventoManifestacao('1', '08201911000199', CH, 'ciencia', '', new Date('2026-10-26T15:00:00Z'));
    expect(e.id).toBe(`ID210210${CH}01`);
    expect(e.xml).toContain('<cOrgao>91</cOrgao>');
    expect(e.xml).toContain('<dhEvento>2026-10-26T11:00:00-04:00</dhEvento>');
    expect(dataEvento(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31T22:00:00-04:00');
  });

  it('cofre: cifra e decifra; outra chave ou texto alterado falham', () => {
    const k = crypto.randomBytes(32);
    const t = cifrar(k, Buffer.from('segredo do certificado'));
    expect(t.startsWith('v1:')).toBe(true);
    expect(decifrar(k, t).toString()).toBe('segredo do certificado');
    expect(() => decifrar(crypto.randomBytes(32), t)).toThrow();
    expect(() => decifrar(k, t.slice(0, -4) + 'AAAA')).toThrow();
  });
});
