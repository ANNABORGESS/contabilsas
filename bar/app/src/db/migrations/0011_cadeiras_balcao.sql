-- balcão com 10 cadeiras: Balcão 1 a Balcão 10 (números 1001 a 1010); o balcão geral sai da tela
INSERT INTO "mesas" ("numero", "nome") SELECT 1000 + g, 'Balcão ' || g FROM generate_series(1, 10) g ON CONFLICT ("numero") DO NOTHING;--> statement-breakpoint
UPDATE "mesas" SET "ativa" = false WHERE "numero" = 0;
