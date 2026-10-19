// Gerador determinístico de DADOS FICTÍCIOS para demonstração.
// Substituir por integrações reais (app, gateway de pagamentos, ERP, plataformas de anúncio)
// mantendo os mesmos tipos de `domain/types.ts`.

import { JOURNEYS, JOURNEY_IDS, type JourneyId } from '../config/journeys'
import {
  ALL_MONTHS,
  REF_DATE,
  addDays,
  addMonths,
  birthdayAt,
  diffDays,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  type ISODate,
  type MonthKey,
} from '../domain/dates'
import { journeyAt } from '../domain/people'
import type {
  Assinatura,
  BriefCriativo,
  Campanha,
  Canal,
  Dataset,
  Despesa,
  JourneySpan,
  Lancamento,
  Material,
  MetaMensal,
  Pessoa,
  PostEditorial,
  Segmentacao,
  Transacao,
} from '../domain/types'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

interface Perfil {
  cadastros: number
  idade: [number, number]
  pAssinar: number
  pAnual: number
  churnMensal: number
  naoRenovaAnual: number
  atividadeBase: number
}

const PERFIS: Record<JourneyId, Perfil> = {
  teen: { cadastros: 2400, idade: [12, 17], pAssinar: 0.5, pAnual: 0.22, churnMensal: 0.022, naoRenovaAnual: 0.3, atividadeBase: 0.5 },
  ciclo: { cadastros: 5100, idade: [18, 39], pAssinar: 0.46, pAnual: 0.3, churnMensal: 0.026, naoRenovaAnual: 0.25, atividadeBase: 0.48 },
  mais40: { cadastros: 1900, idade: [40, 64], pAssinar: 0.52, pAnual: 0.38, churnMensal: 0.018, naoRenovaAnual: 0.2, atividadeBase: 0.55 },
}

