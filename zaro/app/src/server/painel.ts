// Dados do Dashboard executivo, calculados no servidor e sempre filtrados pela empresa ativa
// (empresaId conferido contra o escritório do usuário em exigirEmpresa). Cache curto por empresa:
// a chave inclui o último registro da auditoria, então qualquer alteração gravada invalida o cache.
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { addDias, arred, brl, dataBr } from '@/domain/dinheiro';
import { situacaoCertificado } from '@/domain/certificado';
import { balancete, dre } from '@/domain/demonstracoes';
import { STATUS_NO_LIVRO } from '@/domain/motor';
import { ehTributo, emAbertoEm, fluxoProjetado, gerarInsights, mesesAte, moduloDaAcao, ordenarAlertas, progresso, serieMensal, type Alerta, type Tarefa } from '@/domain/painel';
import { regimeEm } from '@/domain/regime';
import type { Empresa, Usuario } from './auth';
import { saldoBancario } from './banco';
import { lancamentosDaEmpresa } from './contabil';
import { ehAberto } from './consultas';
import { notasFiltradas } from './notas-sefaz';

const mesAnterior = (comp: string) => mesesAte(comp, 2)[0];
const compBr = (comp: string) => comp.split('-').reverse().join('/');
const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 864e5);
const variacao = (atual: number, antes: number | null) => (antes == null || antes === 0 ? null : Math.round(((atual - antes) / Math.abs(antes)) * 100));

/** Competência padrão do Dashboard: o mês anterior (o que está em fechamento). */
export const compPadrao = (hoje: string) => mesAnterior(hoje.slice(0, 7));

const cache = new Map<string, { quando: number; dados: Promise<DadosPainel> }>();

export type DadosPainel = Awaited<ReturnType<typeof calcular>>;

export async function dadosDoPainel(db: Db, u: Usuario, emp: Empresa, comp: string, hoje: string): Promise<DadosPainel> {
  const [ult] = await db.select({ q: schema.auditoria.quando }).from(schema.auditoria).where(eq(schema.auditoria.empresaId, emp.id)).orderBy(desc(schema.auditoria.quando)).limit(1);
  const k = `${u.tenantId}:${emp.id}:${comp}:${hoje}:${ult?.q?.toISOString() || '-'}`;
  const c = cache.get(k);
  if (c && Date.now() - c.quando < 60_000) return c.dados;
  for (const [ch, v] of cache) if (Date.now() - v.quando > 60_000) cache.delete(ch);
  const dados = calcular(db, u, emp, comp, hoje);
  cache.set(k, { quando: Date.now(), dados });
  dados.catch(() => cache.delete(k));
  return dados;
}

