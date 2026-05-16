-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "chaindrain";
--> statement-breakpoint
CREATE TABLE "chaindrain"."tier_state" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"risk_score" numeric NOT NULL,
	"risk_tier" text NOT NULL,
	"coverage_tier" text NOT NULL,
	"tvl_factor" numeric,
	"mutability_factor" numeric,
	"audit_factor" numeric,
	"bounty_factor" numeric,
	"blast_radius_usd" numeric,
	"state" text DEFAULT 'active',
	"last_state_change" timestamp with time zone DEFAULT now(),
	"computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chaindrain"."dependency_fingerprint" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"oracle_providers" text[],
	"oracle_confidence" text,
	"bridge_dependencies" text[],
	"bridge_confidence" text,
	"stablecoin_dependencies" text[],
	"stablecoin_confidence" text,
	"dvn_configuration" text,
	"dvn_confidence" text,
	"dependency_sources" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chaindrain"."contract_fingerprint" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"primary_contract_address" text,
	"implementation_address" text,
	"proxy_pattern" text,
	"upgrade_authority_type" text,
	"admin_address" text,
	"multisig_threshold" integer,
	"timelock_delay_hours" numeric,
	"compiler_version" text,
	"verified_source" boolean,
	"uses_assembly" boolean,
	"external_call_count" integer,
	"audits_tier" integer,
	"audit_firms" text[],
	"last_audit_date" date,
	"audit_links" text,
	"bug_bounty_program" text,
	"bug_bounty_max_payout_usd" numeric,
	"bug_bounty_immunefi_url" text,
	"bug_bounty_launch_date" date,
	"bug_bounty_updated_date" date,
	"bug_bounty_kyc_required" boolean,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chaindrain"."identity" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"sector" text,
	"chain_deployments" text[],
	"tvl_usd" numeric,
	"launch_date" date,
	"is_immutable" text,
	"is_permissionless" text,
	"defillama_slug" text,
	"coingecko_id" text,
	"match_source" text,
	"match_method" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chaindrain"."tier_state" ADD CONSTRAINT "tier_state_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "chaindrain"."identity"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaindrain"."dependency_fingerprint" ADD CONSTRAINT "dependency_fingerprint_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "chaindrain"."identity"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaindrain"."contract_fingerprint" ADD CONSTRAINT "contract_fingerprint_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "chaindrain"."identity"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ts_coverage" ON "chaindrain"."tier_state" USING btree ("coverage_tier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ts_risk_score" ON "chaindrain"."tier_state" USING btree ("risk_score" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_ts_risk_tier" ON "chaindrain"."tier_state" USING btree ("risk_tier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ts_state" ON "chaindrain"."tier_state" USING btree ("state" text_ops);--> statement-breakpoint
CREATE INDEX "idx_dep_bridges" ON "chaindrain"."dependency_fingerprint" USING gin ("bridge_dependencies" array_ops);--> statement-breakpoint
CREATE INDEX "idx_dep_dvn" ON "chaindrain"."dependency_fingerprint" USING btree ("dvn_configuration" text_ops);--> statement-breakpoint
CREATE INDEX "idx_dep_oracles" ON "chaindrain"."dependency_fingerprint" USING gin ("oracle_providers" array_ops);--> statement-breakpoint
CREATE INDEX "idx_dep_stables" ON "chaindrain"."dependency_fingerprint" USING gin ("stablecoin_dependencies" array_ops);--> statement-breakpoint
CREATE INDEX "idx_cf_admin_addr" ON "chaindrain"."contract_fingerprint" USING btree ("admin_address" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cf_audits_tier" ON "chaindrain"."contract_fingerprint" USING btree ("audits_tier" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_cf_contract" ON "chaindrain"."contract_fingerprint" USING btree ("primary_contract_address" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cf_proxy" ON "chaindrain"."contract_fingerprint" USING btree ("proxy_pattern" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cf_upgrade_auth" ON "chaindrain"."contract_fingerprint" USING btree ("upgrade_authority_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_identity_chains" ON "chaindrain"."identity" USING gin ("chain_deployments" array_ops);--> statement-breakpoint
CREATE INDEX "idx_identity_sector" ON "chaindrain"."identity" USING btree ("sector" text_ops);--> statement-breakpoint
CREATE INDEX "idx_identity_slug" ON "chaindrain"."identity" USING btree ("defillama_slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_identity_tvl" ON "chaindrain"."identity" USING btree ("tvl_usd" numeric_ops);--> statement-breakpoint
CREATE VIEW "chaindrain"."mvp_master" AS (SELECT i.entity_id, i.name, i.website, i.sector, i.chain_deployments, i.tvl_usd, i.launch_date, i.is_immutable, i.is_permissionless, i.defillama_slug, i.coingecko_id, cf.primary_contract_address, cf.implementation_address, cf.proxy_pattern, cf.upgrade_authority_type, cf.admin_address, cf.multisig_threshold, cf.timelock_delay_hours, cf.compiler_version, cf.verified_source, cf.uses_assembly, cf.external_call_count, cf.audits_tier, cf.audit_firms, cf.last_audit_date, cf.audit_links, cf.bug_bounty_program, cf.bug_bounty_max_payout_usd, cf.bug_bounty_immunefi_url, df.oracle_providers, df.oracle_confidence, df.bridge_dependencies, df.bridge_confidence, df.stablecoin_dependencies, df.stablecoin_confidence, df.dvn_configuration, df.dvn_confidence, df.dependency_sources, ts.risk_score, ts.risk_tier, ts.coverage_tier, ts.tvl_factor, ts.mutability_factor, ts.audit_factor, ts.bounty_factor, ts.blast_radius_usd, ts.state, ts.last_state_change FROM chaindrain.identity i LEFT JOIN chaindrain.contract_fingerprint cf USING (entity_id) LEFT JOIN chaindrain.dependency_fingerprint df USING (entity_id) LEFT JOIN chaindrain.tier_state ts USING (entity_id));
*/