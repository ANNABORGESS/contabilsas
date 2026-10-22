// Conselho ZARO: sete conselheiros simulados, inspirados nas ideias públicas de empresários,
// votam sobre uma decisão usando os números da empresa; um moderador escreve o veredito.
// A chamada à API da Anthropic acontece só aqui, no servidor (chave em ANTHROPIC_API_KEY).
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { dre } from '@/domain/demonstracoes';
import { regimeEm } from '@/domain/regime';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { lancamentosDaEmpresa } from './contabil';
import { resumoFinanceiro } from './consultas';

export const CONSELHEIROS = [
  ['bezos', 'Jeff Bezos', 'Cliente em primeiro lugar e longo prazo', 'obsessão pelo cliente, decisões reversíveis (porta de duas vias) vs. irreversíveis, arrependimento mínimo'],
  ['graham', 'Paul Graham', 'Startups e foco', 'fazer algo que as pessoas querem, fazer coisas que não escalam, conversar direto com clientes'],
  ['hormozi', 'Alex Hormozi', 'Oferta e aquisição', 'equação de valor, oferta irresistível, volume de ação, preço premium e margem; números primeiro'],
  ['garyvee', 'Gary V', 'Atenção e execução', 'paciência no longo prazo e impaciência no curto, atenção do mercado, execução sem desculpas'],
  ['martell', 'Dan Martell', 'Comprar tempo de volta', 'delegar o que drena energia, contratar para liberar o dono, sistemas'],
  ['wickman', 'Gino Wickman', 'Tração e sistema (EOS)', 'visão, pessoas certas nos lugares certos, scorecard semanal, rocks trimestrais, disciplina de reuniões'],
  ['buffett', 'Warren Buffett', 'Valor e risco', 'margem de segurança, círculo de competência, evitar dívida, proteger caixa, retorno sobre capital'],
] as const;

export interface Voto {
  conselheiro: string;
  voto: 'A FAVOR' | 'CONTRA' | 'DEPENDE';
  argumento: string;
}
export interface Parecer {
  pergunta: string;
  quando: string;
  votos: Voto[];
  veredito: string;
  proximosPassos: string[];
  placar: string;
}

const FORMATO = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['votos', 'veredito', 'proximosPassos'],
    properties: {
      votos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['conselheiro', 'voto', 'argumento'],
          properties: {
            conselheiro: { type: 'string', enum: CONSELHEIROS.map((c) => c[0]) },
            voto: { type: 'string', enum: ['A FAVOR', 'CONTRA', 'DEPENDE'] },
            argumento: { type: 'string' },
          },
        },
      },
      veredito: { type: 'string' },
      proximosPassos: { type: 'array', items: { type: 'string' } },
    },
  },
};

async function numerosDaEmpresa(db: Db, emp: Empresa) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ano = hoje.slice(0, 4);
  const [fin, lancs, dividas, contratos] = await Promise.all([
    resumoFinanceiro(db, emp.id, hoje),
    lancamentosDaEmpresa(db, emp),
    db.select().from(schema.dividasAtivas).where(eq(schema.dividasAtivas.empresaId, emp.id)),
    db.select().from(schema.contratosDivida).where(and(eq(schema.contratosDivida.empresaId, emp.id))),
  ]);
  const d = dre(lancs, { de: `${ano}-01`, ate: `${ano}-12` }, true);
  const linha = (r: string) => d.linhas.find((l) => l.rotulo.startsWith(r))?.valor || 0;
  return [
    `Empresa: ${emp.razao}${emp.fantasia ? ` (${emp.fantasia})` : ''}, ${emp.cidade || ''}/${emp.uf || ''}. Atividade: ${emp.cnae || 'não informada'}.`,
    `Regime hoje: ${regimeEm(emp, hoje) || 'não informado'}.${emp.semEstoque ? ' Trabalha sob encomenda, sem estoque.' : ''}`,
    `Resultado ${ano} até agora (prévia, inclui lançamentos ainda não aprovados): receita líquida ${brl(linha('Receita líquida'))}, lucro bruto ${brl(linha('Lucro bruto'))}, resultado ${brl(d.resultado)}.`,
    `Contas a receber em aberto: ${brl(fin.receber.total)} (${fin.receber.n} títulos; vencidos ${brl(fin.receberVencido.total)}).`,
    `Contas a pagar em aberto: ${brl(fin.pagar.total)} (${fin.pagar.n} títulos; vencidos ${brl(fin.pagarVencido.total)}).`,
    `Dívida ativa na PGFN: ${brl(dividas.reduce((a, x) => a + (x.valor || 0), 0))} em ${dividas.length} inscrição(ões).`,
    `Empréstimos contratados ativos: ${brl(contratos.filter((c) => !/cancel|quitad/i.test(c.status)).reduce((a, c) => a + c.valor, 0))}.`,
  ].join('\n');
}

