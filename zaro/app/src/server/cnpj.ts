// Consulta pública de CNPJ (Receita Federal via BrasilAPI, com CNPJ.ws de reserva).
import 'server-only';
import { soDigitos } from '@/domain/dinheiro';

export interface DadosCnpj {
  razao: string;
  fantasia: string;
  cidade: string;
  uf: string;
  cnae: string;
  regime: string;
  situacao: string;
  fonte: string;
}

export async function consultarCnpjPublico(cnpj: string): Promise<DadosCnpj> {
  const d = soDigitos(cnpj);
  if (d.length !== 14) throw new Error('Informe um CNPJ com 14 dígitos.');
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: AbortSignal.timeout(10000) });
    if (r.status === 404) throw new Error('CNPJ não encontrado na Receita Federal.');
    if (r.ok) {
      const j = await r.json();
      return {
        razao: j.razao_social || '', fantasia: j.nome_fantasia || '', cidade: j.municipio || '', uf: j.uf || '',
        cnae: j.cnae_fiscal ? `${j.cnae_fiscal} — ${j.cnae_fiscal_descricao || ''}` : '',
        regime: j.opcao_pelo_mei ? 'MEI' : j.opcao_pelo_simples ? 'Simples Nacional' : '', situacao: j.descricao_situacao_cadastral || '', fonte: 'BrasilAPI (Receita Federal)',
      };
    }
  } catch (e) {
    if (/não encontrado/.test((e as Error).message)) throw e;
  }
  const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${d}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r2 || !r2.ok) throw new Error(r2?.status === 429 ? 'Limite de consultas atingido: aguarde 1 minuto.' : 'Serviço de consulta de CNPJ indisponível agora.');
  const j = await r2.json();
  const e = j.estabelecimento || {};
  return {
    razao: j.razao_social || '', fantasia: e.nome_fantasia || '', cidade: e.cidade?.nome || '', uf: e.estado?.sigla || '',
    cnae: e.atividade_principal ? `${e.atividade_principal.subclasse || ''} — ${e.atividade_principal.descricao || ''}` : '',
    regime: j.simples?.mei === 'Sim' ? 'MEI' : j.simples?.simples === 'Sim' ? 'Simples Nacional' : '', situacao: e.situacao_cadastral || '', fonte: 'CNPJ.ws (Receita Federal)',
  };
}
