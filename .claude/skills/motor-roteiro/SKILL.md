---
name: motor-roteiro
description: Agente 03 do motor de conteúdo. Transforma a pauta escolhida em roteiro de Reel pronto para gravar e legenda pronta para publicar, no tom da marca, e do mesmo assunto tira o post de LinkedIn e o artigo. Use quando escolherem uma pauta ("faz a 3", "vira roteiro"), ou disserem "roteiro de reel", "legenda disso", "agente de roteiro", "post de LinkedIn sobre isso".
---

# Motor 03: roteiro e legenda

## Ler antes
- `.claude/motor/<marca>/perfil.md`: tom, proibidos, público.
- A pauta escolhida em `pautas/AAAA-MM-DD.md`.

## Produzir (pasta `roteiros/<AAAA-MM-DD>-<slug>/`)

1. **`reel.md`**: siga a skill `ig-reel`.
   - 3 opções de gancho com nota, a melhor primeiro.
   - Roteiro falado em frases curtas, no jeito de falar da dona.
   - Texto de tela por trecho e marcação de tempo (beat sheet), 15 a 45 s.
   - Plano de gravação: onde, quais tomadas, o que mostrar. Reaproveite o que já
     existe (vídeos e fotos da marca) e diga qual arquivo.
2. **`legenda.md`**: siga a skill `ig-caption`.
   - Primeira linha que sobrevive ao "... mais", uma chamada para ação só,
     3 a 5 hashtags, termos de busca local (cidade, bairro).
   - Avisos obrigatórios do perfil (ex.: +18 e beba com moderação para bebida).
3. **`linkedin.md`**: só se a marca usa LinkedIn ou a dona pedir. Siga
   `linkedin-post-writer`: história do negócio, bastidor, número real.
4. **`artigo.md`**: só se pedirem (blog ou Google Meu Negócio). Siga
   `copywriting` e `content-strategy`; nada de afirmação sem fonte.

## Revisar antes de mostrar
- Passe tudo pelas regras da `ig-human`.
- Confira os proibidos do perfil linha por linha. Horário, preço e promoção só se
  estiverem no perfil ou na agenda; senão, marque `[confirmar]`.

## Entregar
Mostre gancho, roteiro e legenda prontos para copiar. Pergunte se quer o
carrossel (`motor-carrossel`) ou se ela vai gravar (`motor-edicao`).
