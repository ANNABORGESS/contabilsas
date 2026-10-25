// Especialistas (skills e agentes de contabilidade) enviados pelo escritório e consultados pela IA.
// O conteúdo licenciado fica só no banco do escritório; a chamada à Anthropic acontece só aqui no servidor.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { chamarIa } from './ia-erros';
import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { formatarCnpj } from '@/domain/dinheiro';
import type { Especialista } from '@/domain/especialistas';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { numerosDaEmpresa } from './conselho';
import { NATIVOS } from '@/domain/especialistas-nativos';
import { contextoIa } from './inteligencia';
import { compPadrao, dadosDoPainel, resumoParaIa } from './painel';

export const temChaveIA = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const curto = (v: unknown, max: number) => String(v ?? '').slice(0, max);

/** Grava um lote vindo da tela de envio (o navegador já abriu os zips). Reenviar atualiza. */
export async function salvarEspecialistas(db: Db, u: Usuario, itens: Especialista[], pacote: string) {
  const validos = (Array.isArray(itens) ? itens : [])
    .filter((e) => (e?.tipo === 'skill' || e?.tipo === 'agente') && /^[\w.-]{2,80}$/.test(String(e.slug || '')) && String(e.conteudo || '').trim().length > 50)
    .slice(0, 200);
  if (!validos.length) return 0;
  for (const e of validos) {
    const v = { nome: curto(e.nome || e.slug, 120), descricao: curto(e.descricao, 2000), conteudo: curto(e.conteudo, 130_000), pacote: curto(pacote || e.pacote, 160) };
    await db.insert(schema.especialistas).values({ tenantId: u.tenantId, tipo: e.tipo, slug: e.slug, ...v })
      .onConflictDoUpdate({ target: [schema.especialistas.tenantId, schema.especialistas.tipo, schema.especialistas.slug], set: { ...v, ativo: true, atualizadoEm: new Date() } });
  }
  await auditar(db, u, { acao: 'Enviou especialistas', entidade: curto(pacote, 160), depois: `${validos.length} especialista(s)` });
  return validos.length;
}

/** Garante que os especialistas nativos da ZARO existam no escritório (e fiquem atualizados). */
export async function garantirNativos(db: Db, tenantId: string) {
  for (const n of NATIVOS) {
    const v = { nome: n.nome, descricao: n.descricao, conteudo: n.conteudo, pacote: 'ZARO (nativo)' };
    await db.insert(schema.especialistas).values({ tenantId, tipo: n.tipo, slug: n.slug, ...v })
      .onConflictDoUpdate({ target: [schema.especialistas.tenantId, schema.especialistas.tipo, schema.especialistas.slug], set: { ...v, ativo: true } });
  }
}

export async function listarEspecialistas(db: Db, tenantId: string) {
  await garantirNativos(db, tenantId);
  return db
    .select({ id: schema.especialistas.id, tipo: schema.especialistas.tipo, slug: schema.especialistas.slug, nome: schema.especialistas.nome, descricao: schema.especialistas.descricao, pacote: schema.especialistas.pacote })
    .from(schema.especialistas)
    .where(and(eq(schema.especialistas.tenantId, tenantId), eq(schema.especialistas.ativo, true)))
    .orderBy(asc(schema.especialistas.nome));
}

export async function especialista(db: Db, tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [e] = await db.select().from(schema.especialistas).where(and(eq(schema.especialistas.id, id), eq(schema.especialistas.tenantId, tenantId)));
  return e || null;
}

export async function consultasDoEspecialista(db: Db, empresaId: string, especialistaId: string) {
  return db.select().from(schema.consultasEspecialista)
    .where(and(eq(schema.consultasEspecialista.empresaId, empresaId), eq(schema.consultasEspecialista.especialistaId, especialistaId)))
    .orderBy(desc(schema.consultasEspecialista.criadoEm)).limit(20);
}

export async function removerEspecialistas(db: Db, u: Usuario) {
  // os nativos da ZARO (e o histórico de consultas deles) ficam
  const enviados = and(eq(schema.especialistas.tenantId, u.tenantId), notInArray(schema.especialistas.slug, NATIVOS.map((x) => x.slug)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.especialistas).where(enviados);
  await db.delete(schema.especialistas).where(enviados);
  await auditar(db, u, { acao: 'Removeu os especialistas enviados', depois: `${n} removido(s)` });
}

async function contextoDaEmpresa(db: Db, u: Usuario, emp: Empresa, slug: string) {
  const hist = (emp.regimeHist || []) as { regime: string; de?: string; ate?: string }[];
  const nativo = NATIVOS.find((n) => n.slug === slug);
  const hoje = new Date().toISOString().slice(0, 10);
  // especialista nativo recebe o retrato completo: painel + áreas da Inteligência Financeira
  const extra = nativo ? [resumoParaIa(await dadosDoPainel(db, u, emp, compPadrao(hoje), hoje)), ...(await Promise.all(nativo.areas.map((a) => contextoIa(db, u, emp, hoje, a))))] : [];
  return [
    `CNPJ ${formatarCnpj(emp.cnpj)}${emp.ie ? ` · IE ${emp.ie}` : ''}.`,
    hist.length ? `Histórico de regime: ${hist.map((h) => `${h.regime}${h.de ? ` desde ${h.de}` : ''}${h.ate ? ` até ${h.ate}` : ''}`).join('; ')}. Use sempre o regime vigente na competência analisada.` : '',
    await numerosDaEmpresa(db, emp),
    ...extra,
  ].filter(Boolean).join('\n');
}

export async function perguntarEspecialista(db: Db, u: Usuario, emp: Empresa, especialistaId: string, pergunta: string, usarDados: boolean) {
  if (!temChaveIA()) throw new Error('Os especialistas precisam da chave da Anthropic: coloque ANTHROPIC_API_KEY nas configurações da Vercel (ou no .env, no computador).');
  const q = pergunta.trim();
  if (q.length < 8) throw new Error('Escreva a pergunta com um pouco mais de detalhe.');
  if (q.length > 8000) throw new Error('Pergunta longa demais: resuma em até 8.000 caracteres.');
  const e = await especialista(db, u.tenantId, especialistaId);
  if (!e) throw new Error('Especialista não encontrado.');

  const sistema = [
    `Você é o especialista "${e.nome}" e atende dentro da ZARO, o sistema contábil de um escritório de contabilidade brasileiro. As instruções da sua especialidade estão abaixo, entre <especialidade> e </especialidade>.`,
    'Regras da ZARO, que valem acima das instruções da especialidade:',
    '- Responda em português do Brasil, para um contador. Seja direto e organize com títulos curtos, listas e tabelas em Markdown.',
    '- Você não tem terminal, arquivos, Python nem acesso à internet. Não diga que salvou arquivo ou rodou código: mostre os cálculos passo a passo no texto, em tabela.',
    '- Use só os dados informados. Se faltar dado para concluir, diga exatamente o que falta e como o contador obtém.',
    '- Alíquotas, códigos de receita e prazos são rascunho de apoio: termine lembrando o que conferir na fonte oficial antes de transmitir ou pagar.',
    '- Nunca sugira nada que viole lei tributária, trabalhista ou a LGPD.',
    '',
    '<especialidade>',
    e.conteudo,
    '</especialidade>',
  ].join('\n');
  const dados = usarDados ? `Dados da empresa ativa na ZARO (${emp.razao}):\n${await contextoDaEmpresa(db, u, emp, e.slug)}\n\n` : '';

  const client = new Anthropic();
  const r = await chamarIa(() => client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: sistema,
    messages: [{ role: 'user', content: `${dados}Pergunta do contador:\n${q}` }],
  }));
  if (r.stop_reason === 'refusal') throw new Error('A IA não quis responder esta pergunta. Reformule.');
  const resposta = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim()
    + (r.stop_reason === 'max_tokens' ? '\n\n_(A resposta foi cortada por tamanho. Peça a continuação ou faça uma pergunta mais específica.)_' : '');
  if (!resposta) throw new Error('A IA não devolveu texto. Tente de novo.');
  await db.insert(schema.consultasEspecialista).values({ tenantId: u.tenantId, empresaId: emp.id, especialistaId: e.id, usuario: u.nome, pergunta: q, resposta, usouDados: usarDados });
  await auditar(db, u, { empresaId: emp.id, acao: 'Consultou especialista', entidade: `${e.nome} · ${q.slice(0, 100)}` });
}
