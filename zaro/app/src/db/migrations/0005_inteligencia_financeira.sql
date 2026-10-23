CREATE TABLE "cobrancas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente" text NOT NULL,
	"nome_cliente" text NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"canal" text,
	"valor" numeric(14, 2),
	"data_prometida" date,
	"obs" text,
	"usuario" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_linhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"area" text NOT NULL,
	"natureza" text DEFAULT 'despesa' NOT NULL,
	"mes" integer NOT NULL,
	"valor" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ano" integer NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'Original' NOT NULL,
	"status" text DEFAULT 'Rascunho' NOT NULL,
	"base_id" uuid,
	"aprovado_por" text,
	"aprovado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_linhas" ADD CONSTRAINT "orcamento_linhas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_linhas" ADD CONSTRAINT "orcamento_linhas_orcamento_id_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobrancas_empresa_cliente" ON "cobrancas" USING btree ("empresa_id","cliente");--> statement-breakpoint
CREATE UNIQUE INDEX "orcamento_linhas_uq" ON "orcamento_linhas" USING btree ("orcamento_id","area","natureza","mes");--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_ano" ON "orcamentos" USING btree ("empresa_id","ano");