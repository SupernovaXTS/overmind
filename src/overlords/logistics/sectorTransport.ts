import {Colony} from '../../Colony';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord, OverlordMemory} from '../Overlord';
import {SectorLogistics} from '../../logistics/SectorLogistics';
import {Stats} from '../../stats/stats';

interface Shipment {
	dest: string; // destination colony name
	resource: ResourceConstant;
	amount: number; // remaining amount to ship
}

export interface SectorTransportOverlordMemory extends OverlordMemory {
	queue: Shipment[];
}

const getDefaultSectorTransportOverlordMemory: () => SectorTransportOverlordMemory = () => ({
	queue: [],
});

/**
 * Intercolony transporter overlord: fulfills central pool requests using creeps instead of directives.
 */
@profile
export class SectorTransportOverlord extends Overlord {

	memory: SectorTransportOverlordMemory;
	transporters: Zerg[];
	// Defaults reimplemented from legacy LogisticsSector
	private static DEFAULT_BUFFER = 100000;
	private static DEFAULT_RANGE_LIMIT = 4;
	private static DEFAULT_SPECIFIC_BUFFERS: Partial<Record<ResourceConstant, number>> = {
		[RESOURCE_ENERGY]: 200000,
		[RESOURCE_POWER] : 1000,
		[RESOURCE_OPS]   : 1000,
	};

	constructor(colony: Colony) {
		super(colony, 'sectorTransport', 1100 /* OverlordPriority.tasks.haul */, getDefaultSectorTransportOverlordMemory);
		this.transporters = this.zerg(Roles.sectorTransport);
	}

	private getRangeLimit(): number {
		const limit = (Memory.settings as any)?.logistics?.intercolony?.rangeLimit;
		return (typeof limit === 'number' && limit > 0) ? limit : SectorTransportOverlord.DEFAULT_RANGE_LIMIT;
	}

	private getBuffer(resource: ResourceConstant): number {
		const memBuf = (Memory.settings as any)?.logistics?.intercolony?.buffers?.[resource];
		if (typeof memBuf === 'number') return memBuf;
		const specific = SectorTransportOverlord.DEFAULT_SPECIFIC_BUFFERS[resource];
		if (typeof specific === 'number') return specific;
		const def = (Memory.settings as any)?.logistics?.intercolony?.defaultBuffer;
		return (typeof def === 'number') ? def : SectorTransportOverlord.DEFAULT_BUFFER;
	}

	private roomsWithinRange(destRoomName: string): boolean {
		const src = this.colony.room.name;
		const dist = Game.map.getRoomLinearDistance(src, destRoomName);
		return dist <= this.getRangeLimit();
	}

	private rebuildQueueFromPool(): void {
		const pool = (SectorLogistics as any).pool as { [colony: string]: { colony: string; manifest: StoreDefinitionUnlimited } };
		if (!pool) return;
		const shipments: Shipment[] = [];
		for (const key in pool) {
			const entry = pool[key];
			if (!entry || entry.colony == this.colony.name) continue; // don't fulfill own
			const destColony = Overmind.colonies[entry.colony];
			if (!destColony || !destColony.storage) continue; // require storage at dest
			if (!this.roomsWithinRange(destColony.room.name)) continue; // out of range
			// For each requested resource, compute available to send from this colony (respect simple buffer)
			for (const res in entry.manifest) {
				const resource = res as ResourceConstant;
				const requested = (entry.manifest[resource] as number) || 0;
				if (requested <= 0) continue;
				const available = (this.colony.assets[resource] as number) || 0;
				// Use buffers from legacy LogisticsSector (configurable via Memory.settings.logistics.intercolony)
				const buffer = this.getBuffer(resource);
				const sendable = Math.max(0, available - buffer);
				const shipAmt = Math.min(requested, sendable);
				if (shipAmt > 0) {
					shipments.push({dest: entry.colony, resource, amount: shipAmt});
				}
			}
		}
		// Sort by proximity (closest destinations first) to "do closer directions first"
		const sorted = _.sortBy(shipments, (s: Shipment) =>
			Game.map.getRoomLinearDistance(this.colony.room.name, Overmind.colonies[s.dest]?.room.name || s.dest));
		this.memory.queue = sorted;
	}

