CREATE TABLE "catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"unidade" text,
	"ncm" text,
	"categoria" text,
	"preco" numeric(14, 2),
	"custo" numeric(14, 2),
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"data" date NOT NULL,
	"parceiro_id" uuid,
	"cliente" text NOT NULL,
	"doc_cliente" text,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"parcelas" integer DEFAULT 1 NOT NULL,
	"primeiro_venc" date NOT NULL,
	"obs" text,
	"status" text DEFAULT 'Lançada' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogo" ADD CONSTRAINT "catalogo_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogo" ADD CONSTRAINT "catalogo_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogo_empresa" ON "catalogo" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_numero" ON "vendas" USING btree ("empresa_id","numero");