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
		// We'll find our own target, so this just needs to check if any spawns exist
		return !!(this.creep.colony && this.creep.colony.spawns.length > 0);
	}

	work() {
		// Find the nearest available spawn in our colony
		const colony = this.creep.colony;
		if (!colony) return ERR_INVALID_TARGET;
		
		const availableSpawns = colony.spawns.filter(spawn => !spawn.spawning);
		const nearestSpawn = this.creep.pos.findClosestByRange(availableSpawns);
		
		if (!nearestSpawn) {
			// If all spawns are busy, just wait or use any spawn
			const anySpawn = colony.spawns[0];
			if (!anySpawn) return ERR_INVALID_TARGET;
			return anySpawn.recycleCreep(this.creep.creep);
		}
		
		return nearestSpawn.recycleCreep(this.creep.creep);
	}
}
