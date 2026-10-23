// ZARO Autopilot: caixa de entrada única. Lê o documento, identifica o que é, bloqueia
// duplicados e, depois da aprovação, cria os títulos no módulo certo.
import 'server-only';
import { and, eq, inArray, like, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { soDigitos } from '@/domain/dinheiro';
import { lerXmlFiscal, type DocumentoFiscal, type NotaFiscal } from '@/domain/nfe';
import { direcaoDaNota, ehRetorno, titulosDaNota, type Direcao, type TituloGerado } from '@/domain/operacao';
import { guardarArquivo } from './arquivos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { unzipSync } from 'fflate';

export interface ArquivoRecebido {
  nome: string;
  mime: string;
  conteudo: Buffer;
}

export interface DadosDocumento {
  nota?: NotaFiscal;
  direcao?: Direcao;
  retorno?: boolean;
  titulos?: TituloGerado[];
  evento?: Extract<DocumentoFiscal, { tipo: 'Evento' }>;
  erro?: string;
}

export interface ResultadoEntrada {
  nome: string;
  status: string;
  mensagem: string;
}

const MIME: Record<string, string> = { xml: 'application/xml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** Abre os .zip e devolve os XML, PDF e imagens de dentro (ignora pastas do macOS e outros tipos). */
export function abrirZips(arquivos: ArquivoRecebido[]): ArquivoRecebido[] {
  return arquivos.flatMap((a) => {
    if (!/\.zip$/i.test(a.nome)) return [a];
    const dentro = unzipSync(new Uint8Array(a.conteudo), { filter: (f) => !/(^|\/)__MACOSX\//.test(f.name) && /\.(xml|pdf|png|jpe?g)$/i.test(f.name) && f.originalSize < 20 * 1024 * 1024 });
    return Object.entries(dentro).slice(0, 500).map(([caminho, b]) => {
      const nome = caminho.split('/').pop() || caminho;
      return { nome, mime: MIME[nome.split('.').pop()!.toLowerCase()] || 'application/octet-stream', conteudo: Buffer.from(b) };
    });
  });
}

export async function receberArquivos(db: Db, u: Usuario, emp: Empresa, recebidos: ArquivoRecebido[], canal = 'Upload'): Promise<ResultadoEntrada[]> {
  const out: ResultadoEntrada[] = [];
  let arquivos: ArquivoRecebido[];
  try {
    arquivos = abrirZips(recebidos);
  } catch {
    return [{ nome: recebidos.map((a) => a.nome).join(', '), status: 'Erro', mensagem: 'Não consegui abrir o .zip (arquivo corrompido ou protegido por senha).' }];
  }
  for (const a of arquivos) {
    try {
      out.push(await receberUm(db, u, emp, a, canal));
    } catch (e) {
      out.push({ nome: a.nome, status: 'Erro', mensagem: (e as Error).message });
    }
  }
  return out;
}

async function receberUm(db: Db, u: Usuario, emp: Empresa, a: ArquivoRecebido, canal: string): Promise<ResultadoEntrada> {
  const ext = a.nome.split('.').pop()?.toLowerCase() || '';
  const arq = await guardarArquivo(db, u.tenantId, a.nome, a.mime, a.conteudo);
  const base = { tenantId: u.tenantId, empresaId: emp.id, nomeArquivo: a.nome, arquivoId: arq.id, canal };

  if (ext !== 'xml') {
    await db.insert(schema.documentosEntrada).values({ ...base, tipo: ext === 'pdf' ? 'PDF' : 'Arquivo', status: 'Novo', destino: 'Classificar manualmente', confianca: 0, resultado: 'Leitura automática disponível só para XML por enquanto. O arquivo ficou guardado.' });
    return { nome: a.nome, status: 'Novo', mensagem: 'Guardado. Leitura automática só de XML por enquanto: classifique manualmente.' };
  }

  const xml = a.conteudo.toString('utf8');
  const doc = lerXmlFiscal(xml);

  if (doc.tipo === 'Evento') {
    let resultado = `Evento ${doc.tpEvento} ${doc.descricao}`.trim();
    if (doc.cancelamento) {
      const afetados = await db
        .update(schema.titulos)
        .set({ status: 'Cancelado', obs: sql`coalesce(${schema.titulos.obs} || ' · ', '') || ${'NF cancelada (evento ' + doc.data + ')'}` })
        .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.nfChave, doc.chave), ne(schema.titulos.status, 'Cancelado')))
        .returning({ codigo: schema.titulos.codigo });
      resultado = afetados.length ? `NF cancelada: ${afetados.length} título(s) excluído(s) dos totais (${afetados.map((x) => x.codigo).join(', ')})` : 'Cancelamento registrado. Nenhum título desta NF no ZARO.';
      if (afetados.length) await auditar(db, u, { empresaId: emp.id, acao: 'Cancelou títulos por evento de cancelamento da NF', entidade: `Chave ${doc.chave}`, depois: resultado });
    }
    await db.insert(schema.documentosEntrada).values({ ...base, tipo: 'Evento de NF-e', chave: doc.chave, xml, dados: { evento: doc } as Record<string, unknown>, status: 'Processado', destino: 'Fiscal', confianca: 98, resultado });
    return { nome: a.nome, status: 'Processado', mensagem: resultado };
  }

  const nota = doc;
  const chave = nota.dados.chave;
  if (chave) {
    const [jaDoc] = await db.select({ id: schema.documentosEntrada.id }).from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.chave, chave), inArray(schema.documentosEntrada.status, ['Novo', 'Aprovado'])));
    const [jaTit] = await db.select({ codigo: schema.titulos.codigo }).from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.nfChave, chave)));
    if (jaDoc || jaTit) {
      await db.insert(schema.documentosEntrada).values({ ...base, tipo: nota.tipo, chave, xml, status: 'Duplicado', confianca: nota.confianca, valor: nota.dados.vNF, resultado: jaTit ? `Já lançada (${jaTit.codigo})` : 'Já está na caixa de entrada' });
      return { nome: a.nome, status: 'Duplicado', mensagem: `NF ${nota.dados.numero} já está no ZARO: não foi lançada de novo.` };
    }
  }

  const direcao = direcaoDaNota(nota, emp.cnpj);
  const retorno = ehRetorno(nota);
  const titulos = direcao === 'terceiros' ? [] : titulosDaNota(nota, direcao, { semEstoque: emp.semEstoque });
  const destino =
    direcao === 'terceiros' ? 'Revisar: a empresa ativa não é emitente nem destinatária'
      : nota.dados.vNF <= 0 ? 'Nota cancelada (valor zero): nenhum título'
        : retorno ? 'Retorno/remessa: só fiscal, sem caixa'
          : direcao === 'saida' ? 'Contas a Receber · Fiscal · Contabilidade' : 'Contas a Pagar · Fiscal · Contabilidade';
  const tipo = `${nota.tipo}${nota.tipo === 'NF-e' ? (direcao === 'saida' ? ' de saída' : direcao === 'entrada' ? ' de entrada' : '') : ''}`;
  const dados: DadosDocumento = { nota, direcao, retorno, titulos };
  await db.insert(schema.documentosEntrada).values({
    ...base, tipo, chave: chave || null, xml, dados: dados as Record<string, unknown>, status: 'Novo', destino,
    confianca: direcao === 'terceiros' ? 40 : nota.confianca, valor: nota.dados.vNF,
  });
  return { nome: a.nome, status: 'Novo', mensagem: `${tipo} ${nota.dados.numero}: ${destino}` };
}

