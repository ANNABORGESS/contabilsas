// ZARO · servidor local de conexão com a SEFAZ (NF-e, Ambiente Nacional).
// Baixa as notas emitidas contra o CNPJ do certificado (Distribuição DF-e)
// e envia a manifestação do destinatário. Rode com INICIAR-ZARO-SEFAZ.bat.
import express from 'express';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';

const cfg = {
  porta: Number(process.env.PORT || 8787),
  token: process.env.ZARO_TOKEN || '',
  producao: (process.env.AMBIENTE || 'homologacao').toLowerCase() === 'producao',
  ufAutor: process.env.UF_AUTOR || '13',
  pfxPath: process.env.CERT_PFX_PATH || './certificado.pfx',
  pfxSenha: process.env.CERT_PFX_SENHA || '',
  cors: process.env.CORS_ORIGIN || '*',
  nsuFile: process.env.NSU_FILE || './nsu.json',
  xmlDir: process.env.XML_DIR || './xml',
  // cadeia ICP-Brasil (.pem) para validar o certificado do servidor da SEFAZ
  caPath: process.env.SEFAZ_CA_PATH || '',
  // fuso usado no horário dos eventos (Amazonas = -04:00)
  fuso: process.env.FUSO || '-04:00',
};

const tpAmb = cfg.producao ? '1' : '2';
const URLS = cfg.producao
  ? {
      dist: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
      evento: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    }
  : {
      dist: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
      evento: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    };

const EVENTOS = {
  confirmacao: { tp: '210200', desc: 'Confirmacao da Operacao' },
  ciencia: { tp: '210210', desc: 'Ciencia da Operacao' },
  desconhecimento: { tp: '210220', desc: 'Desconhecimento da Operacao' },
  nao_realizada: { tp: '210240', desc: 'Operacao nao Realizada' },
};

if (!cfg.token) sair('ZARO_TOKEN vazio no .env. Rode o INICIAR-ZARO-SEFAZ.bat de novo.');

// ---------- certificado ----------

function lerCertificado() {
  if (!fs.existsSync(cfg.pfxPath)) sair(`Certificado não encontrado em ${cfg.pfxPath}.`);
  const der = fs.readFileSync(cfg.pfxPath);
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der.toString('binary')), cfg.pfxSenha);
  } catch {
    sair('Não foi possível abrir o certificado. A senha está correta?');
  }
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!chaves.length || !certs.length) sair('O arquivo .pfx não tem chave e certificado.');
  const chave = chaves[0].key;
  // o certificado da empresa é o que tem a mesma chave pública; os outros são da cadeia
  const doTitular = certs.find((c) => c.cert.publicKey.n.equals(chave.n)) || certs[0];
  const cert = doTitular.cert;
  const cn = cert.subject.getField('CN')?.value || '';
  const cnpj = process.env.CNPJ || (cn.match(/(\d{14})/) || [])[1] || '';
  if (!cnpj) sair('Não achei o CNPJ no certificado. Coloque CNPJ=... no .env.');
  const cadeia = certs.filter((c) => c !== doTitular).map((c) => forge.pki.certificateToPem(c.cert));
  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(cert),
    cadeia,
    cnpj,
    titular: cn.replace(/:\d{14}$/, ''),
    validade: cert.validity.notAfter,
  };
}

const certificado = lerCertificado();

const agente = new https.Agent({
  key: certificado.chavePem,
  cert: [certificado.certPem, ...certificado.cadeia].join('\n'),
  ...(cfg.caPath
    ? { ca: fs.readFileSync(cfg.caPath) }
    : // sem a cadeia ICP-Brasil o Node não reconhece o servidor da SEFAZ
      { rejectUnauthorized: false }),
  keepAlive: true,
});

// ---------- estado do NSU ----------

function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(cfg.nsuFile, 'utf8'));
  } catch {
    return { ultNSU: '0', maxNSU: '0', bloqueadoAte: null, atualizado: null };
  }
}

function salvarEstado(estado) {
  fs.writeFileSync(cfg.nsuFile, JSON.stringify(estado, null, 2));
}

// ---------- SOAP ----------

