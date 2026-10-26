CREATE TABLE "eventos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"pedido_id" uuid,
	"usuario_id" uuid,
	"descricao" text NOT NULL,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer NOT NULL,
	"nome" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"setor" text NOT NULL,
	"quantidade" integer NOT NULL,
	"preco_centavos" integer NOT NULL,
	"subtotal_centavos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"chave" text NOT NULL,
	"mesa_id" uuid NOT NULL,
	"garcom_id" uuid NOT NULL,
	"total_centavos" integer NOT NULL,
	"forma_pagamento" text NOT NULL,
	"confirmacao" text DEFAULT 'manual_garcom' NOT NULL,
	"pago_em" timestamp with time zone NOT NULL,
	"data_operacional" text NOT NULL,
	"status" text DEFAULT 'pago' NOT NULL,
	"divergencia_preco" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"encerrado_por_id" uuid,
	"encerrado_em" timestamp with time zone,
	"motivo_encerramento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"setor" text NOT NULL,
	"status" text DEFAULT 'novo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"pronto_em" timestamp with time zone,
	"entregue_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" text NOT NULL,
	"setor" text NOT NULL,
	"preco_centavos" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"solicitante_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"decidido_por_id" uuid,
	"decidido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"usuario" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_garcom_id_usuarios_id_fk" FOREIGN KEY ("garcom_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_encerrado_por_id_usuarios_id_fk" FOREIGN KEY ("encerrado_por_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparos" ADD CONSTRAINT "preparos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_decidido_por_id_usuarios_id_fk" FOREIGN KEY ("decidido_por_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_pedido_idx" ON "eventos" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mesas_numero_uq" ON "mesas" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "pedido_itens_pedido_idx" ON "pedido_itens" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_chave_uq" ON "pedidos" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_numero_uq" ON "pedidos" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "pedidos_data_idx" ON "pedidos" USING btree ("data_operacional");--> statement-breakpoint
CREATE INDEX "pedidos_mesa_idx" ON "pedidos" USING btree ("mesa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preparos_pedido_setor_uq" ON "preparos" USING btree ("pedido_id","setor");--> statement-breakpoint
CREATE INDEX "preparos_status_idx" ON "preparos" USING btree ("setor","status");--> statement-breakpoint
CREATE INDEX "solicitacoes_status_idx" ON "solicitacoes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_uq" ON "usuarios" USING btree ("usuario");