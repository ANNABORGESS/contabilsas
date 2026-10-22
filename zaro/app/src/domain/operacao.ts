// O que uma nota fiscal significa para a empresa: venda (Contas a Receber), compra
// (Contas a Pagar), retorno sem efeito no caixa ou nota cancelada. E quais títulos ela gera.
import { addDias, arred, soDigitos } from './dinheiro';
import type { NotaFiscal } from './nfe';

export type Direcao = 'saida' | 'entrada' | 'terceiros';

// Remessa, retorno, conserto, industrialização, demonstração, bonificação e transferência
// de material de uso: CFOP x.90x, x.91x, x.92x, x.949 e x.55x. Não geram caixa nem receita.
const CFOP_RETORNO = /^[1-7](9(0\d|1\d|2\d|49)|55\d)$/;
const NATUREZA_RETORNO = /remessa|retorno|devolu[cç]|conserto|industrializa|comodato|demonstra|bonifica/i;

export function ehCfopRetorno(cfop: string): boolean {
  return CFOP_RETORNO.test(soDigitos(cfop));
}

export function ehRetorno(nf: Pick<NotaFiscal, 'itens' | 'dados'>): boolean {
  if (NATUREZA_RETORNO.test(nf.dados.natureza || '')) return true;
  const cfops = nf.itens.map((i) => i.cfop).filter(Boolean);
  return cfops.length > 0 && cfops.every(ehCfopRetorno);
}

export function direcaoDaNota(nf: Pick<NotaFiscal, 'dados'>, cnpjEmpresa: string): Direcao {
  const emp = soDigitos(cnpjEmpresa);
  if (!emp) return 'terceiros';
  if (soDigitos(nf.dados.emitCnpj) === emp) return 'saida';
  if (soDigitos(nf.dados.cliDoc) === emp) return 'entrada';
  return 'terceiros';
}

export const notaCancelada = (nf: Pick<NotaFiscal, 'dados'>, chavesCanceladas: Set<string> = new Set()) =>
  nf.dados.vNF <= 0 || chavesCanceladas.has(nf.dados.chave);

export interface TituloGerado {
  tipo: 'pagar' | 'receber';
  parcela: string;
  venc: string | null;
  valor: number;
  valorFiscal: number;
  status: string;
  retorno: boolean;
  impactaCaixa: boolean;
  vencEstimado: boolean;
  notaVenc: string;
  categoria: string;
  contaContabil: string;
}

export interface OpcoesTitulos {
  /** empresa que trabalha sob encomenda: compra de material vai direto para custo */
  semEstoque?: boolean;
}

export function titulosDaNota(nf: NotaFiscal, direcao: Exclude<Direcao, 'terceiros'>, opcoes: OpcoesTitulos = {}): TituloGerado[] {
  if (notaCancelada(nf)) return [];
  const tipo = direcao === 'saida' ? 'receber' : 'pagar';
  const d = nf.dados;
  const servico = nf.tipo === 'NFS-e' || /servi/i.test(d.natureza);
  const categoria = tipo === 'receber' ? (servico ? 'Serviço prestado' : 'Venda de mercadoria') : servico ? 'Serviço de terceiros' : 'Compra de material';
  const contaContabil = tipo === 'receber' ? '3.1.1.01' : servico ? '4.1.3.06' : opcoes.semEstoque === false ? '1.1.3.01' : '4.1.1.01';
  const base = { tipo, categoria, contaContabil } as const;

  if (ehRetorno(nf)) {
    return [{ ...base, parcela: '1/1', venc: null, valor: 0, valorFiscal: d.vNF, status: 'Retorno', retorno: true, impactaCaixa: false, vencEstimado: false, notaVenc: 'Nota de retorno: sem impacto no caixa' }];
  }

  const aberto = tipo === 'receber' ? 'A receber' : 'A pagar';
  const liquido = d.vLiq || d.vNF;
  const dups = nf.parcelas.filter((p) => p.venc && p.valor > 0);
  if (dups.length) {
    return dups.map((p, i) => ({
      ...base, parcela: `${i + 1}/${dups.length}`, venc: p.venc, valor: arred(p.valor), valorFiscal: i === 0 ? d.vNF : 0,
      status: aberto, retorno: false, impactaCaixa: true, vencEstimado: false, notaVenc: `Duplicata ${p.n || i + 1} da NF`,
    }));
  }
  const avista = d.condicao === 'À vista' && !!d.emissao;
  const venc = d.emissao ? (avista ? d.emissao : addDias(d.emissao, 30)) : null;
  return [{
    ...base, parcela: '1/1', venc, valor: arred(liquido), valorFiscal: d.vNF, status: aberto, retorno: false, impactaCaixa: true, vencEstimado: true,
    notaVenc: avista ? 'Pagamento à vista: vencimento na emissão. Revise.' : 'NF sem duplicata: vencimento estimado em emissão + 30 dias. Revise.',
  }];
}
