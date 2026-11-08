# Motor de conteúdo

Sete agentes (skills `motor-*`) que levam um assunto da pauta até o post e
medem o resultado. Cada marca tem a sua pasta; os agentes leem e gravam nela.

```
.claude/motor/
├── assets/            fontes (OFL) e logos usados pelas artes
├── vikings/           bar e restaurante (@poraovikings)
└── dindin/            Vikings Dindin Gourmet
    ├── perfil.md      quem é, público, tom, pilares, proibidos, identidade visual
    ├── entrevista.md  respostas do construtor e o que falta (retoma daqui)
    ├── referencias.md criadores e perfis que a marca acompanha
    ├── pautas/        AAAA-MM-DD.md, uma por dia
    ├── roteiros/      <slug>/ reel.md, legenda.md, linkedin.md, artigo.md
    ├── carrosseis/    <slug>/ slides.json e os PNG 1080x1350
    ├── videos/        <slug>/ edições finais e o relatório de corte
    ├── agenda/        AAAA-MM.md, o que está aprovado e quando sai
    ├── metricas/      metricas.csv, um post por linha
    └── newsletter/    AAAA-Www.md, uma por semana
```

## O fluxo

| # | Skill | Entra | Sai |
|---|---|---|---|
| 01 | `motor-construtor` | uma entrevista de uma vez só | `perfil.md` |
| 02 | `motor-pautas` | perfil, mercado, referências, métricas | 5 a 7 pautas com gancho |
| 03 | `motor-roteiro` | a pauta escolhida | roteiro de Reel, legenda, LinkedIn, artigo |
| 04 | `motor-carrossel` | a mesma pauta | slides prontos nas cores da marca |
| 05 | `motor-edicao` | o vídeo gravado no celular | Reel cortado, legendado, com título |
| 06 | `motor-agendamento` | conteúdo aprovado | versão por rede e horário, só com OK |
| 07 | `motor-painel` | números dos posts | painel e newsletter da semana |

## Regras que valem para todos

- Toda peça usa a paleta da marca do `perfil.md`. Referências trazem layout e
  ritmo, nunca as cores delas.

- Nada é publicado ou agendado sem o OK explícito da dona da marca.
- Todo texto passa pelas regras da `ig-human`: sem travessão, sem palavras de IA.
- Posts de bebida alcoólica levam "Proibido para menores de 18 anos. Beba com
  moderação." na legenda (CONAR). Promoção sempre com horário.
- Nenhum número é inventado: métrica, preço ou horário que não está no
  `perfil.md` ou em `metricas/` é perguntado.
- Campos marcados `[confirmar]` no perfil são suposições; o agente pergunta
  antes de usá-los em algo publicado.
