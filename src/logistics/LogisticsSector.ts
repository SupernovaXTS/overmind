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
    
    constructor(colony: Colony) {
        this.colony = colony;
    }

    get NearbyColonies(): Colony[] {
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
        let colonies = candidates && candidates.length > 0 ? candidates : this.NearbyColonies;
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

        return DirectiveHaulRequest.createIfNotPresent(pos, 'pos', { memory });
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