function soap(url, action, corpo) {
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        agent: agente,
        timeout: 60_000,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
          'Content-Length': Buffer.byteLength(xml),
        },
      },
      (res) => {
        const partes = [];
        res.on('data', (p) => partes.push(p));
        res.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8');
          if (res.statusCode >= 400) reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}: ${tag(texto, 'soap:Text') || texto.slice(0, 300)}`));
          else resolve(texto);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('A SEFAZ não respondeu em 60 segundos.')));
    req.on('error', reject);
    req.end(xml);
  });
}

function tag(xml, nome) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1] : '';
}

const nsu15 = (n) => String(n).replace(/\D/g, '').padStart(15, '0');

// ---------- Distribuição DF-e ----------

async function distDFe(consulta) {
  const corpo =
    '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>' +
    '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">' +
    `<tpAmb>${tpAmb}</tpAmb><cUFAutor>${cfg.ufAutor}</cUFAutor><CNPJ>${certificado.cnpj}</CNPJ>${consulta}` +
    '</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>';
  const resposta = await soap(
    URLS.dist,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse',
    corpo,
  );
  const ret = tag(resposta, 'retDistDFeInt');
  if (!ret) throw new Error('Resposta da SEFAZ sem retDistDFeInt.');
  const docs = [...ret.matchAll(/<docZip NSU="(\d+)" schema="([^"]+)">([^<]+)<\/docZip>/g)].map(([, nsu, schema, b64]) =>
    lerDocumento(nsu, schema, zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')),
  );
  return {
    cStat: tag(ret, 'cStat'),
    xMotivo: tag(ret, 'xMotivo'),
    ultNSU: tag(ret, 'ultNSU'),
    maxNSU: tag(ret, 'maxNSU'),
    documentos: docs,
  };
}

function lerDocumento(nsu, schema, xml) {
  const tipo = schema.split('_')[0]; // resNFe, procNFe, resEvento, procEventoNFe
  const resumo =
    tipo === 'procNFe'
      ? {
          chave: (xml.match(/Id="NFe(\d{44})"/) || [])[1] || '',
          emitenteCnpj: tag(tag(xml, 'emit'), 'CNPJ'),
          emitente: tag(tag(xml, 'emit'), 'xNome'),
          numero: tag(xml, 'nNF'),
          valor: Number(tag(tag(xml, 'ICMSTot'), 'vNF') || 0),
          emissao: tag(xml, 'dhEmi'),
        }
      : tipo === 'resNFe'
        ? {
            chave: tag(xml, 'chNFe'),
            emitenteCnpj: tag(xml, 'CNPJ'),
            emitente: tag(xml, 'xNome'),
            valor: Number(tag(xml, 'vNF') || 0),
            emissao: tag(xml, 'dhEmi'),
            situacao: { 1: 'autorizada', 2: 'denegada', 3: 'cancelada' }[tag(xml, 'cSitNFe')] || tag(xml, 'cSitNFe'),
          }
        : {
            chave: tag(xml, 'chNFe'),
            evento: tag(xml, 'tpEvento'),
            descricao: tag(xml, 'xEvento') || tag(xml, 'descEvento'),
            data: tag(xml, 'dhEvento'),
          };
  fs.mkdirSync(cfg.xmlDir, { recursive: true });
  fs.writeFileSync(path.join(cfg.xmlDir, `${nsu15(nsu)}-${tipo}${resumo.chave ? '-' + resumo.chave : ''}.xml`), xml);
  return { nsu: nsu15(nsu), schema, tipo, ...resumo, xml };
}

// ---------- Manifestação do destinatário ----------

function agoraNoFuso() {
  const [, sinal, hh, mm] = cfg.fuso.match(/([+-])(\d\d):(\d\d)/);
  const desloc = (sinal === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm));
  return new Date(Date.now() + desloc * 60_000).toISOString().slice(0, 19) + cfg.fuso;
}

function assinar(xml) {
  const sig = new SignedXml({
    privateKey: certificado.chavePem,
    publicCert: certificado.certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='infEvento']", action: 'after' } });
  return sig.getSignedXml();
}

function montarEvento(chave, tipo, justificativa) {
  const ev = EVENTOS[tipo];
  const id = `ID${ev.tp}${chave}01`;
  const xJust = tipo === 'nao_realizada' ? `<xJust>${escapar(justificativa)}</xJust>` : '';
  const evento =
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}">` +
    `<cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${certificado.cnpj}</CNPJ><chNFe>${chave}</chNFe>` +
    `<dhEvento>${agoraNoFuso()}</dhEvento><tpEvento>${ev.tp}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>${ev.desc}</descEvento>${xJust}</detEvento></infEvento></evento>`;
  return assinar(evento).replace(/^<\?xml[^>]*\?>/, '');
}

async function manifestar(chave, tipo, justificativa) {
  const lote =
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote>` +
    montarEvento(chave, tipo, justificativa) +
    '</envEvento>';
  const resposta = await soap(
    URLS.evento,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF',
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${lote}</nfeDadosMsg>`,
  );
  const ret = tag(resposta, 'retEvento') || resposta;
  return {
    cStat: tag(ret, 'cStat'),
    xMotivo: tag(ret, 'xMotivo'),
    protocolo: tag(ret, 'nProt'),
    lote: { cStat: tag(tag(resposta, 'retEnvEvento'), 'cStat'), xMotivo: tag(tag(resposta, 'retEnvEvento'), 'xMotivo') },
  };
}

function escapar(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- HTTP ----------

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', cfg.cors);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (_req, res) => {
  res.type('html').send(
    '<!doctype html><meta charset="utf-8"><title>ZARO SEFAZ</title>' +
      '<body style="font-family:system-ui;max-width:560px;margin:48px auto;padding:0 16px">' +
      '<h1>ZARO · SEFAZ</h1><p>Servidor no ar. Deixe a janela preta aberta.</p>' +
      `<p>Ambiente: <b>${cfg.producao ? 'produção' : 'homologação'}</b></p>` +
      '<p>No ZARO, vá em Configurações &gt; Integrações &gt; SEFAZ e cole o endereço e o token mostrados na janela.</p></body>',
  );
});

function exigirToken(req, res, next) {
  const recebido = Buffer.from((req.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  const esperado = Buffer.from(cfg.token);
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return res.status(401).json({ erro: 'Token inválido.' });
  }
  next();
}

app.use(exigirToken);

app.get('/status', (_req, res) => {
  const estado = lerEstado();
  res.json({
    ok: true,
    ambiente: cfg.producao ? 'producao' : 'homologacao',
    uf: cfg.ufAutor,
    cnpj: certificado.cnpj,
    titular: certificado.titular,
    certificadoValidoAte: certificado.validade,
    certificadoVencido: certificado.validade < new Date(),
    ...estado,
  });
});

// Busca tudo o que chegou desde o último NSU. A SEFAZ entrega até 50 documentos
// por consulta; repetimos até alcançar o maxNSU (no máximo 20 voltas por chamada).
app.post('/dfe/sincronizar', async (req, res) => {
  const estado = lerEstado();
  if (estado.bloqueadoAte && new Date(estado.bloqueadoAte) > new Date() && !req.query.forcar) {
    return res.status(429).json({
      erro: 'Não há documentos novos. A SEFAZ pede 1 hora de intervalo antes de consultar de novo.',
      tenteDepoisDe: estado.bloqueadoAte,
    });
  }
  const documentos = [];
  try {
    for (let volta = 0; volta < 20; volta++) {
      const r = await distDFe(`<distNSU><ultNSU>${nsu15(estado.ultNSU)}</ultNSU></distNSU>`);
      if (r.cStat === '656') {
        estado.bloqueadoAte = new Date(Date.now() + 60 * 60_000).toISOString();
        salvarEstado(estado);
        return res.status(429).json({ erro: r.xMotivo, cStat: r.cStat, tenteDepoisDe: estado.bloqueadoAte, documentos });
      }
      if (r.cStat !== '137' && r.cStat !== '138') {
        return res.status(502).json({ erro: r.xMotivo, cStat: r.cStat, documentos });
      }
      documentos.push(...r.documentos);
      estado.ultNSU = r.ultNSU || estado.ultNSU;
      estado.maxNSU = r.maxNSU || estado.maxNSU;
      estado.atualizado = new Date().toISOString();
      const fim = r.cStat === '137' || BigInt(estado.ultNSU) >= BigInt(estado.maxNSU);
      estado.bloqueadoAte = fim ? new Date(Date.now() + 60 * 60_000).toISOString() : null;
      salvarEstado(estado);
      if (fim) break;
    }
    res.json({ ok: true, ultNSU: estado.ultNSU, maxNSU: estado.maxNSU, total: documentos.length, documentos });
  } catch (e) {
    res.status(502).json({ erro: e.message, documentos });
  }
});

app.get('/dfe/nsu/:nsu', async (req, res) => {
  try {
    res.json(await distDFe(`<consNSU><NSU>${nsu15(req.params.nsu)}</NSU></consNSU>`));
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});

app.get('/dfe/chave/:chave', async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, '');
  if (chave.length !== 44) return res.status(400).json({ erro: 'A chave precisa ter 44 dígitos.' });
  try {
    res.json(await distDFe(`<consChNFe><chNFe>${chave}</chNFe></consChNFe>`));
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});

// body: { chave, tipo: ciencia | confirmacao | desconhecimento | nao_realizada, justificativa? }
app.post('/manifestacao', async (req, res) => {
  const chave = String(req.body?.chave || '').replace(/\D/g, '');
  const tipo = String(req.body?.tipo || 'ciencia');
  const justificativa = String(req.body?.justificativa || '').trim();
  if (chave.length !== 44) return res.status(400).json({ erro: 'A chave precisa ter 44 dígitos.' });
  if (!EVENTOS[tipo]) return res.status(400).json({ erro: `Tipo inválido. Use: ${Object.keys(EVENTOS).join(', ')}.` });
  if (tipo === 'nao_realizada' && (justificativa.length < 15 || justificativa.length > 255)) {
    return res.status(400).json({ erro: 'A justificativa precisa ter de 15 a 255 caracteres.' });
  }
  try {
    const r = await manifestar(chave, tipo, justificativa);
    // 135 = registrado; 573 = já registrado antes
    res.status(r.cStat === '135' || r.cStat === '573' ? 200 : 502).json(r);
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});

app.listen(cfg.porta, () => {
  console.log(` Servidor ZARO SEFAZ em http://localhost:${cfg.porta}`);
  console.log(` Empresa: ${certificado.titular} · CNPJ ${certificado.cnpj}`);
  console.log(` Ambiente: ${cfg.producao ? 'PRODUÇÃO' : 'homologação'}`);
  if (certificado.validade < new Date()) console.log(' [ATENÇÃO] O certificado está vencido.');
  if (!cfg.caPath) console.log(' [aviso] SEFAZ_CA_PATH vazio: o certificado do servidor da SEFAZ não está sendo verificado.');
});

function sair(msg) {
  console.error(` [ERRO] ${msg}`);
  process.exit(1);
}
