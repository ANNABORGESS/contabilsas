// Regras do registro e do planejamento de pagamentos (Contas a Pagar).
import { addDias, arred, dividir } from './dinheiro';
import { ehTributo } from './painel';

/** Formas de pagamento e os campos que cada uma pede (guardados em baixas.dados). */
export const FORMAS = {
  PIX: [['chavePix', 'Chave Pix'], ['tipoChave', 'Tipo da chave'], ['favorecido', 'Favorecido'], ['docFavorecido', 'CPF/CNPJ'], ['banco', 'Banco'], ['idTransacao', 'ID da transação']],
  Cartão: [['bandeira', 'Bandeira'], ['final', 'Final do cartão'], ['parcelas', 'Parcelas no cartão'], ['autorizacao', 'Código de autorização']],
  Dinheiro: [['recebedor', 'Entregue a'], ['recibo', 'Nº do recibo']],
  Transferência: [['favorecido', 'Favorecido'], ['docFavorecido', 'CPF/CNPJ'], ['banco', 'Banco'], ['agencia', 'Agência'], ['contaDestino', 'Conta'], ['idTransacao', 'ID / autenticação']],
  Boleto: [['linhaDigitavel', 'Linha digitável'], ['autenticacao', 'Autenticação bancária']],
  Outros: [['descricao', 'Como foi pago']],
} as const;
export type Forma = keyof typeof FORMAS;
export const TIPOS_CHAVE_PIX = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Aleatória'];

/** Saída de caixa do pagamento: principal − desconto + juros + multa. */
export function valorFinal(v: { valor: number; desconto?: number; juros?: number; multa?: number }) {
  return arred(v.valor - (v.desconto || 0) + (v.juros || 0) + (v.multa || 0));
}

/** Confere os números do pagamento contra o saldo do título; devolve a mensagem do primeiro problema. */
export function conferirPagamento(saldo: number, v: { valor: number; desconto: number; juros: number; multa: number }) {
  if (!(v.valor > 0)) return 'Informe o valor pago.';
  if ([v.desconto, v.juros, v.multa].some((x) => x < 0)) return 'Desconto, juros e multa não podem ser negativos.';
  if (v.valor > saldo + 0.009) return `O valor pago (${v.valor.toFixed(2)}) é maior que o saldo em aberto (${saldo.toFixed(2)}).`;
  if (v.desconto > v.valor) return 'O desconto não pode ser maior que o valor pago.';
  return null;
}

export type Prioridade = 'Alta' | 'Média' | 'Baixa';

/** Prioridade do pagamento: vencido, marcado como prioritário ou tributo perto do vencimento é alta. */
export function prioridade(t: { venc: string | null; nome: string; categoria?: string | null; descricao?: string | null; prioritario?: boolean }, hoje: string): { nivel: Prioridade; motivo: string } {
  if (t.prioritario) return { nivel: 'Alta', motivo: 'marcado como prioritário' };
  if (!t.venc) return { nivel: 'Média', motivo: 'sem vencimento' };
  const dias = Math.round((Date.parse(t.venc) - Date.parse(hoje)) / 864e5);
  if (dias < 0) return { nivel: 'Alta', motivo: `vencido há ${-dias}d` };
  if (ehTributo(t) && dias <= 7) return { nivel: 'Alta', motivo: `tributo vence em ${dias}d` };
  if (dias <= 3) return { nivel: 'Alta', motivo: dias === 0 ? 'vence hoje' : `vence em ${dias}d` };
  if (dias <= 7) return { nivel: 'Média', motivo: `vence em ${dias}d` };
  return { nivel: 'Baixa', motivo: `vence em ${dias}d` };
}

/** Divide o saldo em n parcelas mensais a partir do vencimento informado (centavos na última). */
export function parcelar(saldo: number, n: number, primeiroVenc: string) {
  if (!(n >= 2 && n <= 60)) throw new Error('Informe de 2 a 60 parcelas.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiroVenc)) throw new Error('Informe o vencimento da 1ª parcela.');
  const [a, m, d] = primeiroVenc.split('-').map(Number);
  return dividir(saldo, n).map((valor, i) => {
    const ultimo = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate();
    const venc = new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimo))).toISOString().slice(0, 10);
    return { parcela: `${i + 1}/${n}`, valor, venc };
  });
}

/** Nova data de programação: +7 dias a partir da data já programada (ou de hoje/vencimento). */
export const reagendar7 = (programado: string | null | undefined, venc: string | null, hoje: string) => addDias(programado || (venc && venc > hoje ? venc : hoje), 7);

/** Etapas do fluxo, na ordem da tela. */
export const ETAPAS_FLUXO = ['Título lançado', 'Análise', 'Priorização', 'Aprovação', 'Programação', 'Pagamento', 'Conciliação', 'Contabilização'] as const;

/** Até qual etapa o título chegou (índice em ETAPAS_FLUXO). */
export function etapaAtingida(t: { alertas: number; etapa: string }) {
  const mapa: Record<string, number> = { 'Título preparado': t.alertas ? 0 : 2, Rejeitado: 1, Aprovado: 3, Agendado: 4, Pago: 5, Conciliado: 6, Contabilizado: 7 };
  return mapa[t.etapa] ?? 2;
}
