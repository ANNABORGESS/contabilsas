// Mensagens SOAP dos webservices da NF-e (Ambiente Nacional e SEFAZ-AM) e leitura das respostas.
// Mesmas mensagens do servidor-sefaz local; aqui o ZARO online fala direto com a SEFAZ.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export type Ambiente = 'producao' | 'homologacao';

export function urls(amb: Ambiente) {
  const prod = amb === 'producao';
  const am = prod ? 'https://nfe.sefaz.am.gov.br/services2/services/' : 'https://homnfe.sefaz.am.gov.br/services2/services/';
  return {
    tpAmb: prod ? '1' : '2',
    distribuicao: prod ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    evento: prod ? 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx' : 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    amStatus: am + 'NfeStatusServico4', amConsulta: am + 'NfeConsulta4', amCadastro: am + 'CadConsultaCadastro4',
  };
}

export const NS = {
  dist: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe',
  status: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4',
  consulta: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4',
  cadastro: 'http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4',
  evento: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4',
};

export const envelope = (body: string) => `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;

export const tag = (xml: string, t: string) => (xml.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`)) || [])[1] || '';
export const so = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export function corpoDistribuicao(tpAmb: string, cnpj: string, filtro: { ultNSU: string } | { chave: string }) {
  const f = 'chave' in filtro ? `<consChNFe><chNFe>${filtro.chave}</chNFe></consChNFe>` : `<distNSU><ultNSU>${filtro.ultNSU.padStart(15, '0')}</ultNSU></distNSU>`;
  const dist = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>13</cUFAutor><CNPJ>${cnpj}</CNPJ>${f}</distDFeInt>`;
  return `<nfeDistDFeInteresse xmlns="${NS.dist}"><nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse>`;
}

export interface DocDistribuido {
  nsu: string;
  schema: string;
  tipo: string; // nfe, resumo, evento
  chave: string;
  cancelada: boolean;
  xml: string;
}

/** Lê a resposta da distribuição DF-e: cada docZip vem em gzip + base64. */
export function lerDistribuicao(resposta: string) {
  const r = /&lt;docZip/.test(resposta) ? resposta.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : resposta;
  const docs: DocDistribuido[] = [...r.matchAll(/<(?:\w+:)?docZip\b([^>]*)>([^<]+)<\/(?:\w+:)?docZip>/g)].map((x) => {
    const at = (n: string) => (x[1].match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || '';
    let xml = '';
    try {
      xml = zlib.gunzipSync(Buffer.from(x[2].trim(), 'base64')).toString('utf8');
    } catch {
      xml = '';
    }
    const schema = at('schema');
    const chave = (xml.match(/<chNFe>(\d{44})<\/chNFe>/) || xml.match(/Id="NFe(\d{44})"/) || [])[1] || '';
    const tipo = /^procNFe/.test(schema) ? 'nfe' : /^resNFe/.test(schema) ? 'resumo' : /^procEventoNFe|^resEvento/.test(schema) ? 'evento' : schema;
    return { nsu: at('NSU'), schema, tipo, chave, cancelada: tipo === 'evento' && /<tpEvento>110111<\/tpEvento>/.test(xml), xml };
  });
  return { cStat: tag(r, 'cStat'), motivo: tag(r, 'xMotivo'), ultNSU: tag(r, 'ultNSU'), maxNSU: tag(r, 'maxNSU'), docs };
}

export const MANIFESTACAO = { ciencia: ['210210', 'Ciencia da Operacao'], confirmacao: ['210200', 'Confirmacao da Operacao'], desconhecimento: ['210220', 'Desconhecimento da Operacao'], naoRealizada: ['210240', 'Operacao nao Realizada'] } as const;
export type TipoManifestacao = keyof typeof MANIFESTACAO;

/** Hora oficial de Manaus (UTC−4) no formato que a SEFAZ exige. */
export const dataEvento = (agora = new Date()) => `${new Date(agora.getTime() - 4 * 3600000).toISOString().slice(0, 19)}-04:00`;

export function eventoManifestacao(tpAmb: string, cnpj: string, chave: string, tipo: TipoManifestacao, justificativa = '', agora = new Date()) {
  const [cod, desc] = MANIFESTACAO[tipo];
  const id = `ID${cod}${chave}01`;
  const just = tipo === 'naoRealizada' ? `<xJust>${justificativa.replace(/[<>&]/g, ' ').slice(0, 255)}</xJust>` : '';
  const xml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dataEvento(agora)}</dhEvento><tpEvento>${cod}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${desc}</descEvento>${just}</detEvento></infEvento></evento>`;
  return { id, xml };
}

// ——— cofre: AES-256-GCM (chave de 32 bytes guardada fora do banco) ———
export function cifrar(chave: Buffer, dados: Buffer) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const ct = Buffer.concat([c.update(dados), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
}

export function decifrar(chave: Buffer, texto: string) {
  if (!texto.startsWith('v1:')) throw new Error('Formato do cofre desconhecido.');
  const b = Buffer.from(texto.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chave, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}
