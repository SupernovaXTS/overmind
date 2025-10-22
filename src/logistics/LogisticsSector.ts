// Acts as a way to transfer resources from one colony with surplus to another colony in need

import { Colony } from "Colony";
import { DirectiveHaulRequest } from "directives/resource/haulRequest";

export class LogisticsSector { 
    // Logic for managing resource transfers between colonies
    colony: Colony;
    static logisticsThreshold: number = 100000; // Minimum surplus to consider transferring
    // Per-resource buffer to avoid depleting source colony; fallback to defaultBuffer when not specified
    static logisticsBuffer: Partial<Record<ResourceConstant, number>> = {
        [RESOURCE_ENERGY]: 200000,
        [RESOURCE_POWER]: 1000,
        [RESOURCE_OPS]: 1000,
    };
    static defaultBuffer: number = 100000;
    static rangeLimit: number = 4; // Maximum range to consider for transfers
    // Populate buffer with all ResourceConstants, applying defaults where unspecified
    
    static initializeBuffers(): void {
        const buf = LogisticsSector.logisticsBuffer;
        const def = LogisticsSector.defaultBuffer;
        // RESOURCES_ALL is a Screeps global array of all ResourceConstant values
        for (const res of (RESOURCES_ALL as ResourceConstant[])) {
            if (buf[res] === undefined) {
                buf[res] = def;
            }
        }
    }

    /**
     * Helper: create a StoreDefinition from [resource, amount] pairs.
     * Example: LogisticsSector.storeFromPairs([RESOURCE_ENERGY, 50000], [RESOURCE_OPS, 100])
     */
    storeFromPairs(...pairs: Array<[ResourceConstant, number]>): StoreDefinition {
        const store: StoreDefinition = {} as StoreDefinition;
        for (const pair of pairs as any[]) {
            if (!pair) continue;
            let resource: ResourceConstant | undefined;
            let amount: number | undefined;
            if (Array.isArray(pair)) {
                resource = pair[0] as ResourceConstant;
                amount = pair[1] as number;
            } else if (typeof pair === 'object' && 'resource' in pair && 'amount' in pair) {
                // Optional support for objects of shape {resource, amount}
                resource = (pair as any).resource as ResourceConstant;
                amount = (pair as any).amount as number;
            } else {
                // Unsupported shape; skip defensively
                continue;
            }
            if (!resource) continue;
            const amt = Math.floor(Number(amount) || 0);
            if (amt <= 0 || !isFinite(amt)) continue;
            store[resource] = ((store[resource] as number) || 0) + amt;
        }
        return store;
    }

    /**
     * Helper: create a StoreDefinition from an array of [resource, amount] pairs.
     * Example: LogisticsSector.storeFromPairArray([[RESOURCE_ENERGY, 50000], [RESOURCE_OPS, 100]])
     */
    storeFromPairArray(pairs: Array<[ResourceConstant, number]>): StoreDefinition {
        return this.storeFromPairs(...pairs);
    }
    
    constructor(colony: Colony) {
        this.colony = colony;
    }

    // Nearby colonies within rangeLimit, excluding self
    get nearbyColonies(): Colony[] {
        const nearbyColonies: Colony[] = [];
        const source = this.colony.room.name;
        for (const name in Overmind.colonies) {
            const otherColony = Overmind.colonies[name] as Colony;
            if (!otherColony) continue;
            // Skip self
            if (otherColony.room.name === source) continue;
            const destination = otherColony.room.name;
            const distance = Game.map.getRoomLinearDistance(source, destination);
            if (distance <= LogisticsSector.rangeLimit) {
                nearbyColonies.push(otherColony);
            }
        }
        return nearbyColonies;
    }

    /**
     * Attempt to fulfill a requested store from a list of candidate colonies (defaults to nearby colonies).
     * Returns the first colony that can fulfill the entire request and a manifest of what to send; otherwise false.
     */
    public supply(request: StoreDefinition | StoreDefinitionUnlimited,
                  candidates?: Colony[]): { colony: Colony; manifest: StoreDefinitionUnlimited } | false {
    let colonies = candidates && candidates.length > 0 ? candidates : this.nearbyColonies;
        // Prefer closest sources first (by linear distance to the requesting colony)
        colonies = colonies.sort((a, b) =>
            Game.map.getRoomLinearDistance(a.room.name, this.colony.room.name)
            - Game.map.getRoomLinearDistance(b.room.name, this.colony.room.name));
        for (const colony of colonies) {
            const manifest = this.buildManifestForColonyIfAvailable(colony, request);
            if (manifest) {
                return { colony, manifest };
            }
        }
        return false;
    }

    /**
     * Create a haul directive at the source colony to move the requested resources to this sector's colony.
     * Returns the directive creation result or false if no supplier can fulfill the request.
     */
    public createHaulDirectiveForRequest(request: StoreDefinition | StoreDefinitionUnlimited,
                                         candidates?: Colony[]): number | string | undefined | false {
        const result = this.supply(request, candidates);
        if (!result) return false;
        const { colony: sourceColony, manifest } = result;

        // Choose a good placement position in the source colony
        const pos: RoomPosition = (sourceColony.storage?.pos
                                || sourceColony.terminal?.pos
                                || sourceColony.controller.pos);

        // Create the directive with memory specifying ownership and routing
        const memory: FlagMemory = {
            [MEM.COLONY]: sourceColony.name,   // directive belongs to source colony
            manifest: manifest,                // what to pick up
            destination: this.colony.name,     // where to bring it
            source: sourceColony.name,         // explicit for clarity
        } as any;

        return DirectiveHaulRequest.createIfNotPresent(pos, 'room', { memory });
    }

    /**
     * High-level convenience method to request resources for this colony.
     * Uses NearbyColonies as the candidate supplier set and creates a haul directive
     * at the selected supplier if possible.
     *
     * Returns the directive creation result (flag name or code) if successful; otherwise false.
     */
    public request(store: StoreDefinition | StoreDefinitionUnlimited): number | string | undefined | false {
        // Explicitly use nearbyColonies as candidates
        return this.createHaulDirectiveForRequest(store, this.nearbyColonies);
    }

    /**
     * Convenience: accept an array of [resource, amount] pairs, build a store via storeFromPairs,
     * and invoke request using nearby colonies.
     * Example: sector.requestFromPairs([[RESOURCE_ENERGY, 50000], [RESOURCE_OPS, 100]])
     */
    public requestFromPairs(pairs: Array<[ResourceConstant, number]>): number | string | undefined | false {
        // Normalize inputs in case a flat tuple [res, amt] was passed instead of [[res, amt]]
        let normalized: Array<[ResourceConstant, number]> = pairs;
        if (pairs && pairs.length === 2 && !Array.isArray((pairs as any)[0]) && typeof (pairs as any)[1] !== 'object') {
            const res = (pairs as any)[0] as ResourceConstant;
            const amt = (pairs as any)[1] as number;
            normalized = [[res, amt]];
        }
        const store = this.storeFromPairArray(normalized);
        return this.request(store);
    }

    /**
     * Convenience: request only energy by amount. Returns false for invalid/non-positive amounts.
     * Example: sector.requestEnergy(100000)
     */
    public requestEnergy(amount: number): number | string | undefined | false {
        const amt = Math.floor(Number(amount) || 0);
        if (amt <= 0 || !isFinite(amt)) return false;
        const store = this.storeFromPairs([RESOURCE_ENERGY, amt]);
        return this.request(store);
    }

    /**
     * Boolean convenience: request only energy and return true/false for success.
     */
    public requestEnergyOk(amount: number): boolean {
        const result = this.requestEnergy(amount);
        if (result === false || result === undefined) return false;
        if (typeof result === 'number' && result < 0) return false; // treat error codes as failure
        return true;
    }

    /**
     * Internal: determine if a single colony can fulfill the request without breaching per-resource buffers.
     * Returns a manifest if possible; otherwise false.
     */
    private buildManifestForColonyIfAvailable(colony: Colony,
                                              store: StoreDefinition | StoreDefinitionUnlimited): StoreDefinitionUnlimited | false {
        const manifest: StoreDefinitionUnlimited = {} as StoreDefinitionUnlimited;
        for (const key in store) {
            const res = key as ResourceConstant;
            const amountRequested = (store[res] as number) || 0;
            if (amountRequested <= 0) continue;

            const available = (colony.assets[res] as number) || 0;
            const buffer = LogisticsSector.logisticsBuffer[res] ?? LogisticsSector.defaultBuffer;
            if (available - amountRequested < buffer) {
                return false;
            }
            manifest[res] = amountRequested;
        }
        return manifest;
    }
}

// Initialize per-resource buffers at module load
LogisticsSector.initializeBuffers();