export async function consultarConselho(db: Db, u: Usuario, emp: Empresa, pergunta: string): Promise<Parecer> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error('O Conselho precisa de uma chave da Anthropic: coloque ANTHROPIC_API_KEY no arquivo .env do ZARO e reinicie.');
  }
  const q = pergunta.trim();
  if (q.length < 10) throw new Error('Descreva a decisão com um pouco mais de detalhe.');
  const numeros = await numerosDaEmpresa(db, emp);
  const client = new Anthropic();
  const sistema = [
    'Você é o moderador do Conselho ZARO, um conselho consultivo simulado para pequenas e médias empresas brasileiras.',
    'Simule sete conselheiros, cada um raciocinando a partir das ideias que esse empresário defende publicamente. São simulações: não invente citações nem apresente frases como ditas pela pessoa real.',
    'Conselheiros e o foco de cada um:',
    ...CONSELHEIROS.map((c) => `- ${c[0]} (${c[1]}, ${c[2]}): ${c[3]}`),
    'Cada conselheiro vota A FAVOR, CONTRA ou DEPENDE e explica em 2 a 4 frases, citando os números da empresa quando forem relevantes. Discordância é bem-vinda.',
    'Depois, como moderador, escreva o veredito em um parágrafo (a recomendação, o principal risco e a condição que mudaria a resposta) e de 3 a 5 próximos passos concretos.',
    'Escreva tudo em português do Brasil, direto e sem jargão. Não recomende nada que viole lei trabalhista, tributária ou a LGPD.',
  ].join('\n');

  const r = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: FORMATO },
    system: sistema,
    messages: [{ role: 'user', content: `Números da empresa:\n${numeros}\n\nDecisão em pauta:\n${q}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('A IA não quis opinar sobre esta pergunta. Reformule a decisão.');
  if (r.stop_reason === 'max_tokens') throw new Error('A resposta ficou longa demais. Tente uma pergunta mais objetiva.');
  const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let j: { votos: Voto[]; veredito: string; proximosPassos: string[] };
  try {
    j = JSON.parse(texto);
  } catch {
    throw new Error('A resposta da IA veio num formato inesperado. Tente de novo.');
  }
  const cont = (v: Voto['voto']) => j.votos.filter((x) => x.voto === v).length;
  const parecer: Parecer = {
    pergunta: q,
    quando: new Date().toISOString(),
    votos: j.votos,
    veredito: j.veredito,
    proximosPassos: j.proximosPassos,
    placar: `${cont('A FAVOR')} a favor · ${cont('CONTRA')} contra · ${cont('DEPENDE')} depende`,
  };
  const chave = `conselho:${emp.id}`;
  const [atual] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, u.tenantId), eq(schema.configuracoes.chave, chave)));
  const hist = [parecer, ...((atual?.valor as Parecer[]) || [])].slice(0, 20);
  await db.insert(schema.configuracoes).values({ tenantId: u.tenantId, chave, valor: hist }).onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor: hist, atualizadoEm: new Date() } });
  await auditar(db, u, { empresaId: emp.id, acao: 'Consultou o Conselho ZARO', entidade: q.slice(0, 120), depois: parecer.placar });
  return parecer;
}

export async function historicoConselho(db: Db, tenantId: string, empresaId: string): Promise<Parecer[]> {
  const [c] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, `conselho:${empresaId}`)));
  return (c?.valor as Parecer[]) || [];
}
