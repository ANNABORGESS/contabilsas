// Departamento Pessoal — central de conferência. A folha é processada e transmitida no sistema externo;
// aqui o ZARO recebe os documentos, lê o que dá para ler, confere com as tabelas oficiais, o cadastro,
// o Contas a Pagar e a contabilidade, e registra a revisão humana. Nada é calculado "no lugar" do sistema de folha.
import 'server-only';
import crypto from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, brl } from '@/domain/dinheiro';
import { conferirHolerite, conferirPrazos, conferirTercoFerias, type Holerite, type ItemConferencia, lerHolerites, lerRetornoEsocial, mascararCpf, resumoItens, statusObrigacao } from '@/domain/dp';
import { guardarArquivo } from './arquivos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { lancamentosDaEmpresa } from './contabil';

/** Salários, CPF e documentos dos trabalhadores: só perfis que fazem a conferência. */
export const podeVerDP = (u: Usuario) => ['Administrador', 'Contador', 'Gestor'].includes(u.perfil);
export function exigirDP(u: Usuario) {
  if (!podeVerDP(u)) throw new Error('Seu perfil não tem acesso aos dados do Departamento Pessoal.');
}

export const ETAPAS_DP = ['Importar documentos', 'Extrair dados', 'Validar', 'Cruzar informações', 'Identificar divergências', 'Revisão humana', 'Relatório', 'Conferência concluída'];
export const TIPOS_DOC: [string, string][] = [
  ['holerites', 'Holerites / demonstrativos (PDF ou texto)'], ['folha_analitica', 'Folha analítica'], ['folha_sintetica', 'Folha sintética'], ['esocial', 'Recibos / retorno do eSocial (XML)'],
  ['fgts', 'Relatório FGTS Digital'], ['dctfweb', 'DCTFWeb / DARF'], ['guia', 'Guias'], ['comprovante', 'Comprovantes de pagamento'], ['ferias', 'Férias'], ['rescisao', 'Rescisões'], ['convencao', 'Convenção / acordo coletivo'], ['outro', 'Outros'],
];

const hashCpf = (cpf: string, tenantId: string) => crypto.createHash('sha256').update(`${tenantId}:${cpf.replace(/\D/g, '')}`).digest('hex');

async function textoDoArquivo(nome: string, conteudo: Buffer) {
  if (/\.pdf$/i.test(nome)) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(conteudo));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  }
  return conteudo.toString('utf8');
}

/** Liga o holerite ao cadastro (CPF, matrícula ou nome); se não houver, cria o funcionário a partir do holerite. */
async function funcionarioDo(db: Db, u: Usuario, emp: Empresa, h: Holerite, cache: (typeof schema.funcionarios.$inferSelect)[]) {
  const hash = h.cpf ? hashCpf(h.cpf, u.tenantId) : null;
  const achado = cache.find((f) => (hash && (f.dados as { cpfHash?: string }).cpfHash === hash) || (f.dados as { matricula?: string }).matricula === h.matricula || f.nome.trim().toUpperCase() === h.nome.toUpperCase());
  if (achado) {
    const d = achado.dados as Record<string, unknown>;
    if (!d.matricula || !d.cpfHash) await db.update(schema.funcionarios).set({ dados: { ...d, matricula: d.matricula || h.matricula, cpfHash: d.cpfHash || hash, cpfMascara: d.cpfMascara || mascararCpf(h.cpf) } }).where(eq(schema.funcionarios.id, achado.id));
    return { f: achado, novo: false };
  }
  const [f] = await db.insert(schema.funcionarios).values({ tenantId: u.tenantId, empresaId: emp.id, nome: h.nome, cargo: h.cargo, admissao: h.admissao, salario: h.salarioBase, dados: { matricula: h.matricula, cpfHash: hash, cpfMascara: mascararCpf(h.cpf), departamento: h.departamento, origem: 'Holerite importado' } }).returning();
  cache.push(f);
  return { f, novo: true };
}

