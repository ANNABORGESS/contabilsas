# AKORA Command Center

Sistema administrativo **privado** de gestão empresarial da AKORA. Não é o aplicativo AKORA — é o escritório interno da empresa.

A operação é dividida por jornada. Cada jornada funciona como uma unidade de negócio independente, e a **AKORA Global** consolida os resultados da empresa:

| Ambiente | Público | Módulos |
| --- | --- | --- |
| **AKORA Global** (tela inicial) | Empresa | Visão consolidada · Teen × Ciclo × 40+ · Financeiro consolidado · Metas da empresa · Relatórios |
| **AKORA Teen** | 12–17 anos | Dashboard · Usuárias · Financeiro · Marketing Office · Assinaturas · Metas · Relatórios |
| **AKORA Ciclo** | 18–39 anos | idem |
| **AKORA 40+** | 40+ anos | idem |

> Todos os números são **fictícios** (gerados em `src/data/seed.ts`) até que as integrações reais sejam configuradas.

## Como rodar

```bash
npm install
npm run dev        # desenvolvimento
npm test           # regras de negócio
npm run build      # build estático em dist/
```

## Regras de negócio implementadas

- **Sem misturar resultados entre modos.** Cada tela de jornada lê apenas os dados da própria jornada (`computeAllRows` em `src/domain/metrics.ts`).
- **Pessoa única no global.** Usuárias são contadas por id. Quem migra de Teen para Ciclo (aos 18) ou de Ciclo para 40+ (aos 40) aparece no histórico das duas jornadas, mas conta **uma vez** no total global. A Visão consolidada mostra a deduplicação explicitamente.
- **Receita na jornada e no período certos.** Cada cobrança pertence à jornada vigente na data da cobrança; o histórico anterior à migração fica na jornada de origem.
- **Despesas com jornada ou rateio explícito.** Todo lançamento tem `destino: { jornada }` ou `destino: { rateio }` (usuárias ativas, receita, igualitário ou percentual fixo). O rateio é feito em centavos e a soma das parcelas é sempre igual ao valor original; o global usa o valor original, sem duplicar. Jornadas que ainda não operavam na competência não recebem rateio.
- **Campanhas identificadas por jornada.**
- **Proteção de menores (Teen).** Bloqueio de segmentação comportamental, por interesses e de públicos semelhantes, e de uso comercial de dados de saúde (`src/domain/compliance.ts`). Dados de saúde também são bloqueados para segmentação nas demais jornadas.
- **Indicadores agregados.** O painel não exibe dados pessoais; identificadores são pseudonimizados.

As regras estão cobertas por testes em `src/domain/rules.test.ts`.

## Jornadas e funções ainda não lançadas

- `src/config/journeys.ts` define cada jornada, inclusive `status: 'ativa' | 'pre_lancamento'`. Em pré-lançamento o escritório continua navegável, mas as ações operacionais (como criar campanhas) ficam desativadas.
- `FEATURES_EM_BREVE` lista o que depende de integrações (IA de marketing, Creative Studio, gateway de pagamentos, analytics do app). Essas áreas aparecem marcadas como "Em breve".

## Estrutura

```
src/
  config/journeys.ts      jornadas, cores da marca, módulos, status
  data/seed.ts            gerador determinístico de dados fictícios
  domain/                 regras: datas, pessoas, rateio, compliance, métricas, metas
  components/             layout (sidebar + seletor de jornada), UI, gráficos, exportação
  pages/global/           Visão consolidada e comparativo Teen × Ciclo × 40+
  pages/journey/          Dashboard, Usuárias, Marketing Office, Assinaturas
  pages/shared/           Financeiro, Metas e Relatórios (por jornada e global)
```

## Interface

Identidade AKORA: Deep Plum `#423566`, Soft Lavender `#B9B0CF`, Rose `#C2877B`, Soft White `#FAF7F5`. Sidebar com as quatro áreas, seletor de jornada no topo (que mantém o módulo ao trocar de jornada), filtro de período, pesquisa de módulos e campanhas, tabelas com busca e ordenação, e exportação para Excel (`.xlsx`) e PDF (impressão do navegador).

## Próximos passos (integrações)

Substituir `generateDataset()` por adaptadores que entreguem os mesmos tipos de `src/domain/types.ts`: dados agregados do app, gateway de pagamentos, ERP/contabilidade (alíquotas reais no DRE) e plataformas de anúncios.
