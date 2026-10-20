# AKORA Command Center

Internal management system for AKORA, split by journey (Teen, Ciclo, 40+) with AKORA Global on top. See `README.md`.

- Keep journeys separate: a journey's screens use only that journey's data. Business rules live in `src/domain/` and are covered by `npm test`.
- Run `npm test` and `npx tsc -b` before committing.

## Conselho (Roast Room)

- When the founder brings a decision ("should we...", pricing, hiring, budget, a launch), run `/roast-room` with `--jornada teen|ciclo|mais40|global`. For one advisor, use `/roast-room ask <seat> ...`.
- Follow `.claude/skills/roast-room/references/akora.md`: Portuguese for the founder, English card labels, and the limits no option may break (Teen protection, LGPD).
- Councils are saved in `sessions/<date>-<jornada>-<decision>/`; AKORA shows them under Conselho. Follow `references/live-room.md` exactly so AKORA can read them.
- The seats are simulations built from public work. Never present a seat's words as something the real person said unless it is a verbatim quote with a source id from that seat's brain.
