// SEFAZ direto do ZARO (sem o servidor local): o certificado A1 da empresa fica no banco, cifrado com
// AES-256-GCM; a chave fica fora do banco (variável ZARO_CHAVE_CERT na Vercel, ou arquivo na pasta de dados
// quando o ZARO roda no computador). O .pfx só é aberto na memória, na hora de falar com a SEFAZ.
import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import type { Db } from '@/db';
import { PASTA_DADOS, schema } from '@/db';
import { lerCertificadoA1 } from '@/domain/certificado';
import { soDigitos } from '@/domain/dinheiro';
import { type Ambiente, cifrar, corpoDistribuicao, decifrar, type DocDistribuido, envelope, eventoManifestacao, lerDistribuicao, NS, tag, type TipoManifestacao, urls } from '@/domain/sefaz-xml';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

export interface InfoCertificado {
  titular: string;
  cnpj: string;
  emissor: string;
  validoAte: string;
  ambiente: Ambiente;
  guardadoEm: string;
  por: string;
}
type Guardado = InfoCertificado & { cofre: string };

const chaveCofre = (empresaId: string) => `sefaz:cert:${empresaId}`;

function chaveMestra(): Buffer {
  const env = process.env.ZARO_CHAVE_CERT;
  if (env) {
    const b = Buffer.from(env, 'base64');
    if (b.length !== 32) throw new Error('ZARO_CHAVE_CERT precisa ter 32 bytes em base64.');
    return b;
  }
  if (process.env.VERCEL) throw new Error('Falta a variável ZARO_CHAVE_CERT nas configurações da Vercel para guardar certificados.');
  // ZARO no computador: a chave fica num arquivo da pasta de dados, fora do banco
  const arq = path.join(PASTA_DADOS, 'chave-certificados');
  if (!fs.existsSync(arq)) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    fs.writeFileSync(arq, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(arq, 'utf8').trim(), 'base64');
}

async function lerConfig<T>(db: Db, tenantId: string, chave: string) {
  const [c] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave)));
  return (c?.valor as T) ?? null;
}
async function gravarConfig(db: Db, tenantId: string, chave: string, valor: unknown) {
  await db.insert(schema.configuracoes).values({ tenantId, chave, valor }).onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor, atualizadoEm: new Date() } });
}

export async function infoCertificado(db: Db, tenantId: string, empresaId: string): Promise<InfoCertificado | null> {
  const g = await lerConfig<Guardado>(db, tenantId, chaveCofre(empresaId));
  if (!g) return null;
  const { cofre: _cofre, ...info } = g;
  return info;
}

/** Guarda o A1 da empresa (só e-CNPJ do próprio CNPJ). Senha e arquivo saem cifrados; nada aparece na tela. */
export async function guardarCertificado(db: Db, u: Usuario, emp: Empresa, pfx: Uint8Array, senha: string, ambiente: Ambiente) {
  const c = lerCertificadoA1(pfx, senha);
  if (c.cnpj !== soDigitos(emp.cnpj)) throw new Error(`O certificado é do CNPJ ${c.cnpj}, não da empresa ativa.`);
  if (c.validoAte < new Date().toISOString().slice(0, 10)) throw new Error(`Este certificado venceu em ${c.validoAte.split('-').reverse().join('/')}.`);
  const cofre = cifrar(chaveMestra(), Buffer.from(JSON.stringify({ pfx: Buffer.from(pfx).toString('base64'), senha })));
  const info: Guardado = { titular: c.titular, cnpj: c.cnpj, emissor: c.emissor, validoAte: c.validoAte, ambiente, guardadoEm: new Date().toISOString(), por: u.nome, cofre };
  await gravarConfig(db, u.tenantId, chaveCofre(emp.id), info);
  const [e] = await db.select({ dados: schema.empresas.dados }).from(schema.empresas).where(and(eq(schema.empresas.id, emp.id), eq(schema.empresas.tenantId, u.tenantId)));
  await db.update(schema.empresas).set({ dados: { ...(e?.dados || {}), certificado: { tipo: 'A1', titular: c.titular, emissor: c.emissor, serie: c.serie, validoDe: c.validoDe, validoAte: c.validoAte, lidoEm: new Date().toISOString().slice(0, 10) } } }).where(eq(schema.empresas.id, emp.id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Guardou certificado A1 para a SEFAZ', entidade: c.titular, depois: `válido até ${c.validoAte.split('-').reverse().join('/')} · ${ambiente}` });
  return `Certificado de ${c.razao} guardado (válido até ${c.validoAte.split('-').reverse().join('/')}). O ZARO já pode falar com a SEFAZ em ${ambiente === 'producao' ? 'produção' : 'homologação'}.`;
}

export async function removerCertificado(db: Db, u: Usuario, emp: Empresa) {
  await db.delete(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, u.tenantId), eq(schema.configuracoes.chave, chaveCofre(emp.id))));
  await auditar(db, u, { empresaId: emp.id, acao: 'Removeu certificado A1 da SEFAZ', entidade: emp.razao });
  return 'Certificado apagado do ZARO.';
}

interface Aberto { agente: https.Agent; keyPem: string; certPem: string; certB64: string; info: InfoCertificado }

async function abrir(db: Db, tenantId: string, empresaId: string): Promise<Aberto | null> {
  const g = await lerConfig<Guardado>(db, tenantId, chaveCofre(empresaId));
  if (!g) return null;
  let s: { pfx: string; senha: string };
  try {
    s = JSON.parse(decifrar(chaveMestra(), g.cofre).toString('utf8'));
  } catch {
    throw new Error('Não consegui abrir o certificado guardado (a chave do cofre mudou). Envie o .pfx de novo.');
  }
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.binary.raw.encode(Buffer.from(s.pfx, 'base64'))), s.senha);
  const chaves = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  const key = chaves[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  if (!key || !certs.length) throw new Error('Certificado guardado sem chave privada.');
  const folha = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(key.n)) || certs[0];
  // PEM em vez do .pfx: certificados antigos usam criptografia que o OpenSSL 3 do Node não abre direto
  const keyPem = forge.pki.privateKeyToPem(key);
  const certPem = forge.pki.certificateToPem(folha);
  const cadeia = certs.filter((c) => c !== folha).map((c) => forge.pki.certificateToPem(c)).join('');
  // O certificado do servidor da SEFAZ é sempre conferido. Os servidores da SEFAZ usam a cadeia ICP-Brasil, que não vem
  // no Node: as raízes/intermediárias ICP-Brasil (públicas, em iti.gov.br) entram pela variável SEFAZ_CA_PEM.
  const ca = process.env.SEFAZ_CA_PEM ? [...tls.rootCertificates, process.env.SEFAZ_CA_PEM] : undefined;
  const agente = new https.Agent({ key: keyPem, cert: certPem + cadeia, ...(ca ? { ca } : {}) });
  const { cofre: _c, ...info } = g;
  return { agente, keyPem, certPem, certB64: certPem.replace(/-----[^-]+-----|\s/g, ''), info };
}

function soap(a: Aberto, url: string, action: string, body: string) {
  const env = envelope(body);
  return new Promise<string>((resolve, reject) => {
    const req = https.request(url, { method: 'POST', agent: a.agente, headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`, 'Content-Length': Buffer.byteLength(env) }, timeout: 25000 }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => ((res.statusCode || 500) >= 400 ? reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}: ${tag(d, 'Text') || tag(d, 'faultstring') || d.slice(0, 200)}`)) : resolve(d)));
    });
    req.on('timeout', () => req.destroy(new Error('A SEFAZ não respondeu a tempo. Tente de novo em alguns minutos.')));
    req.on('error', (e: NodeJS.ErrnoException) => reject(new Error(/CERT|certificate|self.signed|issuer/i.test(`${e.code} ${e.message}`)
      ? 'O servidor da SEFAZ usa a cadeia de certificados ICP-Brasil, que ainda não está configurada no ZARO (variável SEFAZ_CA_PEM). A conexão foi recusada por segurança.'
      : `Não consegui falar com a SEFAZ: ${e.message}`)));
    req.end(env);
  });
}

