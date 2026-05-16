import { relations } from "drizzle-orm/relations";
import { identityInChaindrain, tier_stateInChaindrain, dependency_fingerprintInChaindrain, contract_fingerprintInChaindrain } from "./schema";

export const tier_stateInChaindrainRelations = relations(tier_stateInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [tier_stateInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const identityInChaindrainRelations = relations(identityInChaindrain, ({many}) => ({
	tier_stateInChaindrains: many(tier_stateInChaindrain),
	dependency_fingerprintInChaindrains: many(dependency_fingerprintInChaindrain),
	contract_fingerprintInChaindrains: many(contract_fingerprintInChaindrain),
}));

export const dependency_fingerprintInChaindrainRelations = relations(dependency_fingerprintInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [dependency_fingerprintInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const contract_fingerprintInChaindrainRelations = relations(contract_fingerprintInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [contract_fingerprintInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));