import {SpawnGroup} from 'logistics/SpawnGroup';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {DirectiveControllerAttack} from '../../directives/offense/controllerAttack';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
import { getMyUsername } from 'utilities/utils';
import { max } from 'lodash';

/**
 * Controller attacker overlord.  Spawn CLAIM creeps to mass up on a controller and attack all at once
 * This module was contributed by @sarrick and has since been modified
 */
@profile
export class ControllerAttackerOverlord extends Overlord {

	controllerAttackers: Zerg[];
	attackPositions: RoomPosition[];
	assignments: { [attackerName: string]: RoomPosition };

	constructor(directive: DirectiveControllerAttack, priority = OverlordPriority.offense.controllerAttack) {
		super(directive, 'controllerAttack', priority);
		this.controllerAttackers = this.zerg(Roles.claim);
		this.spawnGroup = new SpawnGroup(this, {requiredRCL: 3});
		this.refresh();
	}

	refresh() {
		super.refresh();
		if (!this.room || !this.room.controller) {
			this.attackPositions = [];
			return
		}
		
		this.attackPositions = this.room.controller.pos.availableNeighbors(true);
		this.assignments = this.getPositionAssignments();
	}

	private getPositionAssignments(): { [attackerName: string]: RoomPosition } {
		const assignments: { [attackerName: string]: RoomPosition } = {};
		const maxLoops = Math.min(this.attackPositions.length, this.controllerAttackers.length);
		const controllerAttackers = _.sortBy(this.controllerAttackers, zerg => zerg.name);
		for (let i = 0; i < maxLoops; i++) {
			assignments[controllerAttackers[i].name] = this.attackPositions[i];
		}
		return assignments;
	}

	init() {
		if ((this.controllerIsNeutral() != true && this.controllerAttackers.length < this.attackPositions.length) && !(this.room && this.room.controller && this.room.controller.upgradeBlocked > 0)) {
			// spawn one infestor for each tile that is close to the controller
			this.wishlist(this.attackPositions.length, Setups.infestors.controllerAttacker, {noLifetimeFilter: true, reassignIdle: true});
		}
	}

	private controllerIsNeutral(): boolean | undefined {
		if (!this.room || !this.room.controller) return undefined
		if (this.room.controller.reservation && !this.room.controller.reservedByMe) return false
		if (this.room.controller.owner && this.room.controller.owner.username != getMyUsername()) return false
		if (this.room.controller.level > 0) return false
		return true
	}

	run() {
		if (!this.room || !this.room.controller) return
		if (this.room && this.room.controller && this.room.controller.upgradeBlocked > 0) return
		// TODO sign controller
		//(infestor.signController(this.room.controller, 'this is mine!') == OK);
		var ready = 0
		for (const controllerAttacker of this.controllerAttackers) {
			const attackPos = this.assignments[controllerAttacker.name];
			if (this.room && this.room.controller && this.room.controller.upgradeBlocked > 0) return
			if (!attackPos) {
				log.error(`No attack position for ${controllerAttacker.print}!`);
				continue
			}

			if (!attackPos.inRangeTo(controllerAttacker.pos, 0)) {
				controllerAttacker.goTo(attackPos);
				continue
			}

			if (this.controllerIsNeutral()) {
				log.debug(`Controller already neutral: ${this.room?.name}`)
				return
			}
			if (!(controllerAttacker.getActiveBodyparts(CLAIM) == controllerAttacker.getBodyparts(CLAIM))) {
				controllerAttacker.retire()
				continue
				// We got attacked on the way and cant use all of our parts, suicide
			}
			if (attackPos.inRangeTo(controllerAttacker.pos,0)) {
				ready += 1
			}
			

			if (ready == this.controllerAttackers.length) {
				const ret = controllerAttacker.attackController(this.room.controller);
				// FIXME: type it
				/* This shouldn't be needed since we are checking before we claim instead of after
				if (ret == -12) {
					// creep got attacked on the way and is not able to claim
					// produce new one
					controllerAttacker.suicide()
					continue
				}
				*/
				// FIXME: type it
				if (ret != 0 && ret != -11) {
					log.error(`Attacking Controller: ${this.room.controller.pos} Ret: ${ret}`)
					continue
				}
			}	
		}
	}
}
