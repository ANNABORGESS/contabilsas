CREATE TABLE "estoque_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"quantidade" integer NOT NULL,
	"saldo" integer NOT NULL,
	"motivo" text,
	"pedido_id" uuid,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_trava" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estoque_mov_produto_idx" ON "estoque_movimentos" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "estoque_mov_data_idx" ON "estoque_movimentos" USING btree ("criado_em");