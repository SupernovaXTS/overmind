import {Colony} from '../Colony';
import {log} from '../console/log';
import {LogisticsRequest} from './LogisticsNetwork';
import {LogisticsSector} from './LogisticsSector';

interface MergedRequest {
	colony: Colony;
	storage: StructureStorage | undefined;
	resourceRequests: { [resourceType: string]: number };
	totalRequests: number;
}

export class SectorLogistics {

	colony: Colony;
    
	// Central pool memory (lazy accessors)
	private static get pool(): { [colony: string]: {
		colony: string;
		room: string;
		manifest: StoreDefinitionUnlimited;
		tick: number;
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
	}

	refresh(): void {
		// TODO: Implement refresh logic
	}

	init(): void {
		// TODO: Implement initialization logic
	}

	run(): void {
		// TODO: Implement run logic
	}

	// ========== Central Pool API ==========
	/**
	 * Publish this colony's unfulfilled input requests to the central pool as a manifest.
	 * Only publishes if the colony has storage (designated inter-colony deposit).
	 */
	publishUnfulfilledRequests(): void {
		if (!this.colony.storage) {
			// Only colonies with storage should participate
			delete SectorLogistics.pool[this.colony.name];
			return;
		}
		const merged = this.getUnfulfilledRequests();
		const manifest: StoreDefinitionUnlimited = {} as any;
		for (const res in merged.resourceRequests) {
			const amt = merged.resourceRequests[res as ResourceConstant] || 0;
			if (amt > 0) (manifest as any)[res] = Math.ceil(amt);
		}
		// If nothing to request, remove any previous entry and return
		if (_.sum(manifest as any) <= 0) {
			delete SectorLogistics.pool[this.colony.name];
			return;
		}
		SectorLogistics.pool[this.colony.name] = {
			colony : this.colony.name,
			room   : this.colony.room.name,
			manifest,
			tick   : Game.time,
		};
	}

	/**
	 * Process the central pool by attempting to fulfill requests via inter-colony hauling.
	 * Uses LogisticsSector to select a supplier and queue a haul directive.
	 */
	static processPool(maxPerTick = 3): void {
		type PoolEntry = { colony: string; room: string; manifest: StoreDefinitionUnlimited; tick: number };
		const entries = _.values(SectorLogistics.pool) as PoolEntry[];
		if (entries.length == 0) return;
		let processed = 0;
		// Iterate by most stale first
		const sorted = _.sortBy(entries, (e: PoolEntry) => e.tick);
		for (const entry of sorted) {
			if (processed >= maxPerTick) break;
			const requestColony = Overmind.colonies[entry.colony];
			if (!requestColony || !requestColony.storage) {
				// Remove invalid entry
				delete SectorLogistics.pool[entry.colony];
				continue;
			}
			const sector = new LogisticsSector(requestColony);
			// Build candidate list: other colonies with storage
			const candidates = (_.values(Overmind.colonies) as Colony[])
				.filter((c: Colony) => c.name != requestColony.name && !!c.storage);
			// Attempt to queue a haul directive
			const res = sector.createHaulDirectiveForRequest(entry.manifest, candidates);
			const ok = res !== false && !(typeof res === 'number' && res < 0);
			if (ok) {
				// On success (flag created or queued), remove entry from pool
				delete SectorLogistics.pool[entry.colony];
				processed++;
			} else {
				// Keep entry, but update tick to avoid starvation and to re-try next run
				SectorLogistics.pool[entry.colony].tick = Game.time;
				if (Game.time % 100 == 0) {
					log.debug(`SectorLogistics: unable to fulfill pooled request for ${requestColony.print}`);
				}
			}
		}
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

}
