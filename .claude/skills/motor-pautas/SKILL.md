---
name: motor-pautas
description: Agente 02 do motor de conteúdo. Olha as novidades do mercado da marca, os criadores que ela acompanha e os números dos últimos posts, e devolve 5 a 7 pautas do dia com o gancho já escrito, para ela só escolher. Use quando disserem "pautas de hoje", "o que eu posto hoje", "me dá ideias de conteúdo", "agente de pautas" ou no começo de cada dia de trabalho com o motor.
---

# Motor 02: pautas

## Ler antes
1. `.claude/motor/<marca>/perfil.md` (pare e chame `motor-construtor` se não existir).
2. `referencias.md`, os últimos 14 dias de `pautas/` (não repita pauta) e
   `metricas/metricas.csv` (o que funcionou).
3. `agenda/` do mês: datas fixas, eventos da semana, promoções.

## Buscar o que é novo
- **Mercado**: use busca na web, se disponível, para notícias da cidade e do nicho
  da marca nos últimos 7 dias (eventos, datas, calor, feriados, tendências de som).
- **Referências**: para cada perfil de `referencias.md`, peça à dona os links ou
  prints dos posts recentes, ou use o que ela já mandou. Não faça login em rede
  nenhuma. Para achar o que está viralizando, siga o método da skill `ig-viral`.
- **Números**: leia `metricas.csv`. Diga, em uma linha, o formato e o pilar que
  mais renderam e o que menos rendeu. Sem números, diga isso e siga sem eles.
- Se uma fonte não estiver disponível, diga qual faltou. Nunca invente notícia,
  tendência ou número.

## Entregar
5 a 7 pautas, balanceadas entre os pilares, neste formato:

```
### 1. <título curto>
Pilar: <pilar> · Formato: Reel | Carrossel | Story | Post · Rede: IG/TikTok
Gancho: "<primeira frase ou texto da tela, já escrito>"
Por quê: <a evidência: notícia, referência ou número>
Material: <o que precisa gravar ou fotografar, ou "já temos: <arquivo>">
```

- Ganchos pelos padrões das skills `hook-writer` e `ig-reel` (26 fórmulas).
- Texto pelas regras da `ig-human` (sem travessão, sem palavras de IA).
- Grave em `pautas/AAAA-MM-DD.md`. Termine com: "Qual vira roteiro? (número)".
- A escolhida segue para `motor-roteiro` e, se for lista ou passo a passo,
  também para `motor-carrossel`.