async function calcular(db: Db, u: Usuario, emp: Empresa, comp: string, hoje: string) {
  const ha30 = addDias(hoje, -30);
  const [titulos, baixas, extratoComp, banco, lancs, docs, sefaz, funcs, dividas, contratos, atividade] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db
      .select({ tituloId: schema.baixas.tituloId, data: schema.baixas.data, valor: schema.baixas.valor, tipo: schema.titulos.tipo })
      .from(schema.baixas)
      .innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId))
      .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.baixas.estornada, false))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.extratoMovimentos).where(and(eq(schema.extratoMovimentos.empresaId, emp.id), sql`to_char(${schema.extratoMovimentos.data}, 'YYYY-MM') = ${comp}`)),
    saldoBancario(db, u.tenantId, emp.id),
    lancamentosDaEmpresa(db, emp),
    db.select({ status: schema.documentosEntrada.status, n: sql<number>`count(*)::int` }).from(schema.documentosEntrada).where(eq(schema.documentosEntrada.empresaId, emp.id)).groupBy(schema.documentosEntrada.status),
    notasFiltradas(db, emp, 'todas', ''),
    db.select({ ativo: schema.funcionarios.ativo }).from(schema.funcionarios).where(eq(schema.funcionarios.empresaId, emp.id)),
    db.select({ valor: schema.dividasAtivas.valor }).from(schema.dividasAtivas).where(eq(schema.dividasAtivas.empresaId, emp.id)),
    db.select({ valor: schema.contratosDivida.valor, status: schema.contratosDivida.status }).from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id)),
    db.select().from(schema.auditoria).where(and(eq(schema.auditoria.tenantId, u.tenantId), eq(schema.auditoria.empresaId, emp.id))).orderBy(desc(schema.auditoria.quando)).limit(200),
  ]);

  // ---- títulos: saldo em aberto hoje e há 30 dias ----
  const baixasDe = new Map<string, { data: string; valor: number }[]>();
  for (const b of baixas) baixasDe.set(b.tituloId, [...(baixasDe.get(b.tituloId) || []), { data: b.data, valor: b.valor }]);
  const validos = titulos.filter((t) => !t.retorno && !/cancel/i.test(t.status));
  const abertos = validos
    .filter(ehAberto)
    .map((t) => ({ t, saldo: Math.max(0, arred(t.valor - (baixasDe.get(t.id) || []).reduce((a, b) => a + b.valor, 0))) }))
    .filter((x) => x.saldo > 0.004);
  const desde = (t: (typeof titulos)[number]) => t.nfEmissao || (t.competencia ? `${t.competencia}-01` : t.criadoEm.toISOString().slice(0, 10));
  /** Em aberto numa data passada. Título quitado sem baixa registrada não tem data de quitação: fica de fora. */
  const abertoEm = (tipo: string, data: string, filtro: (t: (typeof titulos)[number]) => boolean = () => true) =>
    arred(validos.filter((t) => t.tipo === tipo && filtro(t)).reduce((a, t) => {
      const bx = baixasDe.get(t.id) || [];
      if (!ehAberto(t) && bx.reduce((s, b) => s + b.valor, 0) < t.valor - 0.01) return a;
      return a + emAbertoEm({ valor: t.valor, criadoEm: desde(t), baixas: bx }, data);
    }, 0));
  const soma = (l: { saldo: number }[]) => arred(l.reduce((a, x) => a + x.saldo, 0));
  const doTipo = (tipo: string) => abertos.filter((x) => x.t.tipo === tipo);
  const vencidos = (l: typeof abertos) => l.filter((x) => x.t.venc && x.t.venc < hoje);
  const receber = doTipo('receber'), pagar = doTipo('pagar');
  const tributos = pagar.filter((x) => ehTributo(x.t));
  const tribVencidos = vencidos(tributos);
  const tribMes = tributos.filter((x) => x.t.venc && x.t.venc >= hoje && x.t.venc <= `${hoje.slice(0, 7)}-31`);

  // ---- resultado (DRE da competência; prévia enquanto houver lançamento sem aprovação) ----
  const doComp = lancs.filter((l) => l.comp === comp);
  const pendentesComp = doComp.filter((l) => !STATUS_NO_LIVRO.includes(l.status));
  const res = dre(lancs, { de: comp, ate: comp }, true).resultado;
  const resAnt = dre(lancs, { de: mesAnterior(comp), ate: mesAnterior(comp) }, true);
  const temAnt = lancs.some((l) => l.comp === mesAnterior(comp));

  const saldoHoje = banco ? banco.atual : null;
  const saldoHa30 = banco ? banco.em(ha30) : null;
  const diasExtrato = banco ? dias(banco.ultimoMovimento, hoje) : null;

  const indicadores = {
    banco: {
      valor: saldoHoje,
      antes: saldoHa30,
      pct: saldoHoje != null ? variacao(saldoHoje, saldoHa30) : null,
      ate: banco?.ultimoMovimento || null,
      desatualizado: diasExtrato != null && diasExtrato > 7,
      info: banco ? `Extrato até ${dataBr(banco.ultimoMovimento)}` : 'Informe o saldo inicial em Financeiro → Extrato',
    },
    receber: { valor: soma(receber), antes: abertoEm('receber', ha30), n: receber.length, vencido: soma(vencidos(receber)), nVencido: vencidos(receber).length },
    pagar: { valor: soma(pagar), antes: abertoEm('pagar', ha30), n: pagar.length, vencido: soma(vencidos(pagar)), nVencido: vencidos(pagar).length },
    tributos: { valor: soma(tributos), antes: abertoEm('pagar', ha30, ehTributo), n: tributos.length, vencido: soma(tribVencidos), nVencido: tribVencidos.length, noMes: soma(tribMes) },
    resultado: { valor: res, antes: temAnt ? resAnt.resultado : null, previa: pendentesComp.length > 0, temLancamentos: doComp.length > 0, pendentes: pendentesComp.length },
  };

  // ---- gráficos ----
  const movs = baixas.map((b) => ({ data: b.data, valor: b.valor, tipo: b.tipo as 'receber' | 'pagar' }));
  const serie = serieMensal(movs, mesesAte(comp, 12));
  const fluxo = fluxoProjetado(saldoHoje, abertos.filter((x) => x.t.impactaCaixa).map((x) => ({ venc: x.t.venc, saldo: x.saldo, tipo: x.t.tipo as 'receber' | 'pagar' })), hoje);

  // ---- fechamento da competência, por área ----
  const ultimoDoComp = `${comp}-31`;
  const vencNoComp = abertos.filter((x) => x.t.venc && x.t.venc.startsWith(comp) && x.t.venc < hoje);
  const ativos = funcs.filter((f) => f.ativo).length;
  const daFolha = validos.filter((t) => t.competencia === comp && (t.origem === 'folha' || !!t.folhaTipo));
  const encargos = validos.filter((t) => t.competencia === comp && /\b(inss|fgts|gps|dctfweb)\b/i.test(`${t.nome} ${t.descricao || ''} ${t.folhaTipo || ''}`));
  const docN = (st: string) => Number(docs.find((d) => d.status === st)?.n || 0);
  const revisaoComp = doComp.filter((l) => l.status === 'Em revisão').length;
  const bal = balancete(lancs, { de: comp, ate: comp }, true);
  const tribComp = validos.filter((t) => t.tipo === 'pagar' && t.competencia === comp && ehTributo(t));
  const responsavel = (modulo: string) => {
    const a = atividade.find((x) => moduloDaAcao(x.acao) === modulo);
    return a ? { nome: a.usuario, quando: a.quando.toISOString() } : null;
  };
  const areas = [
    {
      chave: 'financeiro', nome: 'Financeiro', href: '/financeiro', modulo: 'Financeiro',
      tarefas: [
        { ok: vencNoComp.length === 0, erro: true, texto: vencNoComp.length ? `${vencNoComp.length} título(s) que venceram em ${compBr(comp)} sem baixa` : `Baixas de ${compBr(comp)} registradas`, acao: 'Registrar baixas', href: '/financeiro?tipo=pagar&f=vencidos' },
        { ok: Number(extratoComp[0].n) > 0, texto: Number(extratoComp[0].n) ? `Extrato de ${compBr(comp)} importado` : `Extrato de ${compBr(comp)} não importado`, acao: 'Importar extrato', href: '/financeiro?tipo=extrato' },
        { ok: !!banco && banco.ultimoMovimento >= ultimoDoComp.slice(0, 7), texto: banco ? `Saldo bancário conferido até ${dataBr(banco.ultimoMovimento)}` : 'Saldo bancário inicial não informado', acao: 'Informar saldo', href: '/financeiro?tipo=extrato#saldo' },
      ] as Tarefa[],
    },
    {
      chave: 'pessoal', nome: 'Departamento Pessoal', href: '/pessoal', modulo: 'Departamento Pessoal',
      tarefas: [
        { ok: daFolha.length > 0, naoSeAplica: !ativos, texto: daFolha.length ? `Folha de ${compBr(comp)} lançada (${daFolha.length} título(s))` : `Folha de ${compBr(comp)} não lançada`, acao: 'Conferir folha', href: '/pessoal?aba=folha' },
        { ok: encargos.length > 0, naoSeAplica: !ativos, texto: encargos.length ? `Encargos de ${compBr(comp)} lançados` : `INSS/FGTS de ${compBr(comp)} não lançados`, acao: 'Lançar encargos', href: '/financeiro?tipo=pagar' },
        { ok: !encargos.some((t) => ehAberto(t) && t.venc && t.venc < hoje), naoSeAplica: !ativos || !encargos.length, erro: true, texto: 'Guias da folha pagas no prazo', acao: 'Pagar guias', href: '/financeiro?tipo=pagar&f=vencidos' },
      ] as Tarefa[],
    },
    {
      chave: 'fiscal', nome: 'Fiscal e Tributário', href: '/fiscal', modulo: 'Fiscal',
      tarefas: [
        { ok: docN('Novo') === 0, texto: docN('Novo') ? `${docN('Novo')} documento(s) aguardando no Autopilot` : 'Documentos do Autopilot processados', acao: 'Processar documentos', href: '/autopilot' },
        { ok: docN('Erro') === 0, erro: true, texto: docN('Erro') ? `${docN('Erro')} documento(s) com erro de leitura` : 'Nenhum documento com erro', acao: 'Corrigir documentos', href: '/autopilot' },
        { ok: sefaz.resumo.foraZaro === 0, naoSeAplica: sefaz.resumo.total === 0, texto: sefaz.resumo.foraZaro ? `${sefaz.resumo.foraZaro} NF da SEFAZ fora da ZARO` : 'NF da SEFAZ conferidas', acao: 'Conferir notas', href: '/fiscal/notas?f=forazaro' },
        { ok: tribVencidos.length === 0, erro: true, texto: tribVencidos.length ? `${tribVencidos.length} tributo(s) vencido(s) em aberto` : 'Nenhum tributo vencido', acao: 'Conferir tributos', href: '/financeiro?tipo=pagar&f=vencidos' },
        { ok: tribComp.length > 0, texto: tribComp.length ? `Guias de ${compBr(comp)} lançadas (${tribComp.length})` : `Nenhuma guia de tributo com competência ${compBr(comp)}`, acao: 'Apurar tributos', href: '/fiscal' },
      ] as Tarefa[],
    },
    {
      chave: 'contabil', nome: 'Contabilidade', href: `/contabilidade?per=mes&ref=${comp}`, modulo: 'Contabilidade',
      tarefas: [
        { ok: pendentesComp.length === 0, naoSeAplica: !doComp.length, texto: `${doComp.length - pendentesComp.length} de ${doComp.length} lançamentos de ${compBr(comp)} aprovados`, acao: 'Aprovar lançamentos', href: `/contabilidade?per=mes&ref=${comp}` },
        { ok: revisaoComp === 0, naoSeAplica: !doComp.length, erro: true, texto: revisaoComp ? `${revisaoComp} lançamento(s) sem classificação segura` : 'Classificações conferidas', acao: 'Revisar classificação', href: '/contabilidade?st=Em%20revis%C3%A3o' },
        { ok: Math.abs(bal.totalDebitos - bal.totalCreditos) < 0.01, naoSeAplica: !doComp.length, erro: true, texto: 'Balancete fecha (débitos = créditos)', acao: 'Ver balancete', href: `/contabilidade?aba=balancete&per=mes&ref=${comp}` },
      ] as Tarefa[],
    },
  ].map((a) => ({ ...a, ...progresso(a.tarefas), responsavel: responsavel(a.modulo) }));

  // ---- requer sua atenção ----
  const alertas: Alerta[] = [];
  for (const x of vencidos(pagar)) {
    const trib = ehTributo(x.t);
    alertas.push({ titulo: `${trib ? 'Tributo' : 'Conta a pagar'} vencido: ${x.t.nome}`, detalhe: `${x.t.codigo} · venceu em ${dataBr(x.t.venc)} · ${brl(x.saldo)}`, href: `/financeiro?tipo=pagar&f=vencidos&q=${encodeURIComponent(x.t.codigo)}`, gravidade: 3, dias: dias(x.t.venc!, hoje), valor: x.saldo, modulo: trib ? 'Fiscal' : 'Financeiro' });
  }
  for (const x of pagar.filter((x) => x.t.venc && x.t.venc >= hoje && x.t.venc <= addDias(hoje, 3))) {
    alertas.push({ titulo: `Vence ${x.t.venc === hoje ? 'hoje' : `em ${dias(hoje, x.t.venc!)} dia(s)`}: ${x.t.nome}`, detalhe: `${x.t.codigo} · ${dataBr(x.t.venc)} · ${brl(x.saldo)}`, href: `/financeiro?tipo=pagar&f=abertos&q=${encodeURIComponent(x.t.codigo)}`, gravidade: 2, dias: -dias(hoje, x.t.venc!), valor: x.saldo, modulo: ehTributo(x.t) ? 'Fiscal' : 'Financeiro' });
  }
  for (const x of vencidos(receber)) {
    alertas.push({ titulo: `Recebimento atrasado: ${x.t.nome}`, detalhe: `${x.t.codigo} · venceu em ${dataBr(x.t.venc)} · ${brl(x.saldo)}`, href: `/financeiro?tipo=receber&f=vencidos&q=${encodeURIComponent(x.t.codigo)}`, gravidade: 2, dias: dias(x.t.venc!, hoje), valor: x.saldo, modulo: 'Financeiro' });
  }
  if (docN('Erro')) alertas.push({ titulo: `${docN('Erro')} documento(s) com erro no Autopilot`, detalhe: 'XML que não pôde ser lido ou classificado', href: '/autopilot', gravidade: 3, dias: null, valor: 0, modulo: 'Fiscal' });
  if (docN('Novo')) alertas.push({ titulo: `${docN('Novo')} documento(s) aguardando no Autopilot`, detalhe: 'Conferir e aprovar para virar título e lançamento', href: '/autopilot', gravidade: 1, dias: null, valor: 0, modulo: 'Fiscal' });
  const revisaoTotal = lancs.filter((l) => l.status === 'Em revisão').length;
  if (revisaoTotal) alertas.push({ titulo: `${revisaoTotal} lançamento(s) sem classificação segura`, detalhe: 'O motor não teve confiança para escolher a conta', href: '/contabilidade?st=Em%20revis%C3%A3o', gravidade: 2, dias: null, valor: 0, modulo: 'Contabilidade' });
  const totalDivida = arred(dividas.reduce((a, d) => a + (d.valor || 0), 0));
  if (totalDivida > 0) alertas.push({ titulo: `Dívida ativa na PGFN: ${brl(totalDivida)}`, detalhe: `${dividas.length} inscrição(ões) cadastrada(s)`, href: '/fiscal', gravidade: 2, dias: null, valor: totalDivida, modulo: 'Fiscal' });
  const validadeCert = (emp.dados?.certificado as { validoAte?: string } | undefined)?.validoAte;
  const cert = validadeCert ? situacaoCertificado(validadeCert, hoje) : null;
  if (cert && cert.nivel !== 'ok') alertas.push({ titulo: cert.texto, detalhe: 'Sem certificado válido não há busca de NF-e na SEFAZ nem envio de obrigações. Renove e cadastre o novo .pfx em Empresas.', href: `/empresas?editar=${emp.id}`, gravidade: cert.nivel === 'vencido' ? 3 : 2, dias: -cert.dias, valor: 0, modulo: 'Fiscal' });
  if (sefaz.resumo.foraZaro) alertas.push({ titulo: `${sefaz.resumo.foraZaro} NF da SEFAZ fora da ZARO`, detalhe: 'Na lista do portal, sem título nem XML', href: '/fiscal/notas?f=forazaro', gravidade: 1, dias: null, valor: 0, modulo: 'Fiscal' });
  const ordenados = ordenarAlertas(alertas);

  // ---- insights (só com evidência) ----
  const mesBaixas = (mes: string, tipo: string) => arred(baixas.filter((b) => b.tipo === tipo && b.data.startsWith(mes)).reduce((a, b) => a + b.valor, 0));
  const aVencerPagar = pagar.filter((x) => x.t.venc && x.t.venc >= hoje);
  const insights = gerarInsights({
    recebidoMes: mesBaixas(comp, 'receber'), recebidoMesAnterior: mesBaixas(mesAnterior(comp), 'receber'),
    pagoMes: mesBaixas(comp, 'pagar'), pagoMesAnterior: mesBaixas(mesAnterior(comp), 'pagar'),
    pagar7: soma(aVencerPagar.filter((x) => x.t.venc! <= addDias(hoje, 6))), pagarAVencer: soma(aVencerPagar),
    receberAberto: indicadores.receber.valor, receberVencido: indicadores.receber.vencido, pagarVencido: indicadores.pagar.vencido,
    entradas30: fluxo.entradas, notasForaZaro: sefaz.resumo.foraZaro, mes: comp,
  });

  // último registro da empresa: auditoria, título cadastrado ou baixa (o que for mais recente)
  const datas = [atividade[0]?.quando.toISOString(), ...titulos.map((t) => t.criadoEm.toISOString()), ...baixas.map((b) => b.data)].filter(Boolean) as string[];
  const ultimaAtualizacao = datas.length ? datas.reduce((a, x) => (x > a ? x : a)) : null;
  return {
    comp, hoje,
    empresa: { nome: emp.fantasia || emp.razao, razao: emp.razao, cnpj: emp.cnpj, regime: regimeEm(emp, hoje) || null },
    ultimaAtualizacao,
    desatualizado: ultimaAtualizacao ? dias(ultimaAtualizacao.slice(0, 10), hoje) > 15 : true,
    indicadores,
    serie, fluxo, areas,
    alertas: ordenados.slice(0, 8), totalAlertas: ordenados.length,
    insights,
    atividades: atividade.slice(0, 8).map((a) => ({ id: a.id, quando: a.quando.toISOString(), acao: a.acao, entidade: a.entidade, usuario: a.usuario, modulo: moduloDaAcao(a.acao) })),
    endividamento: { pgfn: totalDivida, emprestimos: arred(contratos.filter((c) => !/cancel|quitad/i.test(c.status)).reduce((a, c) => a + c.valor, 0)) },
    vazio: titulos.length === 0 && lancs.length === 0,
  };
}