function assinar(a: Aberto, xml: string, id: string) {
  const sig = new SignedXml({ privateKey: a.keyPem, publicCert: a.certPem, signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' });
  sig.addReference({ xpath: `//*[@Id='${id}']`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${a.certB64}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, { location: { reference: "//*[local-name()='infEvento']", action: 'after' } });
  return sig.getSignedXml();
}

/** A empresa tem certificado guardado no ZARO? Então as chamadas vão direto à SEFAZ. */
export const temCertificadoNaNuvem = async (db: Db, tenantId: string, empresaId: string) => !!(await lerConfig<Guardado>(db, tenantId, chaveCofre(empresaId)));

type Estado = { ultNSU: string; bloqueadoAte: number };

/** Mesmas rotas do servidor-sefaz local, executadas aqui dentro. */
export async function chamarNuvem<T>(db: Db, tenantId: string, emp: Empresa, caminho: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const a = await abrir(db, tenantId, emp.id);
  if (!a) throw new Error('Guarde o certificado A1 da empresa em Configurações → Integração SEFAZ.');
  const u = urls(a.info.ambiente);
  const cnpj = soDigitos(emp.cnpj);
  const r = (x: unknown) => x as T;
  if (caminho === '/status') return r({ ok: true, versao: 'nuvem', ambiente: a.info.ambiente, certificado: { titular: a.info.titular, validade: a.info.validoAte } });
  if (caminho === '/am/status') {
    const x = await soap(a, u.amStatus, `${NS.status}/nfeStatusServicoNF`, `<nfeDadosMsg xmlns="${NS.status}"><consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${u.tpAmb}</tpAmb><cUF>13</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg>`);
    return r({ cStat: tag(x, 'cStat'), motivo: tag(x, 'xMotivo'), dhRecbto: tag(x, 'dhRecbto') });
  }
  if (caminho === '/nfe/chave') {
    const ch = soDigitos(corpo.chave);
    if (ch.length !== 44) throw new Error('Chave inválida.');
    return r(lerDistribuicao(await soap(a, u.distribuicao, `${NS.dist}/nfeDistDFeInteresse`, corpoDistribuicao(u.tpAmb, cnpj, { chave: ch }))));
  }
  if (caminho === '/nfe/distribuicao') {
    const k = `sefaz:nsu:${emp.id}:${a.info.ambiente}`;
    const st: Estado = (await lerConfig<Estado>(db, tenantId, k)) || { ultNSU: '000000000000000', bloqueadoAte: 0 };
    if (corpo.reiniciar === true) Object.assign(st, { ultNSU: '000000000000000', bloqueadoAte: 0 });
    if (Date.now() < st.bloqueadoAte) return r({ docs: [], ultNSU: st.ultNSU, aviso: `A SEFAZ só libera nova busca às ${new Date(st.bloqueadoAte).toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })} (limite de 1 hora sem documentos novos).` });
    const todos: DocDistribuido[] = [];
    let res: ReturnType<typeof lerDistribuicao> | null = null;
    // até 5 lotes de 50 documentos por clique, para caber no tempo da função na nuvem
    for (let i = 0; i < 5; i++) {
      res = lerDistribuicao(await soap(a, u.distribuicao, `${NS.dist}/nfeDistDFeInteresse`, corpoDistribuicao(u.tpAmb, cnpj, { ultNSU: st.ultNSU })));
      if (res.cStat === '656') { st.bloqueadoAte = Date.now() + 61 * 60000; break; }
      if (res.cStat !== '138') { if (res.cStat === '137') st.bloqueadoAte = Date.now() + 61 * 60000; st.ultNSU = res.ultNSU || st.ultNSU; break; }
      todos.push(...res.docs);
      st.ultNSU = res.ultNSU;
      if (res.ultNSU === res.maxNSU) { st.bloqueadoAte = Date.now() + 61 * 60000; break; }
    }
    await gravarConfig(db, tenantId, k, st);
    const mais = res?.cStat === '138' && res.ultNSU !== res.maxNSU;
    return r({ cStat: res?.cStat, motivo: res?.motivo, ultNSU: st.ultNSU, maxNSU: res?.maxNSU, docs: todos, aviso: mais ? 'Ainda há documentos na SEFAZ: clique em Buscar de novo.' : undefined });
  }
  if (caminho === '/nfe/manifestacao') {
    const ch = soDigitos(corpo.chave);
    const tipo = String(corpo.tipo) as TipoManifestacao;
    if (ch.length !== 44 || !['ciencia', 'confirmacao', 'desconhecimento', 'naoRealizada'].includes(tipo)) throw new Error('Chave ou tipo de manifestação inválido.');
    const ev = eventoManifestacao(u.tpAmb, cnpj, ch, tipo, String(corpo.justificativa || ''));
    const lote = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote>${assinar(a, ev.xml, ev.id)}</envEvento>`;
    const x = await soap(a, u.evento, `${NS.evento}/nfeRecepcaoEvento`, `<nfeDadosMsg xmlns="${NS.evento}">${lote}</nfeDadosMsg>`);
    const ret = x.slice(x.indexOf('retEvento'));
    return r({ cStat: tag(ret, 'cStat') || tag(x, 'cStat'), motivo: tag(ret, 'xMotivo') || tag(x, 'xMotivo'), protocolo: tag(ret, 'nProt') });
  }
  if (caminho === '/nfe/consulta') {
    const ch = soDigitos(corpo.chave);
    if (ch.length !== 44 || ch.slice(0, 2) !== '13') throw new Error('A consulta de situação atende NF-e do Amazonas (chave começando com 13).');
    const x = await soap(a, u.amConsulta, `${NS.consulta}/nfeConsultaNF`, `<nfeDadosMsg xmlns="${NS.consulta}"><consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${u.tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${ch}</chNFe></consSitNFe></nfeDadosMsg>`);
    return r({ cStat: tag(x, 'cStat'), motivo: tag(x, 'xMotivo'), cancelada: /<tpEvento>110111<\/tpEvento>/.test(x) || tag(x, 'cStat') === '101', protocolo: tag(x, 'nProt') });
  }
  if (caminho === '/am/cadastro') {
    const doc = soDigitos(corpo.cnpj) || cnpj;
    const x = await soap(a, u.amCadastro, `${NS.cadastro}/consultaCadastro`, `<nfeDadosMsg xmlns="${NS.cadastro}"><ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>AM</UF><CNPJ>${doc}</CNPJ></infCons></ConsCad></nfeDadosMsg>`);
    return r({ cStat: tag(x, 'cStat'), motivo: tag(x, 'xMotivo'), ie: tag(x, 'IE'), nome: tag(x, 'xNome'), situacao: tag(x, 'cSit') === '1' ? 'Habilitado' : tag(x, 'cSit') === '0' ? 'Não habilitado' : tag(x, 'cSit') });
  }
  throw new Error(`Serviço ${caminho} não disponível na integração direta.`);
}
