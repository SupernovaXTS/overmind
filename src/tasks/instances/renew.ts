import {Roles} from '../../creepSetups/setups';
import {profile} from '../../profiler/decorator';
import {Task} from '../Task';
import {Tasks} from '../Tasks';

export type renewTargetType = StructureSpawn;
export const renewTaskName = 'renew';

/**
 * A combined task that handles renewal at a spawn and also transfers energy to the spawn if the creep is a queen.
 * If the creep has no energy, it will automatically recharge first.
 * This is useful for queens who need to renew while keeping the spawn supplied with energy.
 */
@profile
export class TaskRenew extends Task<renewTargetType> {

	constructor(target: renewTargetType, options = {} as TaskOptions) {
		super(renewTaskName, target, options);
	}

	isValidTask() {
		const hasClaimPart = _.filter(this.creep.body, (part: BodyPartDefinition) => part.type == CLAIM).length > 0;
		const lifetime = hasClaimPart ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
		return this.creep.ticksToLive != undefined && this.creep.ticksToLive < 0.9 * lifetime;
	}

	isValidTarget() {
		return !!this.target && this.target.my && !this.target.spawning;
	}

	work() {
		if (!this.target) return ERR_INVALID_TARGET;
		
		const isQueen = this.creep.memory.role === Roles.queen;
		
		// If the creep has no energy, recharge first (especially important for queens)
		if (this.creep.carry.energy === 0) {
			this.creep.task = Tasks.recharge().fork(this);
			return OK; // Return OK to prevent task from being removed
		}
		
		// If this is a queen with energy, transfer energy to the spawn first
		if (isQueen && this.creep.carry.energy > 0) {
			const transferResult = this.creep.transfer(this.target, RESOURCE_ENERGY);
			// Continue to renew regardless of transfer result
		}
		
		// Renew the creep
		return this.target.renewCreep(this.creep.creep);
	}
}