/** Resumo em texto para a ZARO IA: só números da empresa ativa, cada um com a origem e o link interno. */
export function resumoParaIa(d: DadosPainel) {
  const i = d.indicadores;
  const l = [
    `Empresa: ${d.empresa.razao} (CNPJ ${d.empresa.cnpj}); regime ${d.empresa.regime || 'não informado'}. Hoje: ${dataBr(d.hoje)}. Competência em análise: ${compBr(d.comp)}.`,
    i.banco.valor != null
      ? `Saldo bancário efetivo: ${brl(i.banco.valor)} (saldo inicial informado + extrato até ${dataBr(i.banco.ate)}${i.banco.desatualizado ? ', extrato com mais de 7 dias' : ''}). Fonte: extrato bancário. Link: /financeiro?tipo=extrato`
      : 'Saldo bancário: NÃO DISPONÍVEL (saldo inicial não informado). Link: /financeiro?tipo=extrato#saldo',
    `Contas a receber em aberto: ${brl(i.receber.valor)} em ${i.receber.n} título(s); vencidos ${brl(i.receber.vencido)} (${i.receber.nVencido}). Há 30 dias: ${brl(i.receber.antes)}. Fonte: títulos e baixas. Link: /financeiro?tipo=receber`,
    `Contas a pagar em aberto: ${brl(i.pagar.valor)} em ${i.pagar.n} título(s); vencidos ${brl(i.pagar.vencido)} (${i.pagar.nVencido}). Há 30 dias: ${brl(i.pagar.antes)}. Link: /financeiro?tipo=pagar`,
    `Tributos em aberto (títulos a pagar de guias): ${brl(i.tributos.valor)} em ${i.tributos.n}; vencidos ${brl(i.tributos.vencido)} (${i.tributos.nVencido}); vencendo no mês ${brl(i.tributos.noMes)}. Link: /financeiro?tipo=pagar&f=abertos`,
    i.resultado.temLancamentos
      ? `Resultado contábil de ${compBr(d.comp)}: ${brl(i.resultado.valor)}${i.resultado.previa ? ` (PRÉVIA: ${i.resultado.pendentes} lançamento(s) ainda sem aprovação)` : ' (lançamentos aprovados)'}${i.resultado.antes != null ? `; mês anterior ${brl(i.resultado.antes)}` : ''}. Fonte: DRE. Link: /contabilidade?aba=dre&per=mes&ref=${d.comp}`
      : `Resultado de ${compBr(d.comp)}: sem lançamentos contábeis na competência.`,
    `Fluxo projetado 30 dias (títulos em aberto com vencimento): entradas ${brl(d.fluxo.entradas)}, saídas ${brl(d.fluxo.saidas)}, ${d.fluxo.temSaldoInicial ? `saldo final projetado ${brl(d.fluxo.saldoFinal)}` : 'sem saldo inicial (só o líquido do período)'}; vencidos fora da projeção: a receber ${brl(d.fluxo.vencidos.entradas)}, a pagar ${brl(d.fluxo.vencidos.saidas)}.`,
    ...d.fluxo.semanas.map((s) => `  Semana ${dataBr(s.de)}–${dataBr(s.ate)}: entradas ${brl(s.entradas)}, saídas ${brl(s.saidas)}.`),
    `Realizado por mês (baixas registradas), últimos 12 meses: ${d.serie.map((s) => `${compBr(s.mes)} receb. ${brl(s.entradas)} / pag. ${brl(s.saidas)}`).join('; ')}.`,
    `Endividamento: dívida ativa PGFN ${brl(d.endividamento.pgfn)}; empréstimos ativos ${brl(d.endividamento.emprestimos)}. Link: /financeiro?tipo=emprestimos`,
    `Fechamento de ${compBr(d.comp)}: ${d.areas.map((a) => `${a.nome} ${a.pct == null ? 'não se aplica' : a.pct + '%'}${a.proxima ? ` (próxima ação: ${a.proxima.acao}; ${a.proxima.texto}; link ${a.proxima.href})` : ''}`).join('; ')}.`,
    `Alertas (${d.totalAlertas}): ${d.alertas.map((a) => `${a.titulo} — ${a.detalhe} [${a.href}]`).join('; ') || 'nenhum'}.`,
  ];
  return l.join('\n');
}
