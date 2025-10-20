import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {Directive} from '../../directives/Directive';
import {DirectiveColonizeShard} from 'directives/colony/colonize_shard';
import {Pathing} from '../../movement/Pathing';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
import { property } from 'lodash';

/**
 * Spawn pioneers - early workers which help to build a spawn in a new colony, then get converted to workers or drones
 */
@profile
export class PioneerOverlord extends Overlord {

	directive: Directive;
	pioneers: Zerg[];
	spawnSite: ConstructionSite | undefined;

	constructor(directive: Directive, priority = OverlordPriority.colonization.pioneer) {
		super(directive, 'pioneer', priority);
		this.directive = directive;
		this.pioneers = this.zerg(Roles.pioneer);
		this.spawnSite = this.room ? _.filter(this.room.constructionSites,
											  s => s.structureType == STRUCTURE_SPAWN)[0] : undefined;
	}

	refresh() {
		super.refresh();
		this.spawnSite = this.room ? _.filter(this.room.constructionSites,
											  s => s.structureType == STRUCTURE_SPAWN)[0] : undefined;
	}

	init() {
		var type = this.directive.type as 'armored' | 'default';
		this.wishlist(4, Setups.pioneers[type]);
	}

	private findStructureBlockingController(pioneer: Zerg): Structure | undefined {
		const blockingPos = Pathing.findBlockingPos(pioneer.pos, pioneer.room.controller!.pos,
													_.filter(pioneer.room.structures, s => !s.isWalkable));
		if (blockingPos) {
			const structure = blockingPos.lookFor(LOOK_STRUCTURES)[0];
			return structure || log.error(`${this.print}: no structure at blocking pos ${blockingPos.print}!`);
		}
	}

	private handlePioneer(pioneer: Zerg): void {
		var viable = true
		if (pioneer.getActiveBodyparts(WORK) <= 0 || !viable)
			// If we don't have any active work parts we retire
			pioneer.retire()
		if (pioneer.room != this.room || pioneer.pos.isEdge) {
			pioneer.goTo(this.pos, {pathOpts: {ensurePath: true, avoidSK: true}});
			return
		}

		if (!this.room.controller && this.directive.directiveName == DirectiveColonizeShard.directiveName) {
			// this is a portal room, just go on the portal
			// the creep is already in the room
			pioneer.goToSameRoom(this.pos)
			return
		}

		// Remove any blocking structures preventing claimer from reaching controller
		if (!this.room.my && this.room.structures.length > 0) {
			const dismantleTarget = this.findStructureBlockingController(pioneer);
			if (dismantleTarget) {
				pioneer.task = Tasks.dismantle(dismantleTarget);
				return;
			}
		}
		// Build and recharge
		if (pioneer.carry.energy == 0) {
			
			pioneer.task = Tasks.recharge();
			if (!pioneer.task.isValidTask()) {
				viable = false
			}	
		} else if (this.room && this.room.controller && (this.room.controller.ticksToDowngrade <
															(0.1 * CONTROLLER_DOWNGRADE[this.room.controller.level])
															|| !this.spawnSite)
					&& !(this.room.controller.upgradeBlocked > 0)) {
			// Save controller if it's about to downgrade or if you have nothing else to do
			pioneer.task = Tasks.upgrade(this.room.controller);
			if (!pioneer.task.isValidTask()) {
				viable = false
			}
		} else if (this.spawnSite) {
			pioneer.task = Tasks.build(this.spawnSite);
			if (!pioneer.task.isValidTask()) {
				viable = false
			}
		}
	}

	run() {
		this.autoRun(this.pioneers, pioneer => this.handlePioneer(pioneer));
	}
}

