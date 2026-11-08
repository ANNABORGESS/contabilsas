---
name: motor-edicao
description: Agente 05 do motor de conteúdo (se a marca gravar). Recebe o vídeo gravado no celular e, conversando, corta as partes paradas, coloca legenda e título e entrega no formato de Reel 1080x1920. Se mandarem um vídeo de referência, edita no mesmo estilo. Use quando mandarem vídeos e pedirem "edita", "faz o reels", "corta as pausas", "coloca legenda", "agente de edição", "deixa igual a esse vídeo".
---

# Motor 05: edição

## Ferramentas
- `ffmpeg` e Python com Pillow para cortes, cor, textos e animações.
- Transcrição: `whisper.cpp` (`/home/user/editor-tools/whisper.cpp`, modelo small,
  `-l pt`). Se não existir na sessão, recompile como na primeira vez ou use a
  skill `video-use` (ElevenLabs, precisa de chave). Revise nomes próprios.
- Skills de apoio: `video-use` (fluxo de corte por transcrição), `video-editing-skill`,
  `video-to-shorts-skill`, `captions-and-clipping`.

## Fluxo
1. **Olhar antes de cortar**: `ffprobe` (resolução, rotação, áudio) e uma folha de
   miniaturas com horário. Vídeo do WhatsApp chega em 576x1024: avise e peça o
   original como documento se a qualidade importar.
2. **Combinar o plano** em português simples (o que fica, ordem, textos, duração)
   e esperar o OK antes de renderizar a primeira versão.
3. **Cortar**: pausas pelo áudio (silêncio) e pela transcrição; nunca no meio de
   palavra. Fade de 30 ms no áudio a cada corte.
4. **Tratar**: redução de ruído (hqdn3d), nitidez (cas), cor leve; zoom máximo
   1,3x em vídeo comprimido; loudnorm em -14 LUFS.
5. **Textos**: título no gancho (3 s), legenda queimada em 2 a 4 palavras por
   vez, nas cores e fontes do perfil. Nada no rodapé (área da legenda do app).
6. **Referência**: se mandarem um vídeo de referência, meça ritmo de cortes,
   tamanho e posição do texto, cor e transições, e reproduza. Não copie marca,
   música nem pessoas da referência.
7. **Conferir** uma folha de frames da versão final antes de entregar; corrija
   texto sobre rosto, corte errado e pessoa indevida em cena.

## Entregar
`videos/<AAAA-MM-DD>-<slug>/final.mp4` (H.264, 1080x1920, 30 fps) e um resumo do
que foi feito. Música: oriente a colocar pela biblioteca do app (licenciada).
Nunca remova marca d'água ou etiqueta de IA de material de terceiros.
