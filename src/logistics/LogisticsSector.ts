// Acts as a way to transfer resources from one colony with surplus to another colony in need

import {Colony} from 'Colony';
import {log} from 'console/log';
import {DirectiveHaulRequest} from 'directives/resource/haulRequest';

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
	static maxHaulRequestRetries: number = 5; // default max retries for queued directive creations
	static maxQueueAge: number = 5000; // default pruning age in ticks
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

	// In-memory queue (per colony) for deferring directive creation to the run phase
	private get haulRequestQueue(): Array<{
		source: string;
		manifest: StoreDefinitionUnlimited;
		retries?: number;
		createdAt?: number;
	}> {
		const mem = this.colony.memory as any;
		if (!mem.haulRequestQueue) mem.haulRequestQueue = [];
		return mem.haulRequestQueue as Array<{
			source: string;
			manifest: StoreDefinitionUnlimited;
			retries?: number;
			createdAt?: number;
		}>;
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
	 * Returns the first colony that can fulfill the entire request and a manifest of what to send;
	 * otherwise false.
	 */
	supply(
		request: StoreDefinition | StoreDefinitionUnlimited,
		candidates?: Colony[]
	): {colony: Colony; manifest: StoreDefinitionUnlimited} | false {
		let colonies = candidates && candidates.length > 0 ? candidates : this.nearbyColonies;
		// Prefer closest sources first (by linear distance to the requesting colony)
		colonies = colonies.sort((a, b) =>
			Game.map.getRoomLinearDistance(a.room.name, this.colony.room.name)
			- Game.map.getRoomLinearDistance(b.room.name, this.colony.room.name));
		for (const colony of colonies) {
			const manifest = this.buildManifestForColonyIfAvailable(colony, request);
			if (manifest) {
				return {colony, manifest};
			}
		}
		return false;
	}

	/**
	 * Create a haul directive at the source colony to move the requested resources to this sector's colony.
	 * Returns the directive creation result or false if no supplier can fulfill the request.
	 */
	createHaulDirectiveForRequest(
		request: StoreDefinition | StoreDefinitionUnlimited,
		candidates?: Colony[]
	): number | string | undefined | false {
		const result = this.supply(request, candidates);
		if (!result) return false;
		const {colony: sourceColony, manifest} = result;

		// Defer directive creation to run phase to comply with engine restrictions
		const item = {source: sourceColony.name, manifest, retries: 0, createdAt: Game.time};
		this.haulRequestQueue.push(item);
		if (this.colony.memory.debug) {
			const logMsg = `${this.colony.print} queued haul request from ${sourceColony.name}: `
				+ `${JSON.stringify(manifest)}`;
			log.debug(logMsg);
		}
		return 'queued';
	}

	/**
	 * High-level convenience method to request resources for this colony.
	 * Uses NearbyColonies as the candidate supplier set and creates a haul directive
	 * at the selected supplier if possible.
	 *
	 * Returns the directive creation result (flag name or code) if successful; otherwise false.
	 */
	request(store: StoreDefinition | StoreDefinitionUnlimited): number | string | undefined | false {
		// Explicitly use nearbyColonies as candidates
		return this.createHaulDirectiveForRequest(store, this.nearbyColonies);
	}

	/**
	 * Boolean variant of request(): returns true if the request was queued/created successfully.
	 */
	requestOk(store: StoreDefinition | StoreDefinitionUnlimited): boolean {
		const res = this.request(store);
		return this.isSuccessResult(res);
	}

	/**
	 * Convenience: accept an array of [resource, amount] pairs, build a store via storeFromPairs,
	 * and invoke request using nearby colonies.
	 * Example: sector.requestFromPairs([[RESOURCE_ENERGY, 50000], [RESOURCE_OPS, 100]])
	 */
	requestFromPairs(pairs: Array<[ResourceConstant, number]>): number | string | undefined | false {
		// Normalize inputs in case a flat tuple [res, amt] was passed instead of [[res, amt]]
		let normalized: Array<[ResourceConstant, number]> = pairs;
		if (pairs && pairs.length === 2 && !Array.isArray((pairs as any)[0])
			&& typeof (pairs as any)[1] !== 'object') {
			const res = (pairs as any)[0] as ResourceConstant;
			const amt = (pairs as any)[1] as number;
			normalized = [[res, amt]];
		}
		const store = this.storeFromPairArray(normalized);
		return this.request(store);
	}

	/**
	 * Boolean variant for pair input: returns true if the request was queued/created successfully.
	 */
	requestFromPairsOk(pairs: Array<[ResourceConstant, number]>): boolean {
		const res = this.requestFromPairs(pairs);
		return this.isSuccessResult(res);
	}

	/**
	 * Convenience: request only energy by amount. Returns false for invalid/non-positive amounts.
	 * Example: sector.requestEnergy(100000)
	 */
	requestEnergy(amount: number): number | string | undefined | false {
		const amt = Math.floor(Number(amount) || 0);
		if (amt <= 0 || !isFinite(amt)) return false;
		const store = this.storeFromPairs([RESOURCE_ENERGY, amt]);
		return this.request(store);
	}

	/**
	 * Boolean convenience: request only energy and return true/false for success.
	 */
	requestEnergyOk(amount: number): boolean {
		const result = this.requestEnergy(amount);
		return this.isSuccessResult(result);
	}

	/**
	 * Internal: determine if a single colony can fulfill the request without breaching per-resource buffers.
	 * Returns a manifest if possible; otherwise false.
	 */
	private buildManifestForColonyIfAvailable(
		colony: Colony,
		store: StoreDefinition | StoreDefinitionUnlimited
	): StoreDefinitionUnlimited | false {
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

	/**
	 * Process any queued haul directive creations. Must be called during run phase.
	 */
	run(): void {
		const mem = (this.colony.memory as any);
		const queue: Array<{
			source: string;
			manifest: StoreDefinitionUnlimited;
			retries?: number;
			createdAt?: number;
		}> = mem.haulRequestQueue || [];
		if (!queue.length) return;

		const nextQueue: typeof queue = [];
		const maxRetries = Memory.settings?.logistics?.haulQueue?.maxRetries
			?? LogisticsSector.maxHaulRequestRetries;
		const maxAge = Memory.settings?.logistics?.haulQueue?.maxAge ?? LogisticsSector.maxQueueAge;
		for (const item of queue) {
			// Prune by age
			if (item.createdAt && (Game.time - item.createdAt) > maxAge) {
				log.warning(`${this.colony.print} pruning stale haul request from ${item.source}`);
				continue;
			}
			const sourceColony = Overmind.colonies[item.source] as Colony | undefined;
			if (!sourceColony) {
				// Source colony missing; increment retry and keep if under limit
				item.retries = (item.retries || 0) + 1;
				if (item.retries <= maxRetries) {
					nextQueue.push(item);
				} else {
					const warnMsg = `${this.colony.print} dropping haul request from ${item.source} `
						+ `after ${item.retries} retries (source missing)`;
					log.warning(warnMsg);
				}
				continue;
			}
			const pos: RoomPosition = (sourceColony.storage?.pos
				|| sourceColony.terminal?.pos
				|| sourceColony.controller.pos);
			const memory: FlagMemory = {
				[MEM.COLONY]: sourceColony.name,
				manifest: item.manifest,
				destination: this.colony.name,
				source: sourceColony.name,
			} as any;
			const res = DirectiveHaulRequest.createIfNotPresent(pos, 'room', {memory});
			// If creation failed (e.g., room not visible), keep it queued to retry next tick
			if (res !== OK && typeof res !== 'string') {
				item.retries = (item.retries || 0) + 1;
				if (item.retries <= maxRetries) {
					nextQueue.push(item);
					if (this.colony.memory.debug) {
						const dbgMsg = `${this.colony.print} retry ${item.retries}/${maxRetries} `
							+ `for haul request from ${sourceColony.name}`;
						log.debug(dbgMsg);
					}
				} else {
					const warnMsg = `${this.colony.print} dropping haul request from ${sourceColony.name} `
						+ `after ${item.retries} retries (res=${res})`;
					log.warning(warnMsg);
				}
			} else {
				if (this.colony.memory.debug) {
					const infoMsg = `${this.colony.print} created haul directive from ${sourceColony.name}: `
						+ `${typeof res === 'string' ? res : 'OK'}`;
					log.info(infoMsg);
				}
			}
		}
		mem.haulRequestQueue = nextQueue;
	}

	// Convert directive creation result to boolean success
	private isSuccessResult(result: number | string | undefined | false): boolean {
		if (result === false || result === undefined) return false;
		if (typeof result === 'number' && result < 0) return false; // negative Screeps error codes
		return true; // OK (0), string names (including 'queued') count as success
	}
}

// Initialize per-resource buffers at module load
LogisticsSector.initializeBuffers();
