// ZARO · Servidor de integração SEFAZ (NF-e)
// Roda no servidor do escritório. O navegador fala só com este servidor; o certificado A1 nunca sai daqui.
// Serviços: distribuição DF-e (baixar NF-e contra o CNPJ), consulta pela chave, manifestação do destinatário.
// Confira as URLs no Portal Nacional da NF-e (relação de WebServices) antes de ir para produção.
import https from 'node:https';
import fs from 'node:fs';
import zlib from 'node:zlib';
import express from 'express';
import { SignedXml } from 'xml-crypto';
import forge from 'node-forge';

const {
  PORT = 8787, ZARO_TOKEN, AMBIENTE = 'homologacao', UF_AUTOR = '13',
  CERT_PFX_PATH, CERT_PFX_SENHA, CORS_ORIGIN = '*', NSU_FILE = './nsu.json'
} = process.env;
if (!ZARO_TOKEN || !CERT_PFX_PATH || !CERT_PFX_SENHA) { console.error('Configure ZARO_TOKEN, CERT_PFX_PATH e CERT_PFX_SENHA no .env (faltando: ' + ['ZARO_TOKEN', 'CERT_PFX_PATH', 'CERT_PFX_SENHA'].filter(k => !process.env[k]).join(', ') + '). Apague o arquivo .env e rode INICIAR-ZARO-SEFAZ.bat de novo.'); process.exit(1); }
if (!fs.existsSync(CERT_PFX_PATH)) { console.error('Certificado não encontrado em ' + CERT_PFX_PATH); process.exit(1); }

const VERSAO = '7';
const PROD = AMBIENTE === 'producao';
const tpAmb = PROD ? '1' : '2';
const URL = {
  distribuicao: PROD ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  evento: PROD ? 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx' : 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
};
// SEFAZ-AM · NF-e 4.00 (produção conferida no Portal Nacional; homologação em homnfe.sefaz.am.gov.br)
const AM_BASE = PROD ? 'https://nfe.sefaz.am.gov.br/services2/services/' : 'https://homnfe.sefaz.am.gov.br/services2/services/';
const AM = {
  status: AM_BASE + 'NfeStatusServico4', consulta: AM_BASE + 'NfeConsulta4', cadastro: AM_BASE + 'CadConsultaCadastro4',
  evento: AM_BASE + 'RecepcaoEvento4', autorizacao: AM_BASE + 'NfeAutorizacao4', retAutorizacao: AM_BASE + 'NfeRetAutorizacao4', inutilizacao: AM_BASE + 'NfeInutilizacao4'
};
URL.consultaAM = AM.consulta;

// certificado A1
const pfx = fs.readFileSync(CERT_PFX_PATH);
let p12; try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), CERT_PFX_SENHA); } catch (e) { console.error('Não foi possível abrir o certificado: senha incorreta ou arquivo inválido. Apague o arquivo .env e rode INICIAR-ZARO-SEFAZ.bat de novo.'); process.exit(1); }
const keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
const certBag = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])[0];
const KEY_PEM = forge.pki.privateKeyToPem(keyBag.key);
// certificados antigos usam criptografia que o OpenSSL 3 do Node não lê direto do .pfx; por isso convertemos para PEM
const allCerts = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map(b => b.cert);
const leaf = allCerts.find(c => c.publicKey && keyBag.key && c.publicKey.n && c.publicKey.n.equals(keyBag.key.n)) || certBag.cert;
const CERT_PEM = forge.pki.certificateToPem(leaf);
const CHAIN_PEM = allCerts.filter(c => c !== leaf).map(c => forge.pki.certificateToPem(c)).join('');
const CERT_B64 = CERT_PEM.replace(/-----[^-]+-----|\s/g, '');
const CERT_INFO = { titular: leaf.subject.getField('CN')?.value || '', validade: leaf.validity.notAfter.toISOString().slice(0, 10) };
// Os servidores da SEFAZ usam a cadeia ICP-Brasil, que não vem no Node. Coloque os certificados raiz/intermediários
// ICP-Brasil (formato .pem/.crt) na pasta ./cadeia-icp para validação completa. Sem eles, a validação do servidor é desligada
// apenas para os domínios da SEFAZ (prática comum em emissores de NF-e) — o TLS continua cifrado e o certificado A1 continua obrigatório.
const CADEIA = fs.existsSync('./cadeia-icp') ? fs.readdirSync('./cadeia-icp').filter(f => /\.(pem|crt|cer)$/i.test(f)).map(f => fs.readFileSync('./cadeia-icp/' + f)) : [];
const agent = new https.Agent(Object.assign({ key: KEY_PEM, cert: CERT_PEM + CHAIN_PEM, keepAlive: true }, CADEIA.length ? { ca: CADEIA } : { rejectUnauthorized: process.env.SEFAZ_VERIFY_TLS === '1' }));

const soap = (url, action, body) => new Promise((resolve, reject) => {
  const env = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;
  const req = https.request(url, { method: 'POST', agent, headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`, 'Content-Length': Buffer.byteLength(env) }, timeout: 30000 }, res => {
    let d = ''; res.setEncoding('utf8'); res.on('data', c => d += c); res.on('end', () => res.statusCode >= 400 ? reject(new Error('SEFAZ HTTP ' + res.statusCode + ': ' + d.slice(0, 300))) : resolve(d));
  });
  req.on('timeout', () => req.destroy(new Error('Tempo esgotado na SEFAZ'))); req.on('error', reject); req.end(env);
});
const tag = (xml, t) => (xml.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`)) || [])[1] || '';
const dig = s => String(s || '').replace(/\D/g, '');

// controle de NSU por CNPJ (a SEFAZ bloqueia consultas repetidas sem avanço por 1 hora)
const nsuDb = fs.existsSync(NSU_FILE) ? JSON.parse(fs.readFileSync(NSU_FILE, 'utf8')) : {};
const saveNsu = () => fs.writeFileSync(NSU_FILE, JSON.stringify(nsuDb, null, 2));

const NS_DIST = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';
async function distribuicao(cnpj, corpo) {
  const dist = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${UF_AUTOR}</cUFAutor><CNPJ>${cnpj}</CNPJ>${corpo}</distDFeInt>`;
  const r = await soap(URL.distribuicao, NS_DIST + '/nfeDistDFeInteresse', `<nfeDistDFeInteresse xmlns="${NS_DIST}"><nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse>`);
  const rr = /&lt;docZip/.test(r) ? r.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : r;
  const docs = [...rr.matchAll(/<(?:\w+:)?docZip\b([^>]*)>([^<]+)<\/(?:\w+:)?docZip>/g)].map(x => {
    const at = n => ((x[1].match(new RegExp(n + '="([^"]*)"')) || [])[1] || '');
    const m = [null, at('NSU'), at('schema'), x[2].trim()];
    let xml = ''; try { xml = zlib.gunzipSync(Buffer.from(m[3], 'base64')).toString('utf8'); } catch (e) { xml = ''; }
    const ch = (xml.match(/<chNFe>(\d{44})<\/chNFe>/) || xml.match(/Id="NFe(\d{44})"/) || [])[1] || '';
    const tipo = /^procNFe/.test(m[2]) ? 'nfe' : /^resNFe/.test(m[2]) ? 'resumo' : /^procEventoNFe|^resEvento/.test(m[2]) ? 'evento' : m[2];
    const cancelada = tipo === 'evento' && /<tpEvento>110111<\/tpEvento>/.test(xml);
    return { nsu: m[1], schema: m[2], tipo, chave: ch, cancelada, xml };
  });
  return { cStat: tag(rr, 'cStat'), motivo: tag(rr, 'xMotivo'), ultNSU: tag(rr, 'ultNSU'), maxNSU: tag(rr, 'maxNSU'), docs };
}

function assinarEvento(xmlEvento, id, alvo = 'infEvento') {
  const sig = new SignedXml({ privateKey: KEY_PEM, publicCert: CERT_PEM, signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' });
  sig.addReference({ xpath: `//*[@Id='${id}']`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${CERT_B64}</X509Certificate></X509Data>`;
  sig.computeSignature(xmlEvento, { location: { reference: `//*[local-name()='${alvo}']`, action: 'after' } });
  return sig.getSignedXml();
}
const MANIF = { ciencia: ['210210', 'Ciencia da Operacao'], confirmacao: ['210200', 'Confirmacao da Operacao'], desconhecimento: ['210220', 'Desconhecimento da Operacao'], naoRealizada: ['210240', 'Operacao nao Realizada'] };

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', CORS_ORIGIN); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.set('Access-Control-Allow-Private-Network', 'true'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
app.get('/', (req, res) => res.send('ZARO SEFAZ no ar · versão ' + VERSAO + ' · ' + AMBIENTE + ' · certificado ' + CERT_INFO.titular + ' (válido até ' + CERT_INFO.validade + ')'));
app.use((req, res, next) => (req.get('Authorization') === 'Bearer ' + ZARO_TOKEN ? next() : res.status(401).json({ erro: 'Token inválido' })));
const log = (op, info) => console.log(new Date().toISOString(), op, JSON.stringify(info));

app.get('/status', (req, res) => res.json({ ok: true, versao: VERSAO, ambiente: AMBIENTE, uf: UF_AUTOR, certificado: CERT_INFO, endpointsAM: AM, servicos: ['am-status', 'consulta', 'am-cadastro', 'distribuicao', 'manifestacao', 'am-cancelamento', 'am-inutilizacao'], pendentes: ['NFeAutorizacao / NFeRetAutorizacao (emissão)', 'CT-e'] }));

// 1º teste: status do serviço SEFAZ-AM
app.post('/am/status', async (req, res) => {
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4';
  const t0 = Date.now();
  try {
    const r = await soap(AM.status, NS + '/nfeStatusServicoNF', `<nfeDadosMsg xmlns="${NS}"><consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>13</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg>`);
    const out = { servico: 'NfeStatusServico4', url: AM.status, ambiente: AMBIENTE, cStat: tag(r, 'cStat'), motivo: tag(r, 'xMotivo'), dhRecbto: tag(r, 'dhRecbto'), tMed: tag(r, 'tMed'), ms: Date.now() - t0, empresa: req.body.cnpj || '' };
    log('am-status', out); res.json(out);
  } catch (e) { log('am-status-erro', { erro: e.message }); res.json({ ok: false,  servico: 'NfeStatusServico4', url: AM.status, ambiente: AMBIENTE, erro: e.message }); }
});

// consulta cadastro (contribuinte de ICMS no AM)
app.post('/am/cadastro', async (req, res) => {
  const cnpj = dig(req.body.cnpj); if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4';
  try {
    const r = await soap(AM.cadastro, NS + '/consultaCadastro', `<nfeDadosMsg xmlns="${NS}"><ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>AM</UF><CNPJ>${cnpj}</CNPJ></infCons></ConsCad></nfeDadosMsg>`);
    const out = { servico: 'CadConsultaCadastro4', cStat: tag(r, 'cStat'), motivo: tag(r, 'xMotivo'), ie: tag(r, 'IE'), nome: tag(r, 'xNome'), situacao: tag(r, 'cSit') === '1' ? 'Habilitado' : tag(r, 'cSit') === '0' ? 'Não habilitado' : tag(r, 'cSit'), regime: tag(r, 'xRegApur'), cnae: tag(r, 'CNAE'), municipio: tag(r, 'xMun') };
    log('am-cadastro', { cnpj, cStat: out.cStat }); res.json(out);
  } catch (e) { res.json({ ok: false,  servico: 'CadConsultaCadastro4', erro: e.message }); }
});

// cancelamento (evento 110111) — só com confirmação explícita e justificativa de 15 a 255 caracteres
app.post('/am/cancelamento', async (req, res) => {
  const cnpj = dig(req.body.cnpj), ch = dig(req.body.chave), prot = dig(req.body.protocolo), just = String(req.body.justificativa || '').trim();
  if (req.body.confirmar !== true) return res.status(400).json({ erro: 'Cancelamento exige confirmar: true enviado pelo usuário autorizado' });
  if (cnpj.length !== 14 || ch.length !== 44 || !prot || just.length < 15 || just.length > 255) return res.status(400).json({ erro: 'Informe cnpj, chave, protocolo de autorização e justificativa (15 a 255 caracteres)' });
  if (ch.slice(6, 20) !== cnpj) return res.status(400).json({ erro: 'Só o emitente pode cancelar: o CNPJ não é o emitente desta chave' });
  const id = 'ID110111' + ch + '01'; const dh = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 19) + '-04:00';
  const ev = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>13</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${ch}</chNFe><dhEvento>${dh}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${prot}</nProt><xJust>${just}</xJust></detEvento></infEvento></evento>`;
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
  try {
    const r = await soap(AM.evento, NS + '/nfeRecepcaoEvento', `<nfeDadosMsg xmlns="${NS}"><envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote>${assinarEvento(ev, id)}</envEvento></nfeDadosMsg>`);
    const ret = r.slice(r.indexOf('retEvento')); log('am-cancelamento', { cnpj, ch, cStat: tag(ret, 'cStat'), usuario: req.body.usuario || '' });
    res.json({ cStat: tag(ret, 'cStat'), motivo: tag(ret, 'xMotivo'), protocolo: tag(ret, 'nProt') });
  } catch (e) { res.json({ ok: false,  erro: e.message }); }
});

// inutilização de numeração — só com confirmação explícita
app.post('/am/inutilizacao', async (req, res) => {
  const cnpj = dig(req.body.cnpj), serie = String(+req.body.serie || 0), ini = String(+req.body.nIni || 0), fim = String(+req.body.nFin || 0), just = String(req.body.justificativa || '').trim(), mod = String(req.body.modelo || '55');
  if (req.body.confirmar !== true) return res.status(400).json({ erro: 'Inutilização exige confirmar: true enviado pelo usuário autorizado' });
  if (cnpj.length !== 14 || !+ini || +fim < +ini || just.length < 15) return res.status(400).json({ erro: 'Informe cnpj, série, número inicial e final e justificativa (mínimo 15 caracteres)' });
  const ano = String(new Date().getFullYear()).slice(2);
  const id = 'ID13' + ano + cnpj + mod.padStart(2, '0') + serie.padStart(3, '0') + ini.padStart(9, '0') + fim.padStart(9, '0');
  const x = `<inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infInut Id="${id}"><tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ><cUF>13</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ><mod>${mod}</mod><serie>${serie}</serie><nNFIni>${ini}</nNFIni><nNFFin>${fim}</nNFFin><xJust>${just}</xJust></infInut></inutNFe>`;
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4';
  try {
    const r = await soap(AM.inutilizacao, NS + '/nfeInutilizacaoNF', `<nfeDadosMsg xmlns="${NS}">${assinarEvento(x, id, 'infInut')}</nfeDadosMsg>`);
    log('am-inutilizacao', { cnpj, serie, ini, fim, cStat: tag(r, 'cStat') }); res.json({ cStat: tag(r, 'cStat'), motivo: tag(r, 'xMotivo'), protocolo: tag(r, 'nProt') });
  } catch (e) { res.json({ ok: false,  erro: e.message }); }
});

// baixa tudo o que é novo desde o último NSU (até 10 lotes por chamada)
app.post('/nfe/distribuicao', async (req, res) => {
  const cnpj = dig(req.body.cnpj); if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
  const st = nsuDb[cnpj] = nsuDb[cnpj] || { ultNSU: '000000000000000', bloqueadoAte: 0 };
  if (req.body.reiniciar === true) { st.ultNSU = '000000000000000'; st.bloqueadoAte = 0; }
  if (Date.now() < st.bloqueadoAte) return res.json({ docs: [], aviso: 'Sem documentos novos na última consulta; a SEFAZ libera nova busca às ' + new Date(st.bloqueadoAte).toLocaleTimeString('pt-BR'), ultNSU: st.ultNSU });
  const todos = []; let r;
  try {
    for (let i = 0; i < 10; i++) {
      r = await distribuicao(cnpj, `<distNSU><ultNSU>${st.ultNSU.padStart(15, '0')}</ultNSU></distNSU>`);
      if (r.cStat === '656') { st.bloqueadoAte = Date.now() + 61 * 60000; break; }
      if (r.cStat !== '138') { if (r.cStat === '137') st.bloqueadoAte = Date.now() + 61 * 60000; st.ultNSU = r.ultNSU || st.ultNSU; break; }
      todos.push(...r.docs); st.ultNSU = r.ultNSU;
      if (r.ultNSU === r.maxNSU) { st.bloqueadoAte = Date.now() + 61 * 60000; break; }
    }
    saveNsu(); log('distribuicao', { cnpj, n: todos.length, cStat: r && r.cStat });
    const contagem = todos.reduce((o, d) => { o[d.tipo] = (o[d.tipo] || 0) + 1; return o; }, {});
    res.json({ cStat: r && r.cStat, motivo: r && r.motivo, ultNSU: st.ultNSU, maxNSU: r && r.maxNSU, contagem, docs: todos });
  } catch (e) { log('distribuicao-erro', { cnpj, erro: e.message }); res.json({ ok: false,  erro: e.message }); }
});

// XML completo pela chave (só vem completo depois da manifestação de ciência/confirmação)
app.post('/nfe/chave', async (req, res) => {
  const cnpj = dig(req.body.cnpj), ch = dig(req.body.chave);
  if (cnpj.length !== 14 || ch.length !== 44) return res.status(400).json({ erro: 'CNPJ ou chave inválidos' });
  try { const r = await distribuicao(cnpj, `<consChNFe><chNFe>${ch}</chNFe></consChNFe>`); log('chave', { cnpj, ch, cStat: r.cStat }); res.json(r); }
  catch (e) { res.json({ ok: false,  erro: e.message }); }
});

// situação da NF (autorizada / cancelada) — autorizador AM
app.post('/nfe/consulta', async (req, res) => {
  const ch = dig(req.body.chave); if (ch.length !== 44) return res.status(400).json({ erro: 'Chave inválida' });
  if (ch.slice(0, 2) !== '13') return res.status(400).json({ erro: 'Consulta configurada só para o autorizador AM (UF 13); chave é da UF ' + ch.slice(0, 2) });
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4';
  try {
    const r = await soap(URL.consultaAM, NS + '/nfeConsultaNF', `<nfeDadosMsg xmlns="${NS}"><consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${ch}</chNFe></consSitNFe></nfeDadosMsg>`);
    const cStat = tag(r, 'cStat'); const cancelada = /<tpEvento>110111<\/tpEvento>/.test(r) || cStat === '101';
    log('consulta', { ch, cStat }); const eventos = [...r.matchAll(/<tpEvento>(\d+)<\/tpEvento>[\s\S]*?<xEvento>([^<]*)<\/xEvento>[\s\S]*?<dhRegEvento>([^<]*)</g)].map(m => ({ tipo: m[1], descricao: m[2], data: m[3] }));
    res.json({ servico: 'NfeConsulta4', cStat, motivo: tag(r, 'xMotivo'), cancelada, protocolo: tag(r, 'nProt'), dhRecbto: tag(r, 'dhRecbto'), eventos });
  } catch (e) { res.json({ ok: false,  erro: e.message }); }
});

// manifestação do destinatário
app.post('/nfe/manifestacao', async (req, res) => {
  const cnpj = dig(req.body.cnpj), ch = dig(req.body.chave), m = MANIF[req.body.tipo];
  if (cnpj.length !== 14 || ch.length !== 44 || !m) return res.status(400).json({ erro: 'Informe cnpj, chave e tipo (ciencia, confirmacao, desconhecimento, naoRealizada)' });
  if ((req.body.tipo === 'naoRealizada') && !(req.body.justificativa || '').trim()) return res.status(400).json({ erro: 'Justificativa obrigatória para operação não realizada' });
  const id = 'ID' + m[0] + ch + '01';
  const dh = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 19) + '-04:00';
  const ev = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${ch}</chNFe><dhEvento>${dh}</dhEvento><tpEvento>${m[0]}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${m[1]}</descEvento>${req.body.tipo === 'naoRealizada' ? `<xJust>${String(req.body.justificativa).slice(0, 255)}</xJust>` : ''}</detEvento></infEvento></evento>`;
  const NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
  try {
    const lote = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote>${assinarEvento(ev, id)}</envEvento>`;
    const r = await soap(URL.evento, NS + '/nfeRecepcaoEvento', `<nfeDadosMsg xmlns="${NS}">${lote}</nfeDadosMsg>`);
    const ret = r.slice(r.indexOf('retEvento')); log('manifestacao', { cnpj, ch, tipo: req.body.tipo, cStat: tag(ret, 'cStat') });
    res.json({ cStat: tag(ret, 'cStat'), motivo: tag(ret, 'xMotivo'), protocolo: tag(ret, 'nProt') });
  } catch (e) { res.json({ ok: false,  erro: e.message }); }
});

// ── Cobrança inteligente de documentos (ZARO → servidor → n8n) ──
const COB_FILE = './cobranca.json';
const cobDb = fs.existsSync(COB_FILE) ? JSON.parse(fs.readFileSync(COB_FILE, 'utf8')) : { snapshot: null, enviados: {}, log: [] };
const saveCob = () => fs.writeFileSync(COB_FILE, JSON.stringify(cobDb, null, 2));
// ZARO envia a lista de pendências atual (só o que realmente falta)
app.post('/cobranca/snapshot', (req, res) => { const b = req.body || {}; if (!Array.isArray(b.itens)) return res.status(400).json({ erro: 'itens obrigatório' }); cobDb.snapshot = { recebidoEm: new Date().toISOString(), config: b.config || {}, itens: b.itens }; saveCob(); log('cobranca-snapshot', { n: b.itens.length }); res.json({ ok: true, n: b.itens.length }); });
// n8n consulta: devolve só o que vence na etapa de hoje e ainda não foi enviado (sem duplicar)
app.get('/cobranca/pendencias', (req, res) => {
  const s = cobDb.snapshot; if (!s) return res.json({ itens: [], aviso: 'ZARO ainda não enviou pendências' });
  const cfg = s.config || {}; const dias = (cfg.dias || [3, 7, 10, 15]).map(Number); const hoje = new Date(); const d = Number(req.query.dia || hoje.getDate());
  const etapa = dias.filter(x => x <= d).length; if (!etapa) return res.json({ itens: [], etapa: 0, aviso: 'Antes da primeira data de cobrança' });
  const escalar = etapa >= dias.length;
  const grupos = {};
  s.itens.filter(i => i.ativo !== false && !i.pausado).forEach(i => { const dest = escalar && cfg.escalonamento ? cfg.escalonamento : i.destinatario; const key = [i.empresaId, i.competencia, i.documento, etapa, dest.whatsapp || dest.email].join('|'); if (cobDb.enviados[key]) return; const g = grupos[i.empresaId + '|' + i.competencia + '|' + etapa] = grupos[i.empresaId + '|' + i.competencia + '|' + etapa] || { empresa: i.empresa, competencia: i.competencia, etapa, escalonamento: escalar, destinatario: dest, canal: cfg.canal || 'email', prazo: cfg.prazo || '', link: cfg.link || '', documentos: [], keys: [] }; g.documentos.push(i.documento); g.keys.push(key); });
  const itens = Object.values(grupos).map(g => Object.assign(g, { mensagem: 'Olá! O ZARO identificou documentos pendentes para o fechamento contábil da ' + g.empresa + '.\n\nCompetência: ' + g.competencia + '\n\nDocumentos pendentes:\n' + g.documentos.map(x => '• ' + x).join('\n') + (g.prazo ? '\n\nPrazo para envio: ' + g.prazo : '') + (g.link ? '\n\nEnvie por: ' + g.link : '') + '\n\nSe já enviou, desconsidere esta mensagem.\n\nZARO | Gestão Contábil Inteligente' }));
  res.json({ etapa, itens });
});
// n8n registra o resultado de cada envio
app.post('/cobranca/enviado', (req, res) => { const b = req.body || {}; const keys = Array.isArray(b.keys) ? b.keys : []; if (b.ok) keys.forEach(k => { cobDb.enviados[k] = new Date().toISOString(); }); cobDb.log.unshift({ quando: new Date().toISOString(), empresa: b.empresa, competencia: b.competencia, etapa: b.etapa, canal: b.canal, destino: b.destino, documentos: b.documentos, ok: !!b.ok, erro: b.erro || '' }); cobDb.log = cobDb.log.slice(0, 500); saveCob(); res.json({ ok: true }); });
app.get('/cobranca/log', (req, res) => res.json({ log: cobDb.log, snapshotEm: cobDb.snapshot && cobDb.snapshot.recebidoEm }));

// emissão de NF-e e CT-e: exigem montagem completa do XML (layout 4.00 / CT-e 4.00), assinatura,
// numeração, contingência e DANFE. Não implementado nesta versão para não emitir documento fiscal incorreto.
app.post('/nfe/emitir', (req, res) => res.status(501).json({ erro: 'Emissão (NfeAutorizacao4 / NfeRetAutorizacao4) ainda não implementada: falta montagem e validação do XML 4.00 contra o schema oficial', endpoints: { autorizacao: AM.autorizacao, retAutorizacao: AM.retAutorizacao } }));
app.post('/cte/:op', (req, res) => res.status(501).json({ erro: 'CT-e ainda não implementado neste servidor' }));

app.listen(PORT, () => console.log(`ZARO SEFAZ v${VERSAO} · ${AMBIENTE} · porta ${PORT} · certificado ${CERT_INFO.titular} (válido até ${CERT_INFO.validade})`));
