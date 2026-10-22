// Integração com o servidor SEFAZ (zaro/servidor-sefaz). Quem chama é o servidor do ZARO,
// não o navegador: o token fica guardado aqui e nunca vai para a tela.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { soDigitos } from '@/domain/dinheiro';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { receberArquivos } from './autopilot';

export interface ConfigSefaz {
  url: string;
  token: string;
}
export interface Resumo {
  chave: string;
  emitente: string;
  cnpjEmitente: string;
  valor: number;
  emissao: string;
}

async function lerConfig<T>(db: Db, tenantId: string, chave: string): Promise<T | null> {
  const [c] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave)));
  return (c?.valor as T) ?? null;
}
async function gravarConfig(db: Db, tenantId: string, chave: string, valor: unknown) {
  await db.insert(schema.configuracoes).values({ tenantId, chave, valor }).onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor, atualizadoEm: new Date() } });
}

export const configSefaz = (db: Db, tenantId: string) => lerConfig<ConfigSefaz>(db, tenantId, 'sefaz');

export async function salvarConfigSefaz(db: Db, u: Usuario, url: string, token: string) {
  const atual = await configSefaz(db, u.tenantId);
  const limpa = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(limpa)) throw new Error('O endereço precisa começar com http:// ou https://');
  await gravarConfig(db, u.tenantId, 'sefaz', { url: limpa, token: token.trim() || atual?.token || '' });
  await auditar(db, u, { acao: 'Configurou integração SEFAZ', depois: limpa });
}

async function chamar<T = Record<string, unknown>>(cfg: ConfigSefaz | null, caminho: string, corpo?: unknown): Promise<T> {
  if (!cfg?.url || !cfg.token) throw new Error('Configure o endereço e o token do servidor SEFAZ.');
  let r: Response;
  try {
    r = await fetch(cfg.url + caminho, {
      method: corpo ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error(`Não consegui falar com o servidor SEFAZ em ${cfg.url}. A janela do servidor está aberta?`);
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.ok === false) throw new Error(String(j.erro || `HTTP ${r.status}`));
  return j as T;
}

export async function testarSefaz(db: Db, u: Usuario, emp: Empresa) {
  const cfg = await configSefaz(db, u.tenantId);
  const st = await chamar<{ versao?: string; ambiente?: string; certificado?: { titular?: string; validade?: string } }>(cfg, '/status');
  let am = '';
  try {
    const t = await chamar<{ cStat?: string; motivo?: string }>(cfg, '/am/status', { cnpj: soDigitos(emp.cnpj) });
    am = `SEFAZ-AM: ${t.cStat} ${t.motivo || ''}`;
  } catch (e) {
    am = `SEFAZ-AM não respondeu: ${(e as Error).message}`;
  }
  return `Conectado ao servidor v${st.versao || '?'} · ${st.ambiente} · certificado ${st.certificado?.titular || '—'} até ${st.certificado?.validade || '—'}. ${am}`;
}

type DocSefaz = { tipo: string; chave: string; xml: string; cancelada?: boolean };

export async function sincronizarSefaz(db: Db, u: Usuario, emp: Empresa, reiniciar = false) {
  const cfg = await configSefaz(db, u.tenantId);
  const j = await chamar<{ docs?: DocSefaz[]; cStat?: string; motivo?: string; ultNSU?: string; aviso?: string }>(cfg, '/nfe/distribuicao', { cnpj: soDigitos(emp.cnpj), reiniciar });
  const docs = j.docs || [];
  const completas = docs.filter((d) => d.tipo === 'nfe' && d.xml);
  const res = await receberArquivos(db, u, emp, completas.map((d) => ({ nome: `NFe-${d.chave}.xml`, mime: 'text/xml', conteudo: Buffer.from(d.xml, 'utf8') })), 'SEFAZ');
  const eventos = docs.filter((d) => d.tipo === 'evento' && d.xml);
  await receberArquivos(db, u, emp, eventos.map((d, i) => ({ nome: `Evento-${d.chave}-${i}.xml`, mime: 'text/xml', conteudo: Buffer.from(d.xml, 'utf8') })), 'SEFAZ');
  const novos: Resumo[] = docs.filter((d) => d.tipo === 'resumo').map((d) => ({
    chave: d.chave, emitente: (d.xml.match(/<xNome>([^<]+)/) || [])[1] || '', cnpjEmitente: (d.xml.match(/<CNPJ>(\d{14})/) || [])[1] || '',
    valor: Number((d.xml.match(/<vNF>([\d.]+)/) || [])[1]) || 0, emissao: ((d.xml.match(/<dhEmi>([^<]+)/) || [])[1] || '').slice(0, 10),
  }));
  const chaveRes = `sefaz:resumos:${emp.id}`;
  const atuais = (await lerConfig<Resumo[]>(db, u.tenantId, chaveRes)) || [];
  await gravarConfig(db, u.tenantId, chaveRes, atuais.filter((r) => !novos.some((n) => n.chave === r.chave)).concat(novos));
  await gravarConfig(db, u.tenantId, `sefaz:ult:${emp.id}`, { em: new Date().toISOString(), nsu: j.ultNSU });
  const msg = docs.length
    ? `${docs.length} documento(s) da SEFAZ: ${completas.length} NF-e completa(s) enviadas ao Autopilot (${res.filter((r) => r.status === 'Duplicado').length} já existiam), ${novos.length} resumo(s) aguardando manifestação, ${eventos.length} evento(s).`
    : `A SEFAZ não enviou documentos novos (${j.cStat || '?'} ${j.motivo || ''}).`;
  await auditar(db, u, { empresaId: emp.id, acao: 'Sincronizou NF-e com a SEFAZ', depois: msg });
  return msg + (j.aviso ? ` ${j.aviso}` : '');
}

export const resumosSefaz = async (db: Db, tenantId: string, empresaId: string) => (await lerConfig<Resumo[]>(db, tenantId, `sefaz:resumos:${empresaId}`)) || [];
export const ultimaSincronizacao = (db: Db, tenantId: string, empresaId: string) => lerConfig<{ em: string; nsu?: string }>(db, tenantId, `sefaz:ult:${empresaId}`);

export async function manifestar(db: Db, u: Usuario, emp: Empresa, chave: string, tipo: 'ciencia' | 'confirmacao' | 'desconhecimento') {
  const cfg = await configSefaz(db, u.tenantId);
  const cnpj = soDigitos(emp.cnpj);
  const j = await chamar<{ cStat?: string; motivo?: string; protocolo?: string }>(cfg, '/nfe/manifestacao', { cnpj, chave, tipo });
  if (!/^13[5-6]$/.test(String(j.cStat))) throw new Error(`SEFAZ recusou: ${j.cStat} ${j.motivo || ''}`);
  let extra = '';
  if (tipo !== 'desconhecimento') {
    const d = await chamar<{ docs?: DocSefaz[] }>(cfg, '/nfe/chave', { cnpj, chave }).catch(() => ({ docs: [] as DocSefaz[] }));
    const xml = (d.docs || []).find((x) => x.tipo === 'nfe' && x.xml);
    if (xml) {
      await receberArquivos(db, u, emp, [{ nome: `NFe-${chave}.xml`, mime: 'text/xml', conteudo: Buffer.from(xml.xml, 'utf8') }], 'SEFAZ');
      extra = ' XML enviado ao Autopilot.';
    } else extra = ' O XML ainda não foi liberado: sincronize mais tarde.';
  }
  if (tipo === 'desconhecimento' || extra.includes('Autopilot')) {
    const chaveRes = `sefaz:resumos:${emp.id}`;
    await gravarConfig(db, u.tenantId, chaveRes, (await resumosSefaz(db, u.tenantId, emp.id)).filter((r) => r.chave !== chave));
  }
  await auditar(db, u, { empresaId: emp.id, acao: `Manifestação ${tipo} enviada à SEFAZ`, entidade: `Chave …${chave.slice(-8)}`, depois: `${j.cStat} · protocolo ${j.protocolo || '—'}` });
  return `Manifestação registrada (protocolo ${j.protocolo || '—'}).${extra}`;
}
