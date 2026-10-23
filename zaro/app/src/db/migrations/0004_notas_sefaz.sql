CREATE TABLE "notas_sefaz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"uf" text,
	"numero" text,
	"serie" text,
	"emissao" date,
	"cnpj_emit" text,
	"ie_emit" text,
	"razao_emit" text,
	"cnpj_dest" text,
	"ie_dest" text,
	"razao_dest" text,
	"cfop" text,
	"selagem" text,
	"situacao" text,
	"tipo" text,
	"valor" numeric(14, 2) DEFAULT 0 NOT NULL,
	"pedido" text,
	"recebido_em" timestamp with time zone,
	"recebido_por" text,
	"lancado_em" timestamp with time zone,
	"lancado_por" text,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_sefaz" ADD CONSTRAINT "notas_sefaz_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_sefaz" ADD CONSTRAINT "notas_sefaz_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_sefaz_chave" ON "notas_sefaz" USING btree ("empresa_id","chave");--> statement-breakpoint
CREATE INDEX "notas_sefaz_pedido" ON "notas_sefaz" USING btree ("empresa_id","pedido");