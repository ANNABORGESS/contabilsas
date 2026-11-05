CREATE TABLE "caixa_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" text NOT NULL,
	"tipo" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"motivo" text,
	"usuario_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promocoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade_combo" integer NOT NULL,
	"preco_combo_centavos" integer NOT NULL,
	"dias" jsonb NOT NULL,
	"inicio" text NOT NULL,
	"fim" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"destaque" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD COLUMN "unidades" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD COLUMN "promocao_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "estorno_conferido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "estorno_conferido_por_id" uuid;--> statement-breakpoint
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promocoes" ADD CONSTRAINT "promocoes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caixa_mov_data_idx" ON "caixa_movimentos" USING btree ("data");--> statement-breakpoint
INSERT INTO "promocoes" ("nome", "produto_id", "quantidade_combo", "preco_combo_centavos", "dias", "inicio", "fim", "destaque")
SELECT 'Original em dobro', "id", 2, 1200, '[0,1,2,3,4,5,6]'::jsonb, '18:00', '20:00', 'Original em dobro das 18h às 20h'
FROM "produtos" WHERE "nome" ILIKE '%original%' AND "setor" = 'bar' ORDER BY "ativo" DESC, "nome" LIMIT 1;
