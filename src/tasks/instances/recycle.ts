import {profile} from '../../profiler/decorator';
import {Task} from '../Task';

export type recycleTargetType = StructureSpawn;
export const recycleTaskName = 'recycle';

@profile
export class TaskRecycle extends Task<recycleTargetType> {

	constructor(target: recycleTargetType, options = {} as TaskOptions) {
		super(recycleTaskName, target, options);
	}

	isValidTask() {
		// Only valid if we have a colony
		return !!this.creep.colony;
	}

	isValidTarget() {
		// Target must be owned by us, not spawning, and in our colony
		if (!this.target || !this.target.my || this.target.spawning) {
			return false;
		}
		// Verify the spawn belongs to our colony
		if (this.creep.colony) {
			return this.creep.colony.spawns.includes(this.target);
		}
		return false;
	}

	work() {
		if (!this.target) return ERR_INVALID_TARGET;
		return this.target.recycleCreep(this.creep.creep);
	}
}
