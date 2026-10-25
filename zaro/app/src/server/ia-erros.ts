// Traduz as falhas da API da Anthropic para mensagens que o usuário consegue resolver.
import 'server-only';

export async function chamarIa<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) throw new Error('A chave da Anthropic (ANTHROPIC_API_KEY) configurada não é válida ou não tem acesso. Confira a chave nas configurações da Vercel.');
    if (status === 429) throw new Error('Limite de uso da IA atingido no momento. Tente de novo em alguns minutos.');
    if (status && status >= 500) throw new Error('O serviço de IA está instável agora. Tente de novo em instantes.');
    if (/ECONN|ETIMEDOUT|fetch failed|Connection error/i.test(String((e as Error).message))) throw new Error('Não foi possível falar com o serviço de IA (conexão). Tente de novo.');
    throw e;
  }
}
