import {DirectiveColonizeShard} from 'directives/colony/colonize_shard';
import {$} from '../../caching/GlobalCache';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {Directive} from '../../directives/Directive';
import {Pathing} from '../../movement/Pathing';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

/**
 * Claim an unowned room or send claimer through portal
 */
@profile
export class ClaimingOverlord extends Overlord {
	claimers: Zerg[];
	directive: Directive;

	constructor(directive: Directive, priority = OverlordPriority.colonization.claim) {
		super(directive, 'claim', priority);
		this.directive = directive;
		this.claimers = this.zerg(Roles.claim);
	}

	init() {
		const amount = $.number(this, 'claimerAmount', () => {
			if (!this.room) return 1;

			// already claimed
			if (this.room.my) return 0;

			// don't ask for claimers if you can't reach controller
			const pathablePos = this.room.creeps[0] ? this.room.creeps[0].pos
													: Pathing.findPathablePosition(this.room.name);
			// if there is no controller, we want to colonize a new shard -> path to directive which is the portal
			const pathDestination = this.room.controller ? this.room.controller.pos : this.pos;
			if (!Pathing.isReachable(pathablePos, pathDestination, _.filter(this.room.structures, s => !s.isWalkable))) {
				log.warning(`Path for Directive ${this.directive.name} is not pathable`);
				return 0;
			}

			return 1;
		});
		const setup = this.colony.level > 4 ? Setups.infestors.fastClaim : Setups.infestors.claim;
		this.wishlist(amount, setup, {reassignIdle: true});
	}

	private handleClaimer(claimer: Zerg): void {
		if (claimer.room != this.room || claimer.pos.isEdge) {
			claimer.goTo(this.pos, {pathOpts : {ensurePath: true, avoidSK: true}});
			return;
		}

		if (!this.room.controller && this.directive.directiveName == DirectiveColonizeShard.directiveName) {
			// this is a portal room, just go on the portal
			// the creep is already in the room
			claimer.goToSameRoom(this.pos);
			return;
		}

		// Takes care of an edge case where planned newbie zone signs prevents signing until room is reserved
		if (this.room.controller!.signedByMe || (!this.room.my && this.room.controller!.signedByScreeps)) {
			claimer.task = Tasks.claim(this.room.controller!);
			return;
		}

		claimer.task = Tasks.signController(this.room.controller!);
	}

	run() {
		this.autoRun(this.claimers, claimer => this.handleClaimer(claimer));
		/* We can wait for the claimer to timeout, it also allows for reassignment to a reserver
		if (this.room && this.room.controller && this.room.controller.my && this.room.controller.signedByMe) {
			for (const claimer of this.claimers) {
				claimer.suicide();
			}
		}
		*/
	}
}
