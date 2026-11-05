ALTER TABLE "produtos" ADD COLUMN "servir_direto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- bebidas prontas (cervejas, refrigerante, água...) saem direto; drinks preparados continuam no painel do bar
UPDATE "produtos" SET "servir_direto" = true WHERE "setor" = 'bar' AND "categoria" NOT ILIKE '%drink%' AND "nome" NOT ILIKE '%caipi%' AND "nome" NOT ILIKE '%gin%' AND "nome" NOT ILIKE '%suco%';