export async function importarDocumentoDP(db: Db, u: Usuario, emp: Empresa, v: { tipo: string; competencia: string; tipoFolha: string; nome: string; mime: string; conteudo: Buffer }) {
  exigirDP(u);
  if (!TIPOS_DOC.some(([k]) => k === v.tipo)) throw new Error('Tipo de documento inválido.');
  if (v.competencia && !/^\d{4}-\d{2}$/.test(v.competencia)) throw new Error('Competência inválida.');
  const arq = await guardarArquivo(db, u.tenantId, v.nome, v.mime, v.conteudo);
  const [doc] = await db.insert(schema.dpDocumentos).values({ tenantId: u.tenantId, empresaId: emp.id, competencia: v.competencia || null, tipo: v.tipo, nome: v.nome, arquivoId: arq.id, usuario: u.nome }).returning();
  let msg = `${v.nome} guardado.`;
  if (v.tipo === 'holerites' || v.tipo === 'folha_analitica') {
    let texto = '';
    try { texto = await textoDoArquivo(v.nome, v.conteudo); } catch { texto = ''; }
    const hs = lerHolerites(texto);
    if (!hs.length) {
      await db.update(schema.dpDocumentos).set({ status: 'Sem leitura automática', resumo: { motivo: 'Formato não reconhecido ou PDF digitalizado (imagem)' } }).where(eq(schema.dpDocumentos.id, doc.id));
      msg = `${v.nome} guardado, mas o ZARO não reconheceu holerites no arquivo (PDF de imagem ou outro layout). Ele fica disponível para conferência manual.`;
    } else {
      const cache = await db.select().from(schema.funcionarios).where(eq(schema.funcionarios.empresaId, emp.id));
      const convencao = await convencaoValida(db, emp.id, hs[0].competencia);
      let novos = 0;
      for (const h of hs) {
        const comp = h.competencia || v.competencia;
        const { f, novo } = await funcionarioDo(db, u, emp, h, cache);
        if (novo) novos++;
        const conf = conferirHolerite(h, { salarioCadastro: novo ? null : f.salario, piso: convencao?.piso ?? null, pisoFonte: convencao?.descricao ?? null, aprendiz: /aprendiz/i.test(h.cargo || '') });
        const valores = { funcionarioId: f.id, nome: h.nome, cpfMascara: mascararCpf(h.cpf), cpfHash: h.cpf ? hashCpf(h.cpf, u.tenantId) : null, cargo: h.cargo, dados: { ...h, cpf: undefined } as Record<string, unknown>, conferencia: conf as unknown as Record<string, unknown>, documentoId: doc.id };
        await db.insert(schema.dpHolerites).values({ tenantId: u.tenantId, empresaId: emp.id, competencia: comp, tipoFolha: v.tipoFolha || 'mensal', matricula: h.matricula, ...valores })
          .onConflictDoUpdate({ target: [schema.dpHolerites.empresaId, schema.dpHolerites.competencia, schema.dpHolerites.matricula, schema.dpHolerites.tipoFolha], set: valores });
      }
      const comps = [...new Set(hs.map((h) => h.competencia))];
      await db.update(schema.dpDocumentos).set({ status: 'Lido', competencia: comps[0] || v.competencia || null, resumo: { holerites: hs.length, competencias: comps, novosFuncionarios: novos } }).where(eq(schema.dpDocumentos.id, doc.id));
      for (const c of comps) await avancarEtapa(db, u, emp, c, 'Identificar divergências');
      msg = `${hs.length} holerite(s) lido(s) e conferido(s) (${comps.map((c) => c.split('-').reverse().join('/')).join(', ')}). ${novos ? `${novos} funcionário(s) novo(s) no cadastro. ` : ''}Reimportar o mesmo arquivo atualiza, não duplica.`;
    }
  } else if (v.tipo === 'esocial') {
    const evs = lerRetornoEsocial(v.conteudo.toString('utf8'));
    for (const e of evs) {
      const vals = { descricao: `${e.tipo || 'Evento'} ${e.descricao}`.trim(), status: e.situacao, dados: e as unknown as Record<string, unknown>, documentoId: doc.id, competencia: v.competencia || null, usuario: u.nome };
      await db.insert(schema.dpRegistros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: 'esocial', chave: e.id, ...vals }).onConflictDoUpdate({ target: [schema.dpRegistros.empresaId, schema.dpRegistros.tipo, schema.dpRegistros.chave], set: vals });
    }
    await db.update(schema.dpDocumentos).set({ status: evs.length ? 'Lido' : 'Sem leitura automática', resumo: { eventos: evs.length, rejeitados: evs.filter((e) => e.situacao === 'Rejeitado').length } }).where(eq(schema.dpDocumentos.id, doc.id));
    msg = evs.length ? `${evs.length} evento(s) do eSocial lido(s): ${evs.filter((e) => e.situacao === 'Rejeitado').length} rejeitado(s).` : `${v.nome} guardado; não reconheci o retorno do eSocial no arquivo.`;
  } else {
    await db.update(schema.dpDocumentos).set({ status: 'Sem leitura automática', resumo: { motivo: 'Guardado para conferência manual' } }).where(eq(schema.dpDocumentos.id, doc.id));
  }
  if (v.competencia) await avancarEtapa(db, u, emp, v.competencia, 'Extrair dados');
  await auditar(db, u, { empresaId: emp.id, acao: 'Importou documento do DP', entidade: `${TIPOS_DOC.find(([k]) => k === v.tipo)?.[1]} · ${v.nome}`, depois: msg.slice(0, 200) });
  return msg;
}

