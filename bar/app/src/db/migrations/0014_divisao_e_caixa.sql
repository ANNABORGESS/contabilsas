CREATE TABLE "caixa_fechamentos" (
	"data" text PRIMARY KEY NOT NULL,
	"troco_inicial_centavos" integer DEFAULT 0 NOT NULL,
	"sistema" jsonb NOT NULL,
	"conferido" jsonb NOT NULL,
	"observacao" text,
	"fechado_por_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"forma" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pessoa" text
);
--> statement-breakpoint
ALTER TABLE "caixa_fechamentos" ADD CONSTRAINT "caixa_fechamentos_fechado_por_id_usuarios_id_fk" FOREIGN KEY ("fechado_por_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_pagamentos" ADD CONSTRAINT "pedido_pagamentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_pagamentos_pedido_idx" ON "pedido_pagamentos" USING btree ("pedido_id");--> statement-breakpoint
-- pedidos antigos: um pagamento só, com a forma informada
INSERT INTO "pedido_pagamentos" ("pedido_id", "forma", "valor_centavos") SELECT "id", "forma_pagamento", "total_centavos" FROM "pedidos" p WHERE NOT EXISTS (SELECT 1 FROM "pedido_pagamentos" x WHERE x."pedido_id" = p."id");
