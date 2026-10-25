ALTER TABLE "baixas" ADD COLUMN "desconto" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "baixas" ADD COLUMN "juros" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "baixas" ADD COLUMN "multa" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "baixas" ADD COLUMN "conta" text;--> statement-breakpoint
ALTER TABLE "baixas" ADD COLUMN "dados" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "baixas" ADD COLUMN "arquivo_id" uuid;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "arquivos"("id") ON DELETE set null ON UPDATE no action;