async function avancarEtapa(db: Db, u: Usuario, emp: Empresa, comp: string, etapa: string) {
  const [c] = await db.select().from(schema.dpConferencias).where(and(eq(schema.dpConferencias.empresaId, emp.id), eq(schema.dpConferencias.competencia, comp)));
  if (!c) { await db.insert(schema.dpConferencias).values({ tenantId: u.tenantId, empresaId: emp.id, competencia: comp, etapa }); return; }
  if (c.concluidaEm) return;
  if (ETAPAS_DP.indexOf(etapa) > ETAPAS_DP.indexOf(c.etapa)) await db.update(schema.dpConferencias).set({ etapa }).where(eq(schema.dpConferencias.id, c.id));
}

async function convencaoValida(db: Db, empresaId: string, comp: string) {
  const cs = await db.select().from(schema.dpRegistros).where(and(eq(schema.dpRegistros.empresaId, empresaId), eq(schema.dpRegistros.tipo, 'convencao')));
  return cs.map((c) => ({ ...c, d: c.dados as { de?: string; ate?: string; piso?: number; validadoPor?: string } }))
    .filter((c) => c.d.validadoPor && (!c.d.de || c.d.de.slice(0, 7) <= comp) && (!c.d.ate || c.d.ate.slice(0, 7) >= comp))
    .map((c) => ({ descricao: c.descricao, piso: c.d.piso ?? null }))[0] || null;
}

export async function salvarConvencao(db: Db, u: Usuario, emp: Empresa, v: { id?: string; sindicato: string; de: string; ate: string; dataBase: string; piso: number | null; reajuste: number | null; beneficios: string; regras: string; validar: boolean }) {
  exigirDP(u);
  if (!v.sindicato.trim()) throw new Error('Informe o sindicato / instrumento coletivo.');
  const dados = { de: v.de || null, ate: v.ate || null, dataBase: v.dataBase || null, piso: v.piso, reajuste: v.reajuste, beneficios: v.beneficios.trim(), regras: v.regras.trim(), ...(v.validar ? { validadoPor: u.nome, validadoEm: new Date().toISOString() } : {}) };
  if (v.id) await db.update(schema.dpRegistros).set({ descricao: v.sindicato.trim(), valor: v.piso, dados }).where(and(eq(schema.dpRegistros.id, v.id), eq(schema.dpRegistros.empresaId, emp.id)));
  else await db.insert(schema.dpRegistros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: 'convencao', chave: `conv:${crypto.randomUUID()}`, descricao: v.sindicato.trim(), valor: v.piso, status: v.validar ? 'Validada' : 'Aguardando validação', dados, usuario: u.nome });
  if (v.id) await db.update(schema.dpRegistros).set({ status: v.validar ? 'Validada' : 'Aguardando validação' }).where(eq(schema.dpRegistros.id, v.id));
  await auditar(db, u, { empresaId: emp.id, acao: v.validar ? 'Validou convenção coletiva' : 'Cadastrou convenção coletiva', entidade: v.sindicato.trim(), depois: v.piso ? `piso ${brl(v.piso)}` : undefined });
  return v.validar ? 'Convenção validada: o piso passa a ser usado na conferência das próximas importações.' : 'Convenção guardada. Ela só vira parâmetro de auditoria depois de validada por um profissional.';
}

export async function registrarObrigacao(db: Db, u: Usuario, emp: Empresa, v: { competencia: string; tributo: string; declarado: number | null; fonte: string }) {
  exigirDP(u);
  if (!/^\d{4}-\d{2}$/.test(v.competencia) || !['FGTS', 'INSS', 'IRRF'].includes(v.tributo)) throw new Error('Competência ou tributo inválido.');
  const vals = { descricao: `${v.tributo} declarado`, valor: v.declarado, status: 'Declarado', dados: { tributo: v.tributo, fonte: v.fonte.trim() }, usuario: u.nome, competencia: v.competencia };
  await db.insert(schema.dpRegistros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: 'obrigacao', chave: `${v.competencia}:${v.tributo}`, ...vals }).onConflictDoUpdate({ target: [schema.dpRegistros.empresaId, schema.dpRegistros.tipo, schema.dpRegistros.chave], set: vals });
  await auditar(db, u, { empresaId: emp.id, acao: 'Informou valor declarado (DP)', entidade: `${v.tributo} ${v.competencia}`, depois: v.declarado != null ? brl(v.declarado) : '—' });
  return `${v.tributo} de ${v.competencia.split('-').reverse().join('/')}: valor declarado registrado.`;
}

export async function registrarEvento(db: Db, u: Usuario, emp: Empresa, v: { tipo: 'ferias' | 'decimo' | 'rescisao'; funcionarioId: string; competencia: string; referencia: string; pagoEm: string; remuneracao: number | null; terco: number | null; valorPago: number | null; parcela: string; obs: string }) {
  exigirDP(u);
  const [f] = await db.select().from(schema.funcionarios).where(and(eq(schema.funcionarios.id, v.funcionarioId), eq(schema.funcionarios.empresaId, emp.id)));
  if (!f) throw new Error('Funcionário não encontrado nesta empresa.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.referencia)) throw new Error('Informe a data de referência (início das férias, término do contrato ou data do 13º).');
  const prazo = conferirPrazos({ tipo: v.tipo === 'decimo' ? (v.parcela === '2' ? '13-2' : '13-1') : v.tipo, referencia: v.referencia, pagoEm: v.pagoEm || null });
  const itens: ItemConferencia[] = [{ item: 'Prazo de pagamento', informado: null, conferido: null, diferenca: null, status: prazo.status, motivo: prazo.motivo, acao: prazo.status === 'Divergente' ? 'Avaliar risco e regularizar' : '—' }];
  if (v.tipo === 'ferias' && v.remuneracao != null && v.terco != null) itens.push(conferirTercoFerias(v.remuneracao, v.terco));
  const pior = itens.some((i) => i.status === 'Divergente') ? 'Divergente' : itens.some((i) => i.status !== 'Conferido') ? 'Revisão Necessária' : 'Conferido';
  const nome = { ferias: 'Férias', decimo: `13º salário (${v.parcela || '1'}ª parcela)`, rescisao: 'Rescisão' }[v.tipo];
  await db.insert(schema.dpRegistros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: v.tipo, competencia: v.competencia || v.referencia.slice(0, 7), chave: `${v.tipo}:${f.id}:${v.referencia}:${v.parcela}`, funcionarioId: f.id, descricao: `${nome} — ${f.nome}`, valor: v.valorPago, status: pior, dados: { referencia: v.referencia, pagoEm: v.pagoEm || null, remuneracao: v.remuneracao, terco: v.terco, parcela: v.parcela, obs: v.obs.trim(), itens }, usuario: u.nome })
    .onConflictDoNothing();
  await auditar(db, u, { empresaId: emp.id, acao: `Conferiu ${nome.toLowerCase()}`, entidade: f.nome, depois: pior });
  return `${nome} de ${f.nome}: ${pior}. ${prazo.motivo}.`;
}

