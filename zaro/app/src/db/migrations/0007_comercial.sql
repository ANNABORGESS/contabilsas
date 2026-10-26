CREATE TABLE "docs_comerciais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"numero" integer NOT NULL,
	"data" date NOT NULL,
	"prazo" date,
	"parceiro_id" uuid,
	"parceiro" text,
	"doc_parceiro" text,
	"referencia" text,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"condicao" text,
	"status" text NOT NULL,
	"origem_id" uuid,
	"obs" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "docs_comerciais" ADD CONSTRAINT "docs_comerciais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs_comerciais" ADD CONSTRAINT "docs_comerciais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs_comerciais" ADD CONSTRAINT "docs_comerciais_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "docs_comerciais_numero" ON "docs_comerciais" USING btree ("empresa_id","tipo","numero");--> statement-breakpoint
CREATE INDEX "docs_comerciais_empresa" ON "docs_comerciais" USING btree ("empresa_id","tipo");