	init() {
		// If no shipments queued, rebuild from pool
		if (!this.memory.queue || this.memory.queue.length == 0) {
			this.rebuildQueueFromPool();
		}
		// Determine how many transporters to spawn: 1 per 2000 requested resources up to 3
		const totalToShip = _.sum(this.memory.queue, s => s.amount);
		const desired = Math.min(3, Math.ceil(totalToShip / 2000));
		const setup = Setups.sectorTransporters.default;
		this.wishlist(desired, setup, {reassignIdle: true});
		// Stats
		Stats.log(`colonies.${this.colony.name}.sectorTransport.queueSize`, this.memory.queue.length);
		Stats.log(`colonies.${this.colony.name}.sectorTransport.queueAmount`, totalToShip);
	}

	private assignOrContinueShipment(creep: Zerg): Shipment | undefined {
		const mem = creep.memory as any;
		if (mem.shipment && mem.shipment.amount > 0) {
			return mem.shipment as Shipment;
		}
		// Assign new shipment from queue
		const next = this.memory.queue.shift();
		if (next) {
			// Limit to creep capacity per leg
			const cap = creep.carryCapacity - _.sum(creep.carry);
			const assignAmt = Math.min(cap, next.amount);
			mem.shipment = {dest: next.dest, resource: next.resource, amount: assignAmt} as Shipment;
			// Push remaining back to queue if any
			if (next.amount - assignAmt > 0) {
				this.memory.queue.unshift({dest: next.dest, resource: next.resource, amount: next.amount - assignAmt});
			}
			return mem.shipment;
		}
		return undefined;
	}

	private handleTransporter(creep: Zerg): void {
		// Clean up invalid shipment
		const mem = creep.memory as any;
		if (mem.shipment && mem.shipment.amount <= 0) delete mem.shipment;
		const shipment = this.assignOrContinueShipment(creep);
		if (!shipment) {
			// No work: dump carry to storage and park
			if (_.sum(creep.carry) > 0) {
				const target = this.colony.storage || this.colony.terminal;
				if (target) creep.task = Tasks.transferAll(target);
			} else {
				const spot = this.colony.storage?.pos || this.colony.pos;
				creep.park(spot);
			}
			return;
		}
		const destColony = Overmind.colonies[shipment.dest];
		const dest = destColony?.storage || destColony?.terminal;
		if (!destColony || !dest) {
			delete mem.shipment; // invalid destination
			return;
		}
		// If carrying the resource, deliver to destination; else withdraw from our storage
		const carrying = creep.carry[shipment.resource] || 0;
		if (carrying > 0) {
			creep.task = Tasks.transfer(dest, shipment.resource);
			// On successful transfer (next tick), shipment will be reduced by assigned amount via cleanup below
		} else {
			const src = this.colony.storage || this.colony.terminal;
			if (!src) {
				delete mem.shipment;
				return;
			}
			const amount = Math.min(shipment.amount, creep.carryCapacity);
			creep.task = Tasks.withdraw(src, shipment.resource, amount);
		}
		// After issuing task, adjust shipment amount when appropriate
		// If we already have the resource assigned in carry, consider it delivered after transfer next tick
		if (carrying >= (mem.shipment?.amount || 0)) {
			mem.shipment.amount = 0;
		}
	}

	run() {
		// If queue is empty, try to rebuild occasionally
		if ((this.memory.queue?.length || 0) == 0 && Game.time % 10 == 0) {
			this.rebuildQueueFromPool();
		}
		this.autoRun(this.transporters, t => this.handleTransporter(t));
		// Periodic stats
		if (Game.time % 8 === 0) {
			const totalToShip = _.sum(this.memory.queue, s => s.amount);
			Stats.log(`colonies.${this.colony.name}.sectorTransport.queueSize`, this.memory.queue.length);
			Stats.log(`colonies.${this.colony.name}.sectorTransport.queueAmount`, totalToShip);
		}
	}
}
