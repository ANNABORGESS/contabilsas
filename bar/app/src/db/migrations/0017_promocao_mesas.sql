ALTER TABLE "promocoes" ADD COLUMN "mesas" jsonb;--> statement-breakpoint
UPDATE "promocoes" SET "mesas" = '[1010]'::jsonb WHERE "nome" = 'Original em dobro';
