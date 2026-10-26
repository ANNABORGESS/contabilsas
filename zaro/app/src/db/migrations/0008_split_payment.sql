CREATE TABLE "split_operacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"origem" text NOT NULL,
	"evento" text DEFAULT 'pagamento' NOT NULL,
	"data" date NOT NULL,
	"competencia" text NOT NULL,
	"titulo_id" uuid,
	"baixa_id" uuid,
	"nf" text,
	"nf_chave" text,
	"valor_documento" numeric(14, 2),
	"valor_bruto" numeric(14, 2) NOT NULL,
	"ibs_destacado" numeric(14, 2),
	"cbs_destacado" numeric(14, 2),
	"ibs_segregado" numeric(14, 2),
	"cbs_segregado" numeric(14, 2),
	"taxa_psp" numeric(14, 2),
	"valor_liquido" numeric(14, 2),
	"psp" text,
	"id_transacao" text,
	"status" text DEFAULT 'nao_informado' NOT NULL,
	"extrato_id" uuid,
	"regra_versao" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "split_operacoes" ADD CONSTRAINT "split_operacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_operacoes" ADD CONSTRAINT "split_operacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_operacoes" ADD CONSTRAINT "split_operacoes_titulo_id_titulos_id_fk" FOREIGN KEY ("titulo_id") REFERENCES "titulos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "split_chave" ON "split_operacoes" USING btree ("empresa_id","chave");--> statement-breakpoint
CREATE INDEX "split_empresa_comp" ON "split_operacoes" USING btree ("empresa_id","competencia");