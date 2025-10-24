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
		return true; // Always valid if creep wants to recycle
	}

	isValidTarget() {
		return !!this.target && this.target.my && !this.target.spawning;
	}

	work() {
		if (!this.target) return ERR_INVALID_TARGET;
		return this.target.recycleCreep(this.creep.creep);
	}
}
