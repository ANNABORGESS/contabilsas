// Leitura do certificado digital A1 (e-CNPJ, arquivo .pfx/.p12) para cadastrar a empresa.
// Só extrai dados públicos do certificado; o arquivo e a senha não são guardados.
import forge from 'node-forge';

export interface DadosCertificado {
  cnpj: string;
  razao: string;
  titular: string;
  emissor: string;
  serie: string;
  validoDe: string;
  validoAte: string;
}

const OID_CNPJ = '2.16.76.1.3.3'; // ICP-Brasil: CNPJ da pessoa jurídica titular

const iso = (d: Date) => d.toISOString().slice(0, 10);

// e-CNPJ ICP-Brasil: CN = "RAZAO SOCIAL:CNPJ"; o CNPJ também vem no SubjectAltName (otherName 2.16.76.1.3.3)
function cnpjDoCertificado(cert: forge.pki.Certificate, cn: string) {
  const doCn = cn.match(/:(\d{14})$/)?.[1];
  if (doCn) return doCn;
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const i = der.indexOf(forge.asn1.oidToDer(OID_CNPJ).getBytes());
  return i >= 0 ? der.slice(i, i + 64).match(/\d{14}/)?.[0] || '' : '';
}

export function lerCertificadoA1(arquivo: Uint8Array, senha: string): DadosCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.binary.raw.encode(arquivo)), senha);
  } catch {
    throw new Error('Não consegui abrir o certificado: confira a senha e se o arquivo é .pfx ou .p12.');
  }
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const temChave = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []).length > 0
    || (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []).length > 0;
  // o certificado da empresa é o que não emitiu nenhum outro da cadeia
  const folha = certs.find((c) => !certs.some((o) => o !== c && o.isIssuer(c))) || certs[0];
  if (!folha || !temChave) throw new Error('O arquivo não traz certificado com chave privada. Use o .pfx do certificado A1.');
  const cn = String(folha.subject.getField('CN')?.value || '');
  const cnpj = cnpjDoCertificado(folha, cn);
  if (!cnpj) throw new Error('Este certificado não é e-CNPJ (não encontrei CNPJ nele).');
  return {
    cnpj,
    razao: cn.replace(/:\d{14}$/, '').trim(),
    titular: cn,
    emissor: String(folha.issuer.getField('CN')?.value || ''),
    serie: folha.serialNumber,
    validoDe: iso(folha.validity.notBefore),
    validoAte: iso(folha.validity.notAfter),
  };
}

export type SituacaoCertificado = { nivel: 'ok' | 'atencao' | 'vencido'; texto: string; dias: number };

export function situacaoCertificado(validoAte: string, hoje: string): SituacaoCertificado {
  const dias = Math.round((Date.parse(validoAte) - Date.parse(hoje)) / 86_400_000);
  const data = validoAte.split('-').reverse().join('/');
  if (dias < 0) return { nivel: 'vencido', texto: `Certificado A1 vencido em ${data}`, dias };
  if (dias <= 30) return { nivel: 'atencao', texto: `Certificado A1 vence em ${dias} dia(s) (${data})`, dias };
  return { nivel: 'ok', texto: `Certificado A1 válido até ${data}`, dias };
}
