import {Colony} from '../../Colony';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {DirectiveFeeder} from '../../directives/situational/feeder';
import {UpgradeSite} from '../../hiveClusters/upgradeSite';
import {CombatIntel} from '../../intel/CombatIntel';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {BASE_RESOURCES, BOOSTS_T1, BOOSTS_T2, BOOSTS_T3, INTERMEDIATE_REACTANTS} from '../../resources/map_resources';
import {Tasks} from '../../tasks/Tasks';
import {minBy} from '../../utilities/utils';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

// The order in which resources are handled within the network
const highPriorityLoot: ResourceConstant[] = [
	...BOOSTS_T3,
	RESOURCE_OPS,
	RESOURCE_POWER,
];
const lowPriorityLoot: ResourceConstant[] = [
	...BOOSTS_T2,
	...BOOSTS_T1,
	...INTERMEDIATE_REACTANTS,
	...BASE_RESOURCES,
];
const dontLoot: ResourceConstant[] = [
	RESOURCE_ENERGY,
];
const everythingElse = _.filter(RESOURCES_ALL,
								res => !(highPriorityLoot.includes(res) || lowPriorityLoot.includes(res))
									   && !dontLoot.includes(res));

const LOOTING_ORDER: ResourceConstant[] = [...highPriorityLoot,
										   ...everythingElse,
										   ...lowPriorityLoot];


/**
 * Spawns remote upgraders and energy carriers to travel to a distant room to upgrade the controller. The directive
 * should be placed on the controller in the child room and should only be used after the room has been claimed.
 */
@profile
export class FeederOverlord extends Overlord {

	private directive: DirectiveFeeder;

	parentColony: Colony;
	childColony: Colony;

	carriers: Zerg[];

	private boosted: boolean;

	upgradeSite: UpgradeSite;
	room: Room;	//  Operates in owned room

	constructor(directive: DirectiveFeeder, priority = OverlordPriority.colonization.remoteUpgrading) {
		super(directive, 'feeder', priority);

		this.directive = directive;

		this.parentColony = this.colony;
		this.childColony = Overmind.colonies[this.pos.roomName];
		if (!this.childColony) {
			log.error(`${this.print}: no child colony! (Why?)`);
		}
		if (this.parentColony == this.childColony) {
			log.error(`${this.print}: parent and child colonies are the same! (Why?)`);
		}
		this.upgradeSite = this.childColony.upgradeSite;
		// If new colony or boosts overflowing to storage
		this.carriers = this.zerg(Roles.transport);

		this.boosted = true; // TODO
	}

	/**
	 * Computes the amount of carry capacity (in terms of energy units, not bodyparts) needed
	 */
	private computeNeededCarrierCapacity(): number {
		if (this.childColony.terminal && this.childColony.terminal.my) {
			return 0; // don't need this once you have a terminal
		}
		const roundTripDistance = 1.5 /* todo */ * this.directive.distanceFromColony.terrainWeighted;
		const energyPerTick = 50;
		return energyPerTick * roundTripDistance;
	}

	init() {
		let neededCarriers = this.carriers.length;
		if (this.carriers.length == 0) {
			neededCarriers = 1;
		} else {
			const neededCarryCapacity = this.computeNeededCarrierCapacity();
			const currentCarryCapacity = _.sum(this.carriers, carrier =>
				CARRY_CAPACITY * CombatIntel.getCarryPotential(carrier.creep, true));
			const avgCarrierCapactiy = currentCarryCapacity / this.carriers.length;
			this.debug(`Needed carry capacity: ${neededCarryCapacity}; Current carry capacity: ${currentCarryCapacity}`);
			neededCarriers = Math.ceil(neededCarryCapacity / avgCarrierCapactiy);
			this.debug(`Needed carriers: ${neededCarriers}`);
		}

		if (this.boosted) {
			this.wishlist(neededCarriers, Setups.transporters.boosted, {priority: this.priority});
			this.wishlist(8, Setups.upgraders.remote_boosted, {priority: this.priority + 1});
		} else {
			this.wishlist(neededCarriers, Setups.transporters.default, {priority: this.priority});
			this.wishlist(8, Setups.upgraders.remote, {priority: this.priority + 1});
		}
	}
	private supplyActions(queen: Zerg) {
		// Select the closest supply target out of the highest priority and refill it
		const request = this.childColony.hatchery?.transportRequests.getPrioritizedClosestRequest(queen.pos, 'supply');
		if (request) {
			queen.task = Tasks.transfer(request.target);
		} else {
			this.rechargeActions(queen); // if there are no targets, refill yourself
		}
	}

	private rechargeActions(queen: Zerg): void {
		if (this.childColony.hatchery?.link && !this.childColony.hatchery.link.isEmpty) {
			queen.task = Tasks.withdraw(this.childColony.hatchery.link);
		} else if ((this.childColony.hatchery?.batteries?.length ?? 0) > 0) {
			const target = queen.pos.findClosestByRange(_.filter(this.childColony.hatchery?.batteries ?? [], b => b.energy > 0));
			if (target) {
				queen.task = Tasks.withdraw(target);
			} else {
				queen.task = Tasks.recharge();
			}
		} else {
			queen.task = Tasks.recharge();
		}
	}

	private idleActions(queen: Zerg): void {
		// will only have one battery when this overlord is called
		const batteries: StructureContainer[] = this.childColony.hatchery?.batteries ?? [];
		const battery = queen.pos.findClosestByRange(batteries);
		const hatchery = this.childColony.hatchery;

		if (hatchery?.link) {
			const link = hatchery.link;
			const linkHasEnergy = (link as any).isEmpty !== undefined
				? !(link as any).isEmpty
				: link.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
			const batteryHasFree = !!battery && battery.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
			const batteryHasEnergy = !!battery && battery.store.getUsedCapacity(RESOURCE_ENERGY) > 0;

			// Can energy be moved from the link to the battery?
			if (battery && batteryHasFree && linkHasEnergy) {
				// Move energy to battery as needed
				if (queen.carry.energy < queen.carryCapacity) {
					queen.task = Tasks.withdraw(link);
				} else {
					queen.task = Tasks.transfer(battery as StructureContainer);
				}
				return;
			}

			// Otherwise, make sure you're recharged
			if (queen.carry.energy < queen.carryCapacity) {
				if (linkHasEnergy) {
					queen.task = Tasks.withdraw(link);
				} else if (battery && batteryHasEnergy) {
					queen.task = Tasks.withdraw(battery as StructureContainer);
				}
			}
		} else {
			if (battery && queen.carry.energy < queen.carryCapacity) {
				queen.task = Tasks.withdraw(battery as StructureContainer);
			}
		}
	}

	private handleQueen(queen: Zerg): void {
		if (queen.carry.energy > 0) {
			this.supplyActions(queen);
		} else {
			this.rechargeActions(queen);
		}
		// If there aren't any tasks that need to be done, recharge the battery from link
		if (queen.isIdle) {
			this.idleActions(queen);
		}
		// // If all of the above is done and hatchery is not in emergencyMode, move to the idle point and renew as needed
		// if (!this.emergencyMode && queen.isIdle) {
		// 	if (queen.pos.isEqualTo(this.idlePos)) {
		// 		// If queen is at idle position, renew her as needed
		// 		if (queen.ticksToLive < this.settings.renewQueenAt && this.availableSpawns.length > 0) {
		// 			this.availableSpawns[0].renewCreep(queen.creep);
		// 		}
		// 	} else {
		// 		// Otherwise, travel back to idle position
		// 		queen.goTo(this.idlePos);
		// 	}
		// }
	}

	private handleCarrier(carrier: Zerg): void {
		var beQueen = false;
		if (beQueen) {
			this.handleQueen(carrier);
			return;
		}
		if (carrier.getActiveBodyparts(HEAL) > 0) {
			carrier.heal(carrier);
		}

		// Get energy from the parent colony if you need it
		if (carrier.carry.energy == 0) {
			// If you are in the child room and there are valuable resources in a storage/terminal that isn't mine,
			// then take those back before you go home
			if (carrier.room == this.childColony.room && carrier.carry.getFreeCapacity() > 0) {
				const storeStructuresNotMy =
						  _.filter(_.compact([this.childColony.room.storage,
											  this.childColony.room.terminal]),
								   structure => !structure!.my) as (StructureStorage | StructureTerminal)[];
				for (const resource of LOOTING_ORDER) {
					const withdrawTarget = _.find(storeStructuresNotMy,
												  structure => structure.store.getUsedCapacity(resource) > 0);
					if (withdrawTarget) {
						const amount = Math.min(withdrawTarget.store.getUsedCapacity(resource),
												carrier.carry.getFreeCapacity());
						carrier.task = Tasks.withdraw(withdrawTarget, resource, amount);
						return;
					}
				}
			}
			// Go to the parent room for energy
			if (!carrier.safelyInRoom(this.parentColony.room.name)) {
				carrier.goToRoom(this.parentColony.room.name);
				return;
			}

			const target = _.find(_.compact([this.parentColony.storage, this.parentColony.terminal]),
								  s => s!.store[RESOURCE_ENERGY] >= carrier.carryCapacity);
			if (!target) {
				log.warning(`${this.print}: no energy withdraw target for ${carrier.print}!`);
				return;
			}
			if (carrier.carry.getUsedCapacity() > carrier.carry.getUsedCapacity(RESOURCE_ENERGY)) {
				carrier.task = Tasks.transferAll(target);
			} else {
				carrier.task = Tasks.withdraw(target);
			}

		} else {

			// Go to the room
			if (!carrier.safelyInRoom(this.childColony.room.name)) {
				carrier.goToRoom(this.childColony.room.name);
				return;
			}

			// Try to deposit in container, unless there's already a crowd waiting there;
			// otherwise put in storage if you can
			const childColony = this.childColony;

			const depositPos = this.upgradeSite.batteryPos || this.upgradeSite.pos;
			const carriersWaitingToUnload = _.filter(this.carriers, c =>
				c.carry.energy > 0 && c.pos.inRangeToPos(depositPos, 5));
			const firstCarrierInQueue = minBy(carriersWaitingToUnload, c =>
				c.carry.energy + (c.ticksToLive || Infinity) / 10000);

			let hatcheryBattery: StructureContainer | undefined;
			if (childColony.hatchery && childColony.hatchery.batteries.length > 0) {
				const candidates = _.filter(childColony.hatchery.batteries,
					b => b.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
				hatcheryBattery = carrier.pos.findClosestByRange(candidates) as StructureContainer | null || undefined;
			}

			// Put in storage if you can
			if (hatcheryBattery) {
				carrier.task = Tasks.transfer(hatcheryBattery as StructureContainer);
				return;
			}
			if (this.childColony.storage && firstCarrierInQueue && firstCarrierInQueue != carrier) {
				carrier.task = Tasks.transfer(this.childColony.storage);
				return;
			}
			// If we dont have a queen in the colony, become the queen temporarily
			if (childColony.getCreepsByRole(Roles.queen).length < 1) {
				beQueen = true;
				this.handleQueen(carrier);
				return;
			}
			else {
				beQueen = false;
			}
	}
}

	run() {
		this.autoRun(this.carriers, carrier => this.handleCarrier(carrier));
	}
}
