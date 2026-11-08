# AKORA Command Center

Internal management system for AKORA, split by journey (Teen, Ciclo, 40+) with AKORA Global on top. See `README.md`.

- Keep journeys separate: a journey's screens use only that journey's data. Business rules live in `src/domain/` and are covered by `npm test`.
- Run `npm test` and `npx tsc -b` before committing.

## Conselho (Roast Room)

- When the founder brings a decision ("should we...", pricing, hiring, budget, a launch), run `/roast-room` with `--jornada teen|ciclo|mais40|global`. For one advisor, use `/roast-room ask <seat> ...`.
- Follow `.claude/skills/roast-room/references/akora.md`: Portuguese for the founder, English card labels, and the limits no option may break (Teen protection, LGPD).
- Councils are saved in `sessions/<date>-<jornada>-<decision>/`; AKORA shows them under Conselho. Follow `references/live-room.md` exactly so AKORA can read them.
- The seats are simulations built from public work. Never present a seat's words as something the real person said unless it is a verbatim quote with a source id from that seat's brain.

## Redes sociais

- `.claude/skills/` also holds 110 social media skills (MIT, from social-media-skills): brand and voice, hooks, captions, carousels, Reels, TikTok, LinkedIn, calendars, plus scripted ones (`instagram-carousel-skill`, `tiktok-slideshow-skill`, `video-editing-skill`, `video-to-shorts-skill`). Their tool guides live in `.claude/social-media/tools/`.
- Never publish or schedule a post (WoopSocial or any other tool) without the founder's explicit go. Teen-journey content follows the Teen protection rules in `.claude/skills/roast-room/references/akora.md`.

## Motor de conteúdo

- Seven skills run content end to end: `motor-construtor` (interview → `perfil.md`), `motor-pautas`, `motor-roteiro`, `motor-carrossel`, `motor-edicao`, `motor-agendamento`, `motor-painel`. See `.claude/motor/README.md`.
- Each brand has its folder in `.claude/motor/<marca>/` (`vikings`, `dindin`). Read its `perfil.md` before writing anything for that brand; `[confirmar]` fields are guesses to ask about, never to publish.
- Nothing is posted or scheduled without the founder's explicit OK for that post. Metrics come only from what she sends; never estimate them.
