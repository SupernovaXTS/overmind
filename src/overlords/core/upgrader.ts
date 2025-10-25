import { log } from 'console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {UpgradeSite} from '../../hiveClusters/upgradeSite';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
/**
 * Spawns an upgrader to upgrade the room controller
 */
@profile
export class UpgradingOverlord extends Overlord {

	upgradersNeeded: number;
	upgraders: Zerg[];
	upgradeSite: UpgradeSite;
	settings: { [property: string]: number };
	room: Room;	//  Operates in owned room
	constructor(upgradeSite: UpgradeSite, priority = OverlordPriority.upgrading.upgrade) {
		// If we don't have any upgraders, use priority upgrade to spawn them faster

		const minUpgraders = 4;
		const hasUpgraders = upgradeSite.colony.getCreepsByRole(Roles.upgrader).length >= minUpgraders+1;
		const effectivePriority = hasUpgraders ? priority : OverlordPriority.priorityOwnedRoom.priorityUpgrade;
		
		super(upgradeSite, 'upgrade', effectivePriority);
		this.upgradeSite = upgradeSite;
		// If new colony or boosts overflowing to storage
		this.upgraders = this.zerg(Roles.upgrader);
	}

	init() {
		let setup = Setups.upgraders.default;
		
		if (this.colony.level < 3) { // can't spawn upgraders at early levels
			this.creepReport(setup.role, this.upgraders.length, 0);
			return;
		}

		if (!(this.colony.assets.energy > UpgradeSite.settings.energyBuffer)) {
			this.creepReport(setup.role, this.upgraders.length, 0);
			return;
		}
		if ((this.colony.assets.energy > UpgradeSite.settings.energyBuffer) ||
			(this.upgradeSite.controller.ticksToDowngrade < 500)) {
			if (this.colony.level == 8) {
				setup = Setups.upgraders.rcl8;
				if (this.colony.labs.length == 10 &&
					this.colony.assets[RESOURCE_CATALYZED_GHODIUM_ACID] >= 4 * LAB_BOOST_MINERAL) {
					setup = Setups.upgraders.rcl8_boosted;
				}
			}

			if (this.colony.level == 8) {
				this.wishlist(1, setup);
				return;
			}
			
			const upgradePowerEach = setup.getBodyPotential(WORK, this.colony);
			const upgradersNeeded = Math.ceil(this.upgradeSite.upgradePowerNeeded / upgradePowerEach);
			this.wishlist(upgradersNeeded, setup, {reassignIdle: true});
	
		}
		else {
			this.wishlist(0, setup);
		}
	}

	private handleUpgrader(upgrader: Zerg): void {
		if (upgrader.carry.energy > 0) {
			// Repair link
			if (this.upgradeSite.link && this.upgradeSite.link.hits < this.upgradeSite.link.hitsMax) {
				upgrader.task = Tasks.repair(this.upgradeSite.link);
				return;
			}
			// Repair container
			if (this.upgradeSite.battery && this.upgradeSite.battery.hits < this.upgradeSite.battery.hitsMax) {
				upgrader.task = Tasks.repair(this.upgradeSite.battery);
				return;
			}
			// Build construction site
			const inputSite = this.upgradeSite.findInputConstructionSite();
			if (inputSite) {
				upgrader.task = Tasks.build(inputSite);
				return;
			}
			// Sign controller if needed
			if (!this.upgradeSite.controller.signedByMe &&
				!this.upgradeSite.controller.signedByScreeps) {
				upgrader.task = Tasks.signController(this.upgradeSite.controller);
				return;
			}
			upgrader.task = Tasks.upgrade(this.upgradeSite.controller);
		} else {
			// Recharge from link or battery
			if (this.upgradeSite.link && this.upgradeSite.link.energy > 0) {
				upgrader.task = Tasks.withdraw(this.upgradeSite.link);
			} else if (this.upgradeSite.battery && this.upgradeSite.battery.energy > 0) {
				upgrader.task = Tasks.withdraw(this.upgradeSite.battery);
			}
			// Find somewhere else to recharge from
			else { // TODO: BUG HERE IF NO UPGRADE CONTAINER
				if (this.upgradeSite.battery && this.upgradeSite.battery.targetedBy.length == 0) {
					upgrader.task = Tasks.recharge();
				}
			}
		}
	}

	run() {
		this.autoRun(this.upgraders, upgrader => this.handleUpgrader(upgrader));
	}
}
