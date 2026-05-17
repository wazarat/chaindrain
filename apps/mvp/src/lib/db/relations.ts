import { relations } from "drizzle-orm/relations";
import { identityInChaindrain, dependency_fingerprintInChaindrain, tier_stateInChaindrain, contract_fingerprintInChaindrain, governance_fingerprintInChaindrain, reputation_signalInChaindrain, similarity_pairInChaindrain } from "./schema";

export const dependency_fingerprintInChaindrainRelations = relations(dependency_fingerprintInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [dependency_fingerprintInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const identityInChaindrainRelations = relations(identityInChaindrain, ({many}) => ({
	dependency_fingerprintInChaindrains: many(dependency_fingerprintInChaindrain),
	tier_stateInChaindrains: many(tier_stateInChaindrain),
	contract_fingerprintInChaindrains: many(contract_fingerprintInChaindrain),
	governance_fingerprintInChaindrains: many(governance_fingerprintInChaindrain),
	reputation_signalInChaindrains: many(reputation_signalInChaindrain),
	similarity_pairInChaindrains_source_entity_id: many(similarity_pairInChaindrain, {
		relationName: "similarity_pairInChaindrain_source_entity_id_identityInChaindrain_entity_id"
	}),
	similarity_pairInChaindrains_target_entity_id: many(similarity_pairInChaindrain, {
		relationName: "similarity_pairInChaindrain_target_entity_id_identityInChaindrain_entity_id"
	}),
}));

export const tier_stateInChaindrainRelations = relations(tier_stateInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [tier_stateInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const contract_fingerprintInChaindrainRelations = relations(contract_fingerprintInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [contract_fingerprintInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const governance_fingerprintInChaindrainRelations = relations(governance_fingerprintInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [governance_fingerprintInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const reputation_signalInChaindrainRelations = relations(reputation_signalInChaindrain, ({one}) => ({
	identityInChaindrain: one(identityInChaindrain, {
		fields: [reputation_signalInChaindrain.entity_id],
		references: [identityInChaindrain.entity_id]
	}),
}));

export const similarity_pairInChaindrainRelations = relations(similarity_pairInChaindrain, ({one}) => ({
	identityInChaindrain_source_entity_id: one(identityInChaindrain, {
		fields: [similarity_pairInChaindrain.source_entity_id],
		references: [identityInChaindrain.entity_id],
		relationName: "similarity_pairInChaindrain_source_entity_id_identityInChaindrain_entity_id"
	}),
	identityInChaindrain_target_entity_id: one(identityInChaindrain, {
		fields: [similarity_pairInChaindrain.target_entity_id],
		references: [identityInChaindrain.entity_id],
		relationName: "similarity_pairInChaindrain_target_entity_id_identityInChaindrain_entity_id"
	}),
}));