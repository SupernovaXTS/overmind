import { Colony } from 'Colony';
import { CreepSetup } from 'creepSetups/CreepSetup';
import { DirectiveHaulRequest } from 'directives/resource/haulRequest';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {DirectiveHaul} from '../../directives/resource/haul';
import {Energetics} from '../../logistics/Energetics';
import {Pathing} from '../../movement/Pathing';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

/**
 * Spawns special-purpose haulers for transporting resources to/from a specified target
 */
@profile
export class HaulingOverlordRequest extends Overlord {
	haulers: Zerg[];
	haulerSetup: CreepSetup;
	maxHaulers: number = 8;
	directive: DirectiveHaulRequest;
	static haulerSetup = Setups.transporters.default;
	
	constructor(directive: DirectiveHaulRequest, priority = directive.hasDrops ? OverlordPriority.collectionUrgent.haul :
													 OverlordPriority.tasks.haul) {
		super(directive, 'haul', priority);
		this.haulers = this.zerg(Roles.transport);
		this.haulerSetup = HaulingOverlordRequest.haulerSetup;
	}

	private get source(): _HasRoomPosition {
		return this.directive;
	}

	private get destination(): _HasRoomPosition {
		return this.colony.storage || this.colony;
	}

	private get destinationRoom(): Room {
		return this.colony.room;
	}

	get calculateHaulers() {
		// Don't spawn haulers if there's no storage or if storage is already near capacity
		if (!this.colony.storage) {
			return undefined;
		}
		const storageUsed = _.sum(this.colony.storage.store);
		const storageCap = Energetics.settings.storage.total.cap;
		if (storageUsed > storageCap) {
			return undefined;
		}
		
		// Calculate total needed amount of hauling power as (resource amount * trip distance)
		const tripDistance = 2 * (Pathing.distance(this.destination.pos, this.source.pos) || 0);
		const haulingPowerNeeded = Math.min(this.directive.totalResources,
											this.colony.storage.store.capacity
											- _.sum(this.colony.storage.store)) * tripDistance;
		// Calculate amount of hauling each hauler provides in a lifetime
		const haulerCarryParts = this.haulerSetup.getBodyPotential(CARRY, this.colony);
		const haulingPowerPerLifetime = CREEP_LIFE_TIME * haulerCarryParts * CARRY_CAPACITY;
		// Calculate number of haulers
		const numHaulers = Math.min(Math.ceil(haulingPowerNeeded / haulingPowerPerLifetime), this.maxHaulers);
		return numHaulers;
	}

	init() {
		const haulersNeeded = this.calculateHaulers;
		if (haulersNeeded == undefined) {
			return;
		}
		// Spawn a number of haulers sufficient to move all resources within a lifetime, up to a max;
		// Request the haulers
		this.wishlist(haulersNeeded, this.haulerSetup);
	}
	private handleHauler(hauler: Zerg) {
		if (_.sum(hauler.carry) == 0) {
			// Travel to source and collect resources
			if (hauler.inSameRoomAs(this.source)) {
				// Pick up drops first
				if (this.directive.hasDrops) {
					const manifest = this.directive.manifest || {};
					const allDrops: Resource[] = _.flatten(_.values(this.directive.drops));
					// If a manifest is present, only pick drops listed in it; otherwise use previous behavior
					let drop: Resource | undefined;
					const manifestTypes = Object.keys(manifest) as ResourceConstant[];
					if (manifestTypes.length > 0) {
						drop = _.find(allDrops, d => manifest[d.resourceType as ResourceConstant] > 0);
					} else {
						drop = _.find(allDrops, d => d.resourceType != 'energy') || allDrops[0];
					}
					if (drop) {
						hauler.task = Tasks.pickup(drop);
						return;
					}
				}
				// Withdraw from store structure
				if (this.directive.storeStructure) {
					const store = this.directive.store!;
					const manifest = this.directive.manifest || {};
					let totalDrawn = 0; // Fill to full
					const capacityLeft = () => hauler.carryCapacity - totalDrawn;
					const manifestTypes = Object.keys(manifest) as ResourceConstant[];
					if (manifestTypes.length > 0) {
						for (const res of manifestTypes) {
							const needed = manifest[res] || 0;
							if (needed <= 0) continue;
							const available = (store[res] as number) || 0;
							if (available <= 0) continue;
							const toWithdraw = Math.min(needed, available, capacityLeft());
							if (toWithdraw <= 0) continue;
							if (hauler.task) {
								hauler.task = Tasks.withdraw(this.directive.storeStructure, res, toWithdraw).fork(hauler.task);
							} else {
								hauler.task = Tasks.withdraw(this.directive.storeStructure, res, toWithdraw);
							}
							totalDrawn += toWithdraw;
							if (capacityLeft() <= 0) return;
						}
					} else {
						// Fallback: previous behavior if no manifest specified
						for (const resourceType in store) {
							if (store[resourceType as ResourceConstant] > 0) {
								if (hauler.task) {
									hauler.task = Tasks.withdraw(this.directive.storeStructure, <ResourceConstant>resourceType).fork(hauler.task);
								} else {
									hauler.task = Tasks.withdraw(this.directive.storeStructure, <ResourceConstant>resourceType);
								}
								totalDrawn += store[resourceType as ResourceConstant] as number;
								if (totalDrawn >= hauler.carryCapacity) return;
							}
						}
					}
					if (hauler.task) {
						// If can't finish filling up, just go ahead and go home
						return;
					}
				}
				// Shouldn't reach here
				log.warning(`${hauler.name} in ${hauler.room.print}: nothing to collect!`);
			} else {
				// Travel to source
				hauler.goTo(this.source, {pathOpts: {avoidSK: true}});
			}
		} else {
			// Travel to destination and deposit resources
			if (hauler.inSameRoomAs(this.destination)) {
				// Put energy in storage and minerals in terminal if there is one
				for (const [resourceType, amount] of hauler.carry.contents) {
					if (amount == 0) continue;
					if (resourceType == RESOURCE_ENERGY) { // prefer to put energy in storage
						if (this.colony.storage && _.sum(this.colony.storage.store) < STORAGE_CAPACITY) {
							hauler.task = Tasks.transfer(this.colony.storage, resourceType);
							return;
						} else if (this.colony.terminal && _.sum(this.colony.terminal.store) < TERMINAL_CAPACITY) {
							hauler.task = Tasks.transfer(this.colony.terminal, resourceType);
							return;
						}
					} else { // prefer to put minerals in terminal
						if (this.colony.terminal && this.colony.terminal.my
							&& _.sum(this.colony.terminal.store) < TERMINAL_CAPACITY) {
							hauler.task = Tasks.transfer(this.colony.terminal, resourceType);
							return;
						} else if (this.colony.storage && _.sum(this.colony.storage.store) < STORAGE_CAPACITY) {
							hauler.task = Tasks.transfer(this.colony.storage, resourceType);
							return;
						}
					}
				}
				// Shouldn't reach here
				log.warning(`${hauler.name} in ${hauler.room.print}: nowhere to put resources!`);
			} else {
				// Travel to destination room
				hauler.task = Tasks.goToRoom(this.destinationRoom.name);
			}
		}
	}

	run() {
		for (const hauler of this.haulers) {
			// Snapshot carry before running task
			const before = _.clone(hauler.carry) as StoreDefinition;
			if (hauler.isIdle) {
				this.handleHauler(hauler);
			}
			hauler.run();
			// After action, compute any resources newly acquired and decrement manifest accordingly
			const after = hauler.carry as StoreDefinition;
			this.updateManifestFromPickup(before, after);
		}
		// TODO: fix the way this is done
		if (this.directive.memory.totalResources == 0 && this.haulers.filter(hauler => _.sum(hauler.carry) > 0).length == 0) {
			this.directive.remove();
		}
	}

	/**
	 * Reduce directive manifest by the amount a hauler actually picked up/withdrew this tick.
	 */
	private updateManifestFromPickup(before: StoreDefinition, after: StoreDefinition) {
		// Initialize manifest in memory if needed
		if (!this.directive.memory.manifest) this.directive.memory.manifest = {} as StoreDefinitionUnlimited;
		const manifest = this.directive.memory.manifest as StoreDefinitionUnlimited;
		// consider all resource types present before/after
		const resources = _.uniq([...Object.keys(before), ...Object.keys(after)]) as ResourceConstant[];
		for (const res of resources) {
			const prev = (before[res] as number) || 0;
			const curr = (after[res] as number) || 0;
			const gained = Math.max(0, curr - prev);
			if (gained > 0 && manifest[res] != undefined) {
				const remaining = Math.max(0, ((manifest[res] as number) || 0) - gained);
				if (remaining <= 0) {
					delete manifest[res];
				} else {
					manifest[res] = remaining;
				}
			}
		}
	}
}
