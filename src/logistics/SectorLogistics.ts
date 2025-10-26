import {Colony} from '../Colony';
import {log} from '../console/log';
import {LogisticsRequest} from './LogisticsNetwork';
import {minBy} from '../utilities/utils';
import {Cartographer} from '../utilities/Cartographer';

interface MergedRequest {
	colony: Colony;
	storage: StructureStorage | undefined;
	resourceRequests: { [resourceType: string]: number };
	totalRequests: number;
}

// SectorLogistics colony state system inspired by TerminalNetwork
export enum SL_STATE {
    activeProvider   = 5,
    passiveProvider  = 4,
    equilibrium      = 3,
    passiveRequestor = 2,
    activeRequestor  = 1,
    error            = 0,
}

interface SLThresholds {
    target: number;
    surplus?: number;
    tolerance: number;
}

const DEFAULT_SL_THRESHOLDS: SLThresholds = {
    target: 10000,
    surplus: 50000,
    tolerance: 2000,
};

export class SectorLogistics {

	colony: Colony;
	// New properties for sector logistics state system
	colonyStates: { [colName: string]: { [resourceType: string]: SL_STATE } };
	colonyThresholds: { [colName: string]: { [resourceType: string]: SLThresholds } };
	activeProviders: { [resourceType: string]: Colony[] };
	passiveProviders: { [resourceType: string]: Colony[] };
	equilibriumNodes: { [resourceType: string]: Colony[] };
	passiveRequestors: { [resourceType: string]: Colony[] };
	activeRequestors: { [resourceType: string]: Colony[] };

	// Central pool memory (lazy accessors)
	private static get pool(): { [colony: string]: {
		colony: string;
		room: string;
		manifest: StoreDefinitionUnlimited;
		tick: number;
		storageId?: Id<StructureStorage>;
		maxRange?: number; // linear room distance hint for suppliers
	} } {
		const root = (Memory as any).Overmind || (Memory.Overmind = {} as any);
		if (!root.sectorLogistics) root.sectorLogistics = {};
		if (!root.sectorLogistics.pool) root.sectorLogistics.pool = {};
		return root.sectorLogistics.pool as any;
	}
	private static set pool(val: { [colony: string]: any }) {
		const root = (Memory as any).Overmind || (Memory.Overmind = {} as any);
		if (!root.sectorLogistics) root.sectorLogistics = {};
		root.sectorLogistics.pool = val;
	}

	constructor(colony: Colony) {
		this.colony = colony;
		// Initialize new properties
		this.colonyStates = {};
		this.colonyThresholds = {};
		this.activeProviders = {};
		this.passiveProviders = {};
		this.equilibriumNodes = {};
		this.passiveRequestors = {};
		this.activeRequestors = {};
	}

	refresh(): void {
		// Ensure root memory structures exist
		const root = (Memory as any).Overmind || (Memory.Overmind = {} as any);
		root.sectorLogistics = root.sectorLogistics || {};
		root.sectorLogistics.pool = root.sectorLogistics.pool || {};
		// If colony lost storage, clear any lingering pool entry
		if (!this.colony.storage) {
			delete (root.sectorLogistics.pool as any)[this.colony.name];
		}
		this.colonyStates = {};
		this.colonyThresholds = {};
		this.activeProviders = {};
		this.passiveProviders = {};
		this.equilibriumNodes = {};
		this.passiveRequestors = {};
		this.activeRequestors = {};
	}

	init(): void {
		// Initialize logistics network if not present
		if (!this.colony.logisticsNetwork) {
			this.colony.logisticsNetwork = {
				requests: [],
			} as any;
		}
		// Optionally, clear previous requests or perform setup
	}

	run(): void {
		// Publish current unfulfilled requests for this colony
		this.publishUnfulfilledRequests();
	}

	// ========== Central Pool API ==========
	/**
	 * Publish this colony's unfulfilled input requests to the central pool as a manifest.
	 * Only publishes if the colony has storage (designated inter-colony deposit).
	 */
	publishUnfulfilledRequests(): void {
		// Only colonies with storage should participate
		if (!this.colony.storage) {
			delete SectorLogistics.pool[this.colony.name];
			return;
		}
		const merged = this.getUnfulfilledRequests();
		const manifest: StoreDefinitionUnlimited = {} as any;
		for (const res in merged.resourceRequests) {
			const resource = res as ResourceConstant;
			const amt = merged.resourceRequests[resource] || 0;
			if (amt <= 0) continue;
			// If this colony has a terminal, first check if the terminal network can obtain this amount.
			// Only include in the sector manifest if the network cannot fulfill it.
			if (this.colony.terminal && Overmind.terminalNetwork) {
				// Only check terminal network in run phase
				if (typeof PHASE !== 'undefined' && PHASE === 'run') {
					try {
						const totalDesired = (this.colony.assets[resource] || 0) + amt;
						const tnCan = Overmind.terminalNetwork.canObtainResource(this.colony, resource, totalDesired);
						if (!tnCan) {
							(manifest as any)[resource] = Math.ceil(amt);
						}
					} catch (e) {
						// If any error occurs, fall back to not publishing for terminals this tick
					}
				} else {
					// Not in run phase, always include
					(manifest as any)[resource] = Math.ceil(amt);
				}
			} else {
				// No terminal; always include
				(manifest as any)[resource] = Math.ceil(amt);
			}
		}
		// If nothing to request, remove any previous entry and return
		const totalRequested = _.sum(_.values(manifest as any) as number[]);
		if (totalRequested <= 0) {
			delete SectorLogistics.pool[this.colony.name];
			return;
		}
		const maxRange = ((Memory.settings as any)?.logistics?.intercolony?.rangeLimit as number) || undefined;
		SectorLogistics.pool[this.colony.name] = {
			colony : this.colony.name,
			room   : this.colony.room.name,
			manifest,
			tick   : Game.time,
			storageId: this.colony.storage?.id,
			maxRange,
		};
	}

	/**
	 * Deprecated: pool processing is now handled by SectorTransportOverlord creeps rather than directives.
	 * This remains as a no-op to retain API compatibility if called.
	 */
	static processPool(_maxPerTick = 0): void { /* intentionally empty */ }

	/**
	 * Manually create a sector logistics request for a colony
	 */
	static createRequest(colonyName: string, resourceType: ResourceConstant, amount: number): boolean {
		const colony = Overmind.colonies[colonyName];
		if (!colony || !colony.storage) {
			log.warn(`Cannot create sector request: colony '${colonyName}' not found or has no storage`);
			return false;
		}
		
		const amt = Math.floor(amount);
		if (amt <= 0) {
			log.warn(`Cannot create sector request: amount must be positive (got ${amount})`);
			return false;
		}
		
		const manifest: StoreDefinitionUnlimited = {} as any;
		(manifest as any)[resourceType] = amt;
		
		SectorLogistics.pool[colonyName] = {
			colony: colonyName,
			room: colony.room.name,
			manifest,
			tick: Game.time,
			storageId: colony.storage.id,
		};
		
		log.info(`Created sector request: ${colonyName} requests ${amt} ${resourceType}`);
		return true;
	}

	/**
	 * Gets all unfulfilled requests from the colony's logistics network and merges them
	 * into a single request coming from the colony's storage
	 */
	getUnfulfilledRequests(): MergedRequest {
		const mergedRequest: MergedRequest = {
			colony          : this.colony,
			storage         : this.colony.storage,
			resourceRequests: {},
			totalRequests   : 0
		};

		if (!this.colony.logisticsNetwork || !this.colony.logisticsNetwork.requests) {
			return mergedRequest;
		}

		// Iterate through all logistics requests
		for (const request of this.colony.logisticsNetwork.requests) {
			// Only consider input requests (positive amounts) that are unfulfilled
			if (request.amount > 0) {
				const resourceType = request.resourceType;
				
				// Skip 'all' resource type requests as they can't be meaningfully merged
				if (resourceType === 'all') {
					continue;
				}

				// Calculate the effective unfulfilled amount considering targeting transporters
				const predictedAmount = this.getEffectiveRequestAmount(request);
				
				if (predictedAmount > 0) {
					// Merge into the resource requests
					if (!mergedRequest.resourceRequests[resourceType]) {
						mergedRequest.resourceRequests[resourceType] = 0;
					}
					mergedRequest.resourceRequests[resourceType] += predictedAmount;
					mergedRequest.totalRequests++;
				}
			}
		}

		return mergedRequest;
	}

	/**
	 * Helper method to get the effective amount of a request, accounting for
	 * transporters already targeting it
	 */
	private getEffectiveRequestAmount(request: LogisticsRequest): number {
		// Start with the base request amount
		let effectiveAmount = request.amount;

		// If there are transporters targeting this request, reduce the effective amount
		if (request.target.targetedBy && request.target.targetedBy.length > 0) {
			// Sum up the carry capacity of targeting transporters
			let incomingAmount = 0;
			for (const transporterName of request.target.targetedBy) {
				const transporter = Game.creeps[transporterName];
				if (transporter && request.resourceType !== 'all') {
					incomingAmount += transporter.store[request.resourceType as ResourceConstant] || 0;
				}
			}
			effectiveAmount = Math.max(0, effectiveAmount - incomingAmount);
		}

		return effectiveAmount;
	}

	assignColonyStates(): void {
        // For each colony in sector, for each resource, assign state
        // Use Cartographer.getSectorKey(colony.room.name) for sector membership
        const sectorKey = Cartographer.getSectorKey(this.colony.room.name);
        const colonies = Object.values(Overmind.colonies).filter(c => Cartographer.getSectorKey(c.room.name) === sectorKey);
        for (const colony of colonies) {
            if (!this.colonyStates[colony.name]) this.colonyStates[colony.name] = {};
            if (!this.colonyThresholds[colony.name]) this.colonyThresholds[colony.name] = {};
            for (const resource of Object.keys(colony.assets) as ResourceConstant[]) {
                // Use custom logic or defaults for thresholds
                const thresholds = DEFAULT_SL_THRESHOLDS;
                this.colonyThresholds[colony.name][resource] = thresholds;
                const amount = colony.assets[resource] || 0;
                // State assignment logic
                if ((thresholds.surplus !== undefined && amount > thresholds.surplus)
                    || (amount > thresholds.target + thresholds.tolerance)) {
                    this.colonyStates[colony.name][resource] = SL_STATE.activeProvider;
                    if (!this.activeProviders[resource]) this.activeProviders[resource] = [];
                    this.activeProviders[resource].push(colony);
                } else if ((thresholds.surplus !== undefined ? thresholds.surplus : Infinity) >= amount && amount > thresholds.target + thresholds.tolerance) {
                    this.colonyStates[colony.name][resource] = SL_STATE.passiveProvider;
                    if (!this.passiveProviders[resource]) this.passiveProviders[resource] = [];
                    this.passiveProviders[resource].push(colony);
                } else if (thresholds.target + thresholds.tolerance >= amount && amount >= Math.max(thresholds.target - thresholds.tolerance, 0)) {
                    this.colonyStates[colony.name][resource] = SL_STATE.equilibrium;
                    if (!this.equilibriumNodes[resource]) this.equilibriumNodes[resource] = [];
                    this.equilibriumNodes[resource].push(colony);
                } else if (amount < Math.max(thresholds.target - thresholds.tolerance, 0)) {
                    this.colonyStates[colony.name][resource] = SL_STATE.passiveRequestor;
                    if (!this.passiveRequestors[resource]) this.passiveRequestors[resource] = [];
                    this.passiveRequestors[resource].push(colony);
                } else {
                    this.colonyStates[colony.name][resource] = SL_STATE.error;
                }
            }
        }
    }

    requestResource(requestor: Colony, resource: ResourceConstant, totalAmount: number, tolerance = 0): void {
        if (!this.colonyThresholds[requestor.name]) this.colonyThresholds[requestor.name] = {};
        this.colonyThresholds[requestor.name][resource] = {
            target: totalAmount,
            surplus: undefined,
            tolerance,
        };
        if (!this.colonyStates[requestor.name]) this.colonyStates[requestor.name] = {};
        this.colonyStates[requestor.name][resource] = SL_STATE.activeRequestor;
        if (!this.activeRequestors[resource]) this.activeRequestors[resource] = [];
        this.activeRequestors[resource].push(requestor);
    }

    provideResource(provider: Colony, resource: ResourceConstant, thresholds: SLThresholds = DEFAULT_SL_THRESHOLDS): void {
        if (!this.colonyThresholds[provider.name]) this.colonyThresholds[provider.name] = {};
        this.colonyThresholds[provider.name][resource] = thresholds;
        if (!this.colonyStates[provider.name]) this.colonyStates[provider.name] = {};
        this.colonyStates[provider.name][resource] = SL_STATE.activeProvider;
        if (!this.activeProviders[resource]) this.activeProviders[resource] = [];
        this.activeProviders[resource].push(provider);
    }

    // Partner selection: prefer closest colony with a terminal and enough resource
    getBestProvider(resource: ResourceConstant, amount: number, requestor: Colony): Colony | undefined {
        const partners = (this.activeProviders[resource] || []).filter(col => col.terminal);
        if (partners.length === 0) return undefined;
        // Sort by linear room distance
        return minBy(partners, partner => Game.map.getRoomLinearDistance(partner.room.name, requestor.room.name));
    }

    // Divvying requests among multiple providers, prefer those with terminals and closest
    fulfillRequest(resource: ResourceConstant, amount: number, requestor: Colony): Colony[] {
        let partners = (this.activeProviders[resource] || []).filter(col => col.terminal);
        // Sort partners by distance
        partners = partners.sort((a, b) => Game.map.getRoomLinearDistance(a.room.name, requestor.room.name) - Game.map.getRoomLinearDistance(b.room.name, requestor.room.name));
        let remaining = amount;
        const selected: Colony[] = [];
        for (const partner of partners) {
            const available = partner.assets[resource] || 0;
            if (available > 0) {
                const take = Math.min(available, remaining);
                selected.push(partner);
                remaining -= take;
                if (remaining <= 0) break;
            } else {
                // If partner has a terminal but not enough resource, make a request on the terminal network
                if (partner.terminal && Overmind.terminalNetwork) {
                    Overmind.terminalNetwork.requestResource(partner, resource, amount);
                }
            }
        }
        return selected;
    }

    /**
     * Returns true if the colony has access to sector logistics (has storage and is in sector pool)
     */
    static colonyHasAccess(colony: Colony): boolean {
        return !!(colony.storage && SectorLogistics.pool[colony.name]);
    }
}
