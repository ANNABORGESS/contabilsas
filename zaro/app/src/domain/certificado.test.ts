import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { lerCertificadoA1, situacaoCertificado } from './certificado';

function gerarPfx(cn: string, senha: string, ate: string, comCa = true) {
  const novo = (subj: string, emissor: { cn: string; chave: forge.pki.rsa.PrivateKey } | null, k: forge.pki.rsa.KeyPair, serie: string) => {
    const c = forge.pki.createCertificate();
    c.publicKey = k.publicKey;
    c.serialNumber = serie;
    c.validity.notBefore = new Date('2025-11-01T00:00:00Z');
    c.validity.notAfter = new Date(`${ate}T12:00:00Z`);
    c.setSubject([{ name: 'commonName', value: subj }]);
    c.setIssuer([{ name: 'commonName', value: emissor?.cn || subj }]);
    c.sign(emissor?.chave || k.privateKey, forge.md.sha256.create());
    return c;
  };
  const kCa = forge.pki.rsa.generateKeyPair(1024);
  const k = forge.pki.rsa.generateKeyPair(1024);
  const ca = novo('AC TESTE RFB v5', null, kCa, '01');
  const folha = novo(cn, { cn: 'AC TESTE RFB v5', chave: kCa.privateKey }, k, '0a1b2c');
  const asn = forge.pkcs12.toPkcs12Asn1(k.privateKey, comCa ? [ca, folha] : [folha], senha, { algorithm: '3des' });
  return Uint8Array.from(forge.asn1.toDer(asn).getBytes(), (ch) => ch.charCodeAt(0));
}

describe('certificado A1', () => {
  const pfx = gerarPfx('EMPRESA TESTE LTDA:08201911000199', 'segredo', '2027-09-30');

  it('lê CNPJ, razão social, emissor e validade do e-CNPJ (ignora a AC da cadeia)', () => {
    const d = lerCertificadoA1(pfx, 'segredo');
    expect(d).toMatchObject({ cnpj: '08201911000199', razao: 'EMPRESA TESTE LTDA', emissor: 'AC TESTE RFB v5', serie: '0a1b2c', validoDe: '2025-11-01', validoAte: '2027-09-30' });
  });

  it('senha errada dá mensagem clara', () => {
    expect(() => lerCertificadoA1(pfx, 'errada')).toThrow(/senha/);
  });

  it('certificado sem CNPJ (e-CPF) é recusado', () => {
    expect(() => lerCertificadoA1(gerarPfx('FULANO DE TAL:12345678901', 's', '2027-01-01', false), 's')).toThrow(/e-CNPJ/);
  });

  it('situação: válido, vence em até 30 dias, vencido', () => {
    expect(situacaoCertificado('2027-09-30', '2026-10-26').nivel).toBe('ok');
    expect(situacaoCertificado('2026-11-10', '2026-10-26')).toMatchObject({ nivel: 'atencao', dias: 15 });
    expect(situacaoCertificado('2026-10-01', '2026-10-26').nivel).toBe('vencido');
  });
});
