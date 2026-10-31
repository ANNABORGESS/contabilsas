ALTER TABLE "pedido_itens" ADD COLUMN "quantidade_cancelada" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "itens_cancelados_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "mesas" ("numero", "nome") VALUES (0, 'Balcão') ON CONFLICT ("numero") DO NOTHING;