export function generateDataset(seed = 20261019): Dataset {
  const rnd = mulberry32(seed)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const int = (a: number, b: number) => Math.floor(between(a, b + 1))

  const pessoas: Pessoa[] = []
  let seq = 0

  for (const jid of JOURNEY_IDS) {
    const perfil = PERFIS[jid]
    const meses = monthRange(monthOf(JOURNEYS[jid].inicio), monthOf(REF_DATE))
    const pesos = meses.map((_, k) => Math.pow(k + 1, 1.15))
    const totalPeso = pesos.reduce((s, p) => s + p, 0)

    for (let i = 0; i < perfil.cadastros; i++) {
      let r = rnd() * totalPeso
      let k = 0
      while (r > pesos[k] && k < meses.length - 1) r -= pesos[k++]
      const inicioMes = monthStart(meses[k])
      const fimMes = meses[k] === monthOf(REF_DATE) ? REF_DATE : monthEnd(meses[k])
      const cadastro = addDays(inicioMes, int(0, diffDays(inicioMes, fimMes)))

      const idade = jid === 'teen' ? int(12, 17) : int(perfil.idade[0], perfil.idade[1])
      const nascimento = addDays(addMonths(cadastro, -idade * 12), -int(0, 364))

      // Histórico de jornadas: a pessoa migra ao completar 18 e 40 anos.
      const historico: JourneySpan[] = [{ jornada: jid, desde: cadastro, ate: null }]
      const fronteiras: [number, JourneyId][] = [
        [18, 'ciclo'],
        [40, 'mais40'],
      ]
      for (const [idadeLimite, proxima] of fronteiras) {
        const atual = historico[historico.length - 1]
        if (JOURNEY_IDS.indexOf(proxima) <= JOURNEY_IDS.indexOf(atual.jornada)) continue
        // Migração no aniversário (ou no lançamento da próxima jornada, se posterior).
        const aniversario = birthdayAt(nascimento, idadeLimite)
        const migracao = aniversario > JOURNEYS[proxima].inicio ? aniversario : JOURNEYS[proxima].inicio
        if (migracao > atual.desde && migracao <= REF_DATE) {
          atual.ate = migracao
          historico.push({ jornada: proxima, desde: migracao, ate: null })
        }
      }

      let encerramento: ISODate | null = null
      if (rnd() < 0.07) {
        const d = addDays(cadastro, int(20, 420))
        if (d < REF_DATE) encerramento = d
      }
      const fimVida = encerramento ?? REF_DATE

      let assinatura: Assinatura | null = null
      if (rnd() < perfil.pAssinar) {
        const inicio = addDays(cadastro, Math.floor(-Math.log(1 - rnd()) * 35))
        if (inicio < fimVida) {
          const plano = rnd() < perfil.pAnual ? 'anual' : 'mensal'
          let cancelamento: ISODate | null = null
          if (plano === 'mensal') {
            for (let m = 1; ; m++) {
              const d = addMonths(inicio, m)
              if (d > fimVida) break
              if (rnd() < perfil.churnMensal) {
                cancelamento = d
                break
              }
            }
          } else {
            for (let y = 1; ; y++) {
              const d = addMonths(inicio, 12 * y)
              if (d > fimVida) break
              if (rnd() < perfil.naoRenovaAnual) {
                cancelamento = d
                break
              }
            }
          }
          if (encerramento && (!cancelamento || encerramento < cancelamento)) cancelamento = encerramento
          assinatura = { plano, inicio, cancelamento }
        }
      }

      // Atividade mensal (agregada): mais alta nos primeiros meses e entre assinantes.
      let atividade = 0
      ALL_MONTHS.forEach((m, idx) => {
        if (m < monthOf(cadastro) || m > monthOf(fimVida)) return
        const k2 = monthRange(monthOf(cadastro), m).length - 1
        const premiumNoMes =
          assinatura && assinatura.inicio <= monthEnd(m) && (!assinatura.cancelamento || assinatura.cancelamento > monthStart(m))
        const p = k2 === 0 ? 0.93 : premiumNoMes ? 0.9 : perfil.atividadeBase + 0.3 * Math.pow(0.8, k2)
        if (rnd() < p) atividade |= 1 << idx
      })

      pessoas.push({
        id: `P${String(++seq).padStart(6, '0')}`,
        cadastro,
        nascimento,
        historico,
        encerramento,
        atividade,
        assinatura,
      })
    }
  }

  // Transações de assinatura: cada cobrança pertence à jornada vigente na data da cobrança.
  const transacoes: Transacao[] = []
  let tseq = 0
  for (const p of pessoas) {
    const a = p.assinatura
    if (!a) continue
    const passo = a.plano === 'mensal' ? 1 : 12
    for (let n = 0; ; n++) {
      const data = addMonths(a.inicio, n * passo)
      if (data > REF_DATE) break
      if (a.cancelamento && data >= a.cancelamento) break
      const jornada = journeyAt(p, data)
      if (!jornada) break
      let status: Transacao['status'] = 'pago'
      if (rnd() < 0.018) status = 'reembolsado'
      else if (diffDays(data, REF_DATE) <= 6 && rnd() < 0.12) status = 'pendente'
      transacoes.push({
        id: `T${String(++tseq).padStart(7, '0')}`,
        pessoaId: p.id,
        jornada,
        data,
        competencia: monthOf(data),
        plano: a.plano,
        tipo: n === 0 ? 'nova' : a.plano === 'anual' ? 'renovacao' : 'recorrencia',
        valor: JOURNEYS[jornada].precos[a.plano],
        status,
      })
    }
  }

  // Campanhas — sempre identificadas por jornada.
  const canaisPorJornada: Record<JourneyId, Canal[]> = {
    teen: ['Instagram', 'TikTok', 'YouTube', 'Parcerias', 'E-mail'],
    ciclo: ['Instagram', 'TikTok', 'Google', 'Influenciadoras', 'E-mail', 'Pinterest'],
    mais40: ['Instagram', 'Google', 'YouTube', 'E-mail', 'Parcerias', 'Influenciadoras'],
  }
  const nomesCampanha: Record<JourneyId, string[]> = {
    teen: ['Volta às aulas com autoestima', 'Corpo em transformação', 'Conversa aberta com responsáveis', 'Embaixadoras escolares', 'Semana do autocuidado', 'Mitos e verdades', 'Férias leves', 'Clube de leitura Teen'],
    ciclo: ['Conheça seu ciclo', 'Premium 30 dias', 'Mês da saúde da mulher', 'Ciclo e produtividade', 'Black Friday Premium', 'Comunidade Ciclo', 'Treino por fase', 'Indique uma amiga'],
    mais40: ['Nova fase, nova energia', 'Climatério sem tabu', 'Sono e bem-estar', 'Premium anual 40+', 'Movimento 40+', 'Encontros com especialistas', 'Nutrição na maturidade', 'Histórias reais'],
  }
  const segAdultas: Segmentacao[] = ['contextual', 'amplo', 'interesses', 'lookalike']
  const segTeen: Segmentacao[] = ['contextual', 'amplo']

  const campanhas: Campanha[] = []
  let cseq = 0
  for (const jid of JOURNEY_IDS) {
    let inicio = JOURNEYS[jid].inicio
    let i = 0
    while (inicio <= addDays(REF_DATE, 40)) {
      const duracao = int(21, 62)
      const fim = addDays(inicio, duracao)
      const tipo = rnd() < 0.72 ? 'paga' : 'organica'
      const escala = jid === 'teen' ? 0.7 : jid === 'ciclo' ? 1.35 : 0.85
      const orcamento = tipo === 'paga' ? Math.round(between(2600, 7800) * escala / 100) * 100 : Math.round(between(300, 900) / 50) * 50
      const status: Campanha['status'] = inicio > REF_DATE ? 'planejada' : fim < REF_DATE ? 'encerrada' : 'ativa'
      const andamento = status === 'planejada' ? 0 : status === 'encerrada' ? 1 : diffDays(inicio, REF_DATE) / duracao
      const investido = round2(orcamento * andamento * between(0.88, 1.02))
      const impressoes = Math.round((tipo === 'paga' ? investido * between(55, 110) : between(15000, 60000) * andamento))
      const cliques = Math.round(impressoes * between(0.009, 0.026))
      const cadastros = Math.round(cliques * between(0.07, 0.16))
      const conversoesPremium = Math.round(cadastros * between(0.14, 0.32))
      campanhas.push({
        id: `C${String(++cseq).padStart(4, '0')}`,
        jornada: jid,
        nome: nomesCampanha[jid][i % nomesCampanha[jid].length] + (i >= nomesCampanha[jid].length ? ' II' : ''),
        canal: pick(canaisPorJornada[jid]),
        tipo,
        objetivo: pick(['aquisicao', 'conversao_premium', 'reengajamento', 'marca'] as const),
        segmentacao: pick(jid === 'teen' ? segTeen : segAdultas),
        usaDadosSaude: false,
        inicio,
        fim,
        orcamento,
        investido,
        impressoes,
        cliques,
        cadastros,
        conversoesPremium,
        status,
      })
      inicio = addDays(inicio, int(16, 34))
      i++
    }
  }

  // Despesas — cada lançamento tem jornada OU regra de rateio explícita.
  const despesas: Despesa[] = []
  let dseq = 0
  const addDespesa = (d: Omit<Despesa, 'id'>) => despesas.push({ ...d, id: `D${String(++dseq).padStart(6, '0')}` })
  ALL_MONTHS.forEach((m, idx) => {
    const g = 1 + idx * 0.035
    addDespesa({ descricao: 'Infraestrutura cloud', categoria: 'tecnologia', competencia: m, valor: round2(5200 * g), destino: { rateio: { tipo: 'usuarias_ativas' } } })
    addDespesa({ descricao: 'APIs de IA (assistente AKORA)', categoria: 'ia', competencia: m, valor: round2(2600 * g * g), destino: { rateio: { tipo: 'usuarias_ativas' } } })
    addDespesa({ descricao: 'Ferramentas SaaS internas', categoria: 'tecnologia', competencia: m, valor: 1850, destino: { rateio: { tipo: 'igual' } } })
    addDespesa({ descricao: 'Equipe de produto e engenharia', categoria: 'pessoal', competencia: m, valor: idx < 10 ? 22000 : 26000, destino: { rateio: { tipo: 'receita' } } })
    addDespesa({ descricao: 'Atendimento e suporte', categoria: 'pessoal', competencia: m, valor: round2(4200 * g), destino: { rateio: { tipo: 'usuarias_ativas' } } })
    addDespesa({ descricao: 'Jurídico, LGPD e compliance', categoria: 'juridico', competencia: m, valor: 3900, destino: { rateio: { tipo: 'percentual', percentuais: { teen: 0.5, ciclo: 0.3, mais40: 0.2 } } } })
    addDespesa({ descricao: 'Administrativo e contabilidade', categoria: 'operacional', competencia: m, valor: 3600, destino: { rateio: { tipo: 'igual' } } })
    if (m >= monthOf(JOURNEYS.teen.inicio)) {
      addDespesa({ descricao: 'Moderação e segurança da comunidade Teen', categoria: 'operacional', competencia: m, valor: 2900, destino: { jornada: 'teen' } })
      addDespesa({ descricao: 'Especialistas em saúde adolescente (conteúdo)', categoria: 'pessoal', competencia: m, valor: 2400, destino: { jornada: 'teen' } })
    }
    if (m >= monthOf(JOURNEYS.ciclo.inicio)) {
      addDespesa({ descricao: 'Revisão médica de conteúdo — Ciclo', categoria: 'pessoal', competencia: m, valor: 3800, destino: { jornada: 'ciclo' } })
    }
    if (m >= monthOf(JOURNEYS.mais40.inicio)) {
      addDespesa({ descricao: 'Revisão médica de conteúdo — climatério', categoria: 'pessoal', competencia: m, valor: 3200, destino: { jornada: 'mais40' } })
    }
  })
  for (const c of campanhas) {
    if (c.investido <= 0) continue
    const ms = monthRange(monthOf(c.inicio), monthOf(c.fim < REF_DATE ? c.fim : REF_DATE))
    const parcela = round2(c.investido / ms.length)
    ms.forEach((m, i) => {
      const valor = i === ms.length - 1 ? round2(c.investido - parcela * (ms.length - 1)) : parcela
      addDespesa({ descricao: `Mídia — ${c.nome}`, categoria: 'marketing', competencia: m, valor, destino: { jornada: c.jornada }, campanhaId: c.id })
    })
  }

  // Calendário editorial (últimos 30 dias e próximos 45).
  const temas: Record<JourneyId, string[]> = {
    teen: ['Autoestima e corpo em transformação', 'Primeira menstruação: mitos e verdades', 'Como conversar com responsáveis', 'Rotina de sono na escola', 'Amizades e redes sociais', 'Kit de autocuidado', 'Esporte e bem-estar', 'Ansiedade em época de provas'],
    ciclo: ['As 4 fases do ciclo', 'Treino de acordo com a fase', 'Alimentação e TPM', 'Produtividade e ciclo', 'Métodos contraceptivos: guia', 'Sono e hormônios', 'Rotina de autocuidado', 'Mitos sobre fertilidade'],
    mais40: ['Climatério sem tabu', 'Sono na maturidade', 'Força e mobilidade', 'Saúde óssea', 'Nutrição 40+', 'Energia e disposição', 'Autoestima em nova fase', 'Rotina de check-ups'],
  }
  const posts: PostEditorial[] = []
  let pseq = 0
  for (const jid of JOURNEY_IDS) {
    for (let d = addDays(REF_DATE, -30); d <= addDays(REF_DATE, 45); d = addDays(d, int(1, 3))) {
      const passado = d < REF_DATE
      posts.push({
        id: `E${String(++pseq).padStart(5, '0')}`,
        jornada: jid,
        data: d,
        canal: pick(canaisPorJornada[jid].filter((c) => c !== 'Google')),
        formato: pick(['Reels', 'Carrossel', 'Stories', 'Vídeo', 'Artigo', 'Newsletter'] as const),
        tema: pick(temas[jid]),
        status: passado ? 'publicado' : diffDays(REF_DATE, d) < 7 ? 'aprovado' : diffDays(REF_DATE, d) < 20 ? 'em_producao' : 'ideia',
      })
    }
  }

  const lancamentos: Lancamento[] = [
    { id: 'L1', jornada: 'teen', nome: 'Guia para responsáveis (área dedicada)', data: '2026-11-10', etapa: 'pre_lancamento', responsavel: 'Produto Teen' },
    { id: 'L2', jornada: 'teen', nome: 'Desafio de autocuidado de férias', data: '2026-12-15', etapa: 'planejamento', responsavel: 'Marketing Teen' },
    { id: 'L3', jornada: 'teen', nome: 'Volta às aulas 2027', data: '2027-02-01', etapa: 'planejamento', responsavel: 'Marketing Teen' },
    { id: 'L4', jornada: 'ciclo', nome: 'Black Friday Premium Anual', data: '2026-11-27', etapa: 'pre_lancamento', responsavel: 'Growth Ciclo' },
    { id: 'L5', jornada: 'ciclo', nome: 'Programa de treinos por fase', data: '2027-01-12', etapa: 'planejamento', responsavel: 'Produto Ciclo' },
    { id: 'L6', jornada: 'ciclo', nome: 'Comunidade Ciclo 2.0', data: '2026-10-05', etapa: 'pos_lancamento', responsavel: 'Comunidade' },
    { id: 'L7', jornada: 'mais40', nome: 'Encontros ao vivo com especialistas', data: '2026-11-18', etapa: 'lancamento', responsavel: 'Marketing 40+' },
    { id: 'L8', jornada: 'mais40', nome: 'Trilha de sono e energia', data: '2027-01-20', etapa: 'planejamento', responsavel: 'Produto 40+' },
  ]

  const materiais: Material[] = JOURNEY_IDS.flatMap((jid, j) => [
    { id: `M${j}1`, jornada: jid, nome: `Guia de marca — ${JOURNEYS[jid].nome}`, tipo: 'Guia de marca' as const, atualizado: '2026-08-12' },
    { id: `M${j}2`, jornada: jid, nome: 'Templates de carrossel', tipo: 'Template' as const, atualizado: '2026-09-30' },
    { id: `M${j}3`, jornada: jid, nome: 'Banco de fotos licenciadas', tipo: 'Fotografia' as const, atualizado: '2026-07-22' },
    { id: `M${j}4`, jornada: jid, nome: 'Roteiros de Reels aprovados', tipo: 'Roteiro' as const, atualizado: '2026-10-08' },
    { id: `M${j}5`, jornada: jid, nome: 'Biblioteca de copys por fase do funil', tipo: 'Copy' as const, atualizado: '2026-10-14' },
    { id: `M${j}6`, jornada: jid, nome: 'Vídeo manifesto', tipo: 'Vídeo' as const, atualizado: '2026-05-02' },
  ])

  const briefs: BriefCriativo[] = JOURNEY_IDS.flatMap((jid, j) => [
    { id: `B${j}1`, jornada: jid, titulo: `Campanha de fim de ano — ${JOURNEYS[jid].nome}`, formato: 'Reels + Stories', status: 'criação' as const, prazo: '2026-11-04' },
    { id: `B${j}2`, jornada: jid, titulo: 'Carrossel educativo mensal', formato: 'Carrossel', status: 'revisão' as const, prazo: '2026-10-24' },
    { id: `B${j}3`, jornada: jid, titulo: 'Landing page Premium', formato: 'Web', status: 'briefing' as const, prazo: '2026-11-15' },
    { id: `B${j}4`, jornada: jid, titulo: 'Newsletter de novembro', formato: 'E-mail', status: 'aprovado' as const, prazo: '2026-10-28' },
  ])

  // Metas de 2026 derivadas do desempenho do 4º trimestre de 2025 (+ crescimento planejado).
  const metas: MetaMensal[] = []
  const baseMeses: MonthKey[] = ['2025-10', '2025-11', '2025-12']
  for (const jid of JOURNEY_IDS) {
    const novasBase = pessoas.filter((p) => p.historico[0].jornada === jid && baseMeses.includes(monthOf(p.cadastro))).length / 3
    const fatBase = transacoes.filter((t) => t.jornada === jid && baseMeses.includes(t.competencia) && t.status !== 'reembolsado').reduce((s, t) => s + t.valor, 0) / 3
    const assBase = transacoes.filter((t) => t.jornada === jid && baseMeses.includes(t.competencia) && t.tipo === 'nova').length / 3
    const mktBase = despesas.filter((d) => d.categoria === 'marketing' && 'jornada' in d.destino && d.destino.jornada === jid && baseMeses.includes(d.competencia)).reduce((s, d) => s + d.valor, 0) / 3
    monthRange('2026-01', '2026-12').forEach((m, i) => {
      const f = Math.pow(1.085, i + 1)
      metas.push({
        jornada: jid,
        mes: m,
        novasUsuarias: Math.round(novasBase * f),
        faturamento: Math.round(fatBase * Math.pow(1.1, i + 1)),
        novasAssinaturas: Math.round(assBase * f),
        retencao: jid === 'mais40' ? 0.975 : 0.97,
        conversao: jid === 'teen' ? 0.07 : 0.1,
        investimentoMarketing: Math.round((mktBase * 1.05) / 100) * 100,
      })
    })
  }

  return { demo: true, pessoas, transacoes, despesas, campanhas, posts, lancamentos, materiais, briefs, metas }
}

let cache: Dataset | null = null
export function getDataset(): Dataset {
  if (!cache) cache = generateDataset()
  return cache
}