async function proximoCodigo(db: Db, empresaId: string, tipo: 'pagar' | 'receber') {
  const prefixo = tipo === 'pagar' ? 'CP-' : 'CR-';
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(cast(substring(${schema.titulos.codigo} from 4) as integer)), 0)` })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, empresaId), like(schema.titulos.codigo, `${prefixo}%`), sql`substring(${schema.titulos.codigo} from 4) ~ '^[0-9]+$'`));
  return (n: number) => `${prefixo}${String(Number(r?.max || 0) + n).padStart(4, '0')}`;
}

async function parceiroDaNota(db: Db, u: Usuario, emp: Empresa, tipo: 'cliente' | 'fornecedor', doc: string, nome: string) {
  const d = soDigitos(doc);
  if (d) {
    const [p] = await db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, tipo), eq(schema.parceiros.doc, d)));
    if (p) return p;
  }
  const [novo] = await db.insert(schema.parceiros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo, doc: d || null, razao: nome || 'Sem nome', origem: 'NF importada' }).returning();
  return novo;
}

export async function aprovarDocumento(db: Db, u: Usuario, emp: Empresa, documentoId: string) {
  const [doc] = await db.select().from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.id, documentoId), eq(schema.documentosEntrada.empresaId, emp.id)));
  if (!doc) throw new Error('Documento não encontrado nesta empresa.');
  if (doc.status !== 'Novo') throw new Error(`Este documento já está "${doc.status}".`);
  const dados = doc.dados as DadosDocumento;
  const nota = dados.nota;
  if (!nota || !dados.direcao || dados.direcao === 'terceiros') throw new Error('Só dá para aprovar NF em que a empresa ativa é emitente ou destinatária.');
  const gerados = dados.titulos || [];
  const tipo = dados.direcao === 'saida' ? 'receber' : 'pagar';
  const d = nota.dados;
  const parte = tipo === 'receber' ? { doc: d.cliDoc, nome: d.cliNome } : { doc: d.emitCnpj, nome: d.emitNome };

  const codigos = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const parceiro = await parceiroDaNota(t, u, emp, tipo === 'receber' ? 'cliente' : 'fornecedor', parte.doc, parte.nome);
    const codigo = await proximoCodigo(t, emp.id, tipo);
    const linhas = gerados.map((g, i) => ({
      tenantId: u.tenantId, empresaId: emp.id, codigo: codigo(i + 1), tipo, parceiroId: parceiro.id, nome: parte.nome || parceiro.razao, docParceiro: soDigitos(parte.doc) || null,
      descricao: d.descricao, nf: d.numero, serie: d.serie, nfChave: d.chave || null, nfEmissao: d.emissao || null, competencia: d.competencia || null,
      parcela: g.parcela, venc: g.venc, valor: g.valor, valorFiscal: g.valorFiscal, status: g.status, retorno: g.retorno, impactaCaixa: g.impactaCaixa,
      vencEstimado: g.vencEstimado, natureza: d.natureza, cfop: nota.itens.map((i) => i.cfop).filter(Boolean)[0] || null, categoria: g.categoria,
      contaContabil: g.contaContabil, origem: 'nf', impostos: i === 0 ? nota.impostos.map((x) => ({ nome: x.nome, valor: x.valor })) : [], retencoes: i === 0 ? nota.retencoes : [],
      documentoId: doc.id, obs: g.notaVenc,
    }));
    const criados = linhas.length ? await t.insert(schema.titulos).values(linhas).returning({ codigo: schema.titulos.codigo }) : [];
    const lista = criados.map((c) => c.codigo);
    await t.update(schema.documentosEntrada).set({ status: 'Aprovado', resultado: lista.length ? `Criado(s): ${lista.join(', ')}` : 'Aprovado sem título (cancelada)' }).where(eq(schema.documentosEntrada.id, doc.id));
    await auditar(t, u, { empresaId: emp.id, acao: `Aprovou ${doc.tipo} no Autopilot`, entidade: `NF ${d.numero} · ${parte.nome}`, depois: lista.join(', ') || 'sem título' });
    return lista;
  });
  return codigos;
}

export async function descartarDocumento(db: Db, u: Usuario, emp: Empresa, documentoId: string, motivo: string) {
  const [doc] = await db.update(schema.documentosEntrada).set({ status: 'Descartado', resultado: `Descartado: ${motivo || 'sem motivo'}` }).where(and(eq(schema.documentosEntrada.id, documentoId), eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Novo'))).returning();
  if (!doc) throw new Error('Documento não encontrado ou já tratado.');
  await auditar(db, u, { empresaId: emp.id, acao: 'Descartou documento do Autopilot', entidade: doc.nomeArquivo, justificativa: motivo });
}
