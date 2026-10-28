// ZARO IA: assistente executivo que responde só com os números da empresa ativa.
// Recebe um resumo calculado no servidor (com fonte, período e link de cada número) e o histórico
// da conversa; nunca recebe dados de outra empresa. Mesma chamada da Anthropic usada no Conselho.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { chamarIa } from './ia-erros';
import type { Db } from '@/db';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { contextoIa } from './inteligencia';
import { compPadrao, dadosDoPainel, resumoParaIa } from './painel';
import { atenderPedido, respostaEmMarkdown } from './pedidos';

export interface Mensagem {
  papel: 'usuario' | 'ia';
  texto: string;
}


export const iaDisponivel = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function perguntarZaroIa(db: Db, u: Usuario, emp: Empresa, historico: Mensagem[], area?: string): Promise<string> {
  const conversa = historico.filter((m) => m.texto?.trim()).slice(-12).map((m) => ({ ...m, texto: m.texto.slice(0, 4000) }));
  const ultima = conversa[conversa.length - 1];
  if (!ultima || ultima.papel !== 'usuario') throw new Error('Escreva uma pergunta.');
  // pedido de balancete, DRE ou balanço: a ZARO gera direto, com os números calculados (não depende da IA)
  const pedido = await atenderPedido(db, u, emp, ultima.texto);
  if (pedido?.tipo === 'demonstracao') return respostaEmMarkdown(pedido);
  if (!iaDisponivel()) {
    if (pedido) return respostaEmMarkdown(pedido);
    throw new Error('A ZARO IA ainda não está ligada: falta configurar a chave da Anthropic (ANTHROPIC_API_KEY) no servidor. Pedidos de balancete, DRE e balanço já funcionam (ex.: “balancete de 2026 até setembro”).');
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const dados = await dadosDoPainel(db, u, emp, compPadrao(hoje), hoje);
  const extra = area ? await contextoIa(db, u, emp, hoje, area) : '';
  const sistema = [
    'Você é a ZARO IA, assistente executiva de um sistema contábil brasileiro. Responda em português do Brasil, direto, para um gestor ou contador.',
    'Use SOMENTE os dados abaixo, que são da empresa selecionada. Não invente números, clientes, datas ou causas.',
    'Em cada resposta: cite os valores usados, diga a fonte (ex.: títulos em aberto, extrato, DRE) e o período, e inclua o link interno em Markdown no formato [texto](/caminho) usando os links fornecidos.',
    'Diferencie saldo efetivo (banco), valores apurados (títulos lançados) e projeções. Recebimento futuro não é caixa.',
    'Se a pergunta exigir um dado que não está abaixo, diga claramente que o dado não está disponível na ZARO e o que precisa ser cadastrado ou importado. Se for prévia (lançamentos sem aprovação), avise.',
    'Não dê orientação que viole lei tributária, trabalhista ou a LGPD. Respostas curtas: até 200 palavras, listas quando ajudar.',
    '',
    'DADOS DA EMPRESA:',
    resumoParaIa(dados),
    extra ? `\nDADOS DA ÁREA:\n${extra}` : '',
  ].join('\n');
  const client = new Anthropic();
  const r = await chamarIa(() => client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: sistema,
    messages: conversa.map((m) => ({ role: m.papel === 'usuario' ? ('user' as const) : ('assistant' as const), content: m.texto })),
  }));
  if (r.stop_reason === 'refusal') throw new Error('A ZARO IA não pôde responder esta pergunta. Reformule.');
  const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
  if (!texto) throw new Error('A ZARO IA não devolveu resposta. Tente de novo.');
  await auditar(db, u, { empresaId: emp.id, acao: 'Perguntou à ZARO IA', entidade: ultima.texto.slice(0, 120) });
  return texto;
}
