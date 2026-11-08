---
name: motor-carrossel
description: Agente 04 do motor de conteúdo. Transforma o assunto escolhido em carrossel com a arte pronta (PNG 1080x1350) nas cores, fontes e fotos da marca, sem abrir o Canva. O estilo é escolhido uma vez e fica salvo no perfil. Use quando disserem "carrossel", "faz os slides", "post de várias imagens", "agente de carrossel" ou quando uma pauta for lista ou passo a passo.
---

# Motor 04: carrossel

## Ler antes
- `.claude/motor/<marca>/perfil.md`, seção **Identidade visual** (cores hex,
  fontes, logo, estilo escolhido).
- Fontes em `.claude/motor/assets/fonts/`, logos em `.claude/motor/assets/logos/`.
- Fotos: as que a dona mandou nesta conversa ou as já usadas pela marca.

## Estilo (uma vez só)
Se o perfil não tiver `Estilo do carrossel:`, mostre 3 opções com uma capa de
exemplo de cada e grave a escolhida no perfil:
- **Bloco de cor**: fundo na cor do assunto, palavra repetida em Anton ao fundo,
  foto em cartão branco inclinado (o estilo do Dindin).
- **Faixa laranja**: foto escura, faixa inclinada com texto preto em Poppins
  ExtraBold, selo branco com borda (o estilo do Vikings).
- **Editorial**: creme, serifada (Instrument Serif), uma foto grande por slide.

## Montar
1. Copy dos slides pela skill `carousel-writer`: capa que faz deslizar, uma
   ideia por slide, último slide com uma chamada (salvar, comentar, WhatsApp).
   Máximo 8 a 10 slides. Regras da `ig-human`.
2. Grave `carrosseis/<AAAA-MM-DD>-<slug>/slides.json`.
3. Renderize em Python com Pillow (1080x1350, JPEG qualidade 94), usando só as
   cores e fontes do perfil. Pode usar o renderizador da skill
   `instagram-carousel-skill` (`scripts/render_carousel.py`) como base.
4. Confira cada slide numa folha de miniaturas antes de entregar: texto fora da
   borda, texto sobre o rosto, contraste baixo. Corrija e renderize de novo.
5. Gere `grade.jpg` com as capas, e entregue os PNG e a legenda (`ig-caption`).

## Cuidados
- Foto de produto: use a real; não gere produto com IA.
- Sem número, preço ou depoimento que não esteja confirmado.
