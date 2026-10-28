ALTER TABLE "pedido_itens" ADD COLUMN "balde" integer;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "balde" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "produtos" SET "balde" = true WHERE lower("nome") LIKE '%long neck%' OR lower("nome") LIKE '%longneck%' OR (lower("nome") LIKE '%cerveja%' AND lower("nome") LIKE '%lata%');