export async function revisarItem(db: Db, u: Usuario, emp: Empresa, comp: string, chave: string, decisao: string, nota: string) {
  exigirDP(u);
  if (!['Conferido', 'Divergente', 'Revisão Necessária', 'Pendente', 'Aguardando Documento'].includes(decisao)) throw new Error('Decisão inválida.');
  await avancarEtapa(db, u, emp, comp, 'Revisão humana');
  const [c] = await db.select().from(schema.dpConferencias).where(and(eq(schema.dpConferencias.empresaId, emp.id), eq(schema.dpConferencias.competencia, comp)));
  await db.update(schema.dpConferencias).set({ revisoes: { ...c.revisoes, [chave]: { decisao, nota: nota.trim(), por: u.nome, em: new Date().toISOString() } } }).where(eq(schema.dpConferencias.id, c.id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Revisou item da conferência da folha', entidade: `${comp} · ${chave.split('|').slice(1).join(' · ')}`, depois: decisao, justificativa: nota.trim() || undefined });
  return 'Revisão registrada.';
}

export async function concluirConferencia(db: Db, u: Usuario, emp: Empresa, comp: string, parecer: string, reabrir = false) {
  exigirDP(u);
  await avancarEtapa(db, u, emp, comp, 'Relatório');
  const [c] = await db.select().from(schema.dpConferencias).where(and(eq(schema.dpConferencias.empresaId, emp.id), eq(schema.dpConferencias.competencia, comp)));
  if (reabrir) {
    await db.update(schema.dpConferencias).set({ concluidaEm: null, etapa: 'Revisão humana' }).where(eq(schema.dpConferencias.id, c.id));
    await auditar(db, u, { empresaId: emp.id, acao: 'Reabriu conferência da folha', entidade: comp });
    return 'Conferência reaberta.';
  }
  if (!parecer.trim()) throw new Error('Escreva o parecer da conferência.');
  await db.update(schema.dpConferencias).set({ parecer: parecer.trim(), responsavel: u.nome, concluidaEm: new Date(), etapa: 'Conferência concluída' }).where(eq(schema.dpConferencias.id, c.id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Concluiu conferência da folha', entidade: comp, depois: parecer.trim().slice(0, 160) });
  return `Conferência de ${comp.split('-').reverse().join('/')} concluída. Lembrete: isso não significa que as obrigações foram transmitidas ou pagas.`;
}

const RX_TRIB: Record<'FGTS' | 'INSS' | 'IRRF', RegExp> = { FGTS: /fgts/i, INSS: /\binss\b|\bgps\b|dctfweb|previd/i, IRRF: /irrf|\bdarf\b.*0561|0561|imposto de renda/i };

/** Tudo da competência: holerites conferidos (com a revisão humana), totais, obrigações, títulos e contabilidade. */
export async function dadosDP(db: Db, emp: Empresa, comp: string | null) {
  const [funcs, hols, regs, docs, confs] = await Promise.all([
    db.select().from(schema.funcionarios).where(eq(schema.funcionarios.empresaId, emp.id)),
    db.select().from(schema.dpHolerites).where(eq(schema.dpHolerites.empresaId, emp.id)),
    db.select().from(schema.dpRegistros).where(eq(schema.dpRegistros.empresaId, emp.id)).orderBy(desc(schema.dpRegistros.criadoEm)),
    db.select().from(schema.dpDocumentos).where(eq(schema.dpDocumentos.empresaId, emp.id)).orderBy(desc(schema.dpDocumentos.criadoEm)),
    db.select().from(schema.dpConferencias).where(eq(schema.dpConferencias.empresaId, emp.id)),
  ]);
  const competencias = [...new Set([...hols.map((h) => h.competencia), ...confs.map((c) => c.competencia), ...docs.map((d) => d.competencia).filter(Boolean) as string[]])].sort().reverse();
  const c = comp || competencias[0] || null;
  const conf = confs.find((x) => x.competencia === c) || null;
  const revisoes = (conf?.revisoes || {}) as Record<string, { decisao: string; nota: string; por: string; em: string }>;
  const daComp = hols.filter((h) => h.competencia === c);
  const linhas = daComp.flatMap((h) => {
    const cf = h.conferencia as { itens?: ItemConferencia[] };
    return (cf.itens || []).map((i) => {
      const chave = `${h.id}|${h.nome}|${i.item}`;
      const r = revisoes[chave];
      return { chave, holeriteId: h.id, documentoId: h.documentoId, funcionario: h.nome, matricula: h.matricula, competencia: h.competencia, ...i, statusOriginal: i.status, status: (r?.decisao as ItemConferencia['status']) || i.status, revisao: r || null };
    });
  });
  const dd = (h: (typeof daComp)[number]) => h.dados as unknown as Holerite;
  const soma = (f: (h: Holerite) => number | null) => arred(daComp.reduce((a, h) => a + (f(dd(h)) || 0), 0));
  const verba = (h: Holerite, r: RegExp) => h.verbas.filter((v) => r.test(v.descricao)).reduce((a, v) => a + v.valor, 0);
  const totais = { funcionarios: daComp.length, vencimentos: soma((h) => h.totalVencimentos), descontos: soma((h) => h.totalDescontos), liquido: soma((h) => h.liquido), fgts: soma((h) => h.fgtsMes), inss: soma((h) => verba(h, /\binss\b/i)), irrf: soma((h) => verba(h, /\birrf\b|imposto de renda/i)), baseInss: soma((h) => h.baseInss) };
  // obrigações × Contas a Pagar × declarado
  const tits = c ? await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar'), eq(schema.titulos.competencia, c))) : [];
  const bxs = tits.length ? await db.select().from(schema.baixas).where(inArray(schema.baixas.tituloId, tits.map((t) => t.id))) : [];
  const obrigacoes = (['FGTS', 'INSS', 'IRRF'] as const).map((trib) => {
    const t = tits.filter((x) => !/cancel/i.test(x.status) && (RX_TRIB[trib].test(`${x.nome} ${x.descricao || ''} ${x.folhaTipo || ''}`)));
    const b = bxs.filter((x) => !x.estornada && t.some((y) => y.id === x.tituloId));
    const decl = regs.find((r) => r.tipo === 'obrigacao' && r.chave === `${c}:${trib}`);
    const calculado = trib === 'FGTS' ? totais.fgts : trib === 'INSS' ? totais.inss : totais.irrf;
    const guia = t.length ? arred(t.reduce((a, x) => a + x.valor, 0)) : null;
    const pago = b.length ? arred(b.reduce((a, x) => a + x.valor, 0)) : null;
    const status = statusObrigacao({ declarado: decl?.valor ?? null, guia, pago, conciliado: b.length > 0 && b.every((x) => !!(x.dados as { extratoId?: string }).extratoId), comprovante: b.length > 0 && b.every((x) => !!x.arquivoId), statusTitulo: t[0]?.status });
    const nota = trib === 'INSS' ? 'Calculado = INSS descontado dos empregados; a guia (DCTFWeb) inclui a parte patronal, RAT e terceiros.' : trib === 'FGTS' ? 'Calculado = soma do FGTS do mês dos holerites.' : 'Calculado = IRRF descontado nos holerites (código 0561).';
    return { tributo: trib, calculado, declarado: decl?.valor ?? null, declaradoFonte: (decl?.dados as { fonte?: string })?.fonte || null, guia, pago, status, titulos: t.map((x) => x.codigo), nota, difGuia: guia != null && trib !== 'INSS' ? arred(guia - calculado) : null };
  });
  // folha × contabilidade (lançamentos da competência)
  let contabil: { item: string; folha: number; razao: number; diferenca: number; achado: string }[] = [];
  if (c && daComp.length) {
    const lancs = (await lancamentosDaEmpresa(db, emp)).filter((l) => l.comp === c && l.status !== 'Estornado');
    const deb = (conta: string) => arred(lancs.filter((l) => l.deb === conta).reduce((a, l) => a + l.valor, 0));
    const cred = (conta: string) => arred(lancs.filter((l) => l.cred === conta).reduce((a, l) => a + l.valor, 0));
    const achado = (folha: number, razao: number, nome: string) => (razao === 0 && folha > 0 ? `${nome} sem lançamento` : Math.abs(folha - razao) <= 0.05 ? 'Confere' : razao > folha * 1.5 ? 'Possível lançamento duplicado' : 'Divergência entre folha e razão');
    const salFolha = arred(totais.vencimentos);
    contabil = [
      { item: 'Despesa com salários (4.1.2.01)', folha: salFolha, razao: deb('4.1.2.01'), diferenca: arred(salFolha - deb('4.1.2.01')), achado: achado(salFolha, deb('4.1.2.01'), 'Despesa') },
      { item: 'FGTS — encargo (4.1.2.02)', folha: totais.fgts, razao: deb('4.1.2.02'), diferenca: arred(totais.fgts - deb('4.1.2.02')), achado: achado(totais.fgts, deb('4.1.2.02'), 'Encargo') },
      { item: 'FGTS a recolher (2.1.2.03)', folha: totais.fgts, razao: cred('2.1.2.03'), diferenca: arred(totais.fgts - cred('2.1.2.03')), achado: achado(totais.fgts, cred('2.1.2.03'), 'Obrigação') },
      { item: 'IRRF a recolher (2.1.2.04)', folha: totais.irrf, razao: cred('2.1.2.04'), diferenca: arred(totais.irrf - cred('2.1.2.04')), achado: achado(totais.irrf, cred('2.1.2.04'), 'Obrigação') },
    ];
  }
  const eventos = regs.filter((r) => ['ferias', 'decimo', 'rescisao'].includes(r.tipo));
  const esocial = regs.filter((r) => r.tipo === 'esocial');
  const convencoes = regs.filter((r) => r.tipo === 'convencao');
  const compsComDivergencia = [...new Set(hols.filter((h) => ((h.conferencia as { itens?: ItemConferencia[] }).itens || []).some((i) => i.status === 'Divergente')).map((h) => h.competencia))].length;
  return { competencias, comp: c, conf, concluidas: confs.filter((x) => x.concluidaEm).length, compsComDivergencia, funcs, holerites: daComp, linhas, totais, obrigacoes, contabil, eventos, esocial, convencoes, docs, todosHolerites: hols };
}

export async function contextoDP(db: Db, emp: Empresa, comp: string | null) {
  const d = await dadosDP(db, emp, comp);
  if (!d.comp) return `Departamento Pessoal de ${emp.razao}: nenhuma folha importada ainda. Link: /pessoal`;
  const prob = d.linhas.filter((l) => l.status !== 'Conferido');
  return [
    `DP de ${emp.razao}, competência ${d.comp.split('-').reverse().join('/')} (a folha é processada no sistema externo; o ZARO só confere). Etapa: ${d.conf?.etapa || 'Importar documentos'}${d.conf?.concluidaEm ? ' (conferência concluída — não significa transmitido nem pago)' : ''}. Link: /pessoal?aba=folha&comp=${d.comp}`,
    `Holerites: ${d.totais.funcionarios}; vencimentos ${brl(d.totais.vencimentos)}, descontos ${brl(d.totais.descontos)}, líquido ${brl(d.totais.liquido)}; INSS descontado ${brl(d.totais.inss)}, IRRF ${brl(d.totais.irrf)}, FGTS ${brl(d.totais.fgts)}. Tabelas oficiais versionadas (INSS/IRRF/FGTS).`,
    `Itens conferidos: ${d.linhas.filter((l) => l.status === 'Conferido').length}; com problema: ${prob.length}: ${prob.slice(0, 12).map((l) => `${l.funcionario.split(' ')[0]} — ${l.item}: informado ${l.informado ?? '—'} × conferido ${l.conferido ?? '—'} [${l.status}] (${l.motivo})`).join('; ') || 'nenhum'}.`,
    `Obrigações: ${d.obrigacoes.map((o) => `${o.tributo}: calculado ${brl(o.calculado)}, declarado ${o.declarado != null ? brl(o.declarado) : '—'}, guia ${o.guia != null ? brl(o.guia) : 'sem título'}, pago ${o.pago != null ? brl(o.pago) : '—'} → ${o.status}`).join('; ')}. ${d.obrigacoes[1].nota}`,
    d.contabil.length ? `Folha × contabilidade: ${d.contabil.map((x) => `${x.item}: folha ${brl(x.folha)} × razão ${brl(x.razao)} (${x.achado})`).join('; ')}.` : '',
    `eSocial: ${d.esocial.length} evento(s) importado(s), ${d.esocial.filter((e) => e.status === 'Rejeitado').length} rejeitado(s). Férias/13º/rescisões conferidos: ${d.eventos.length}. Convenções: ${d.convencoes.map((c) => `${c.descricao} (${c.status})`).join(', ') || 'nenhuma'}.`,
  ].filter(Boolean).join('\n');
}
