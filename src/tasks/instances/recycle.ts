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
		// Valid as long as we have any spawns
		return Object.keys(Game.spawns).length > 0;
	}

	isValidTarget() {
		// We'll find our own target, so this just needs to check if any spawns exist
		return Object.keys(Game.spawns).length > 0;
	}

	work() {
		// Find the nearest available spawn owned by us (any colony)
		const allSpawns = _.values(Game.spawns) as StructureSpawn[];
		const availableSpawns = allSpawns.filter(spawn => !spawn.spawning);
		const nearestSpawn = this.creep.pos.findClosestByRange(availableSpawns) as StructureSpawn | null;
		
		if (!nearestSpawn) {
			// If all spawns are busy, just use any spawn
			const anySpawn = allSpawns[0];
			if (!anySpawn) return ERR_INVALID_TARGET;
			return anySpawn.recycleCreep(this.creep.creep);
		}
		
		return nearestSpawn.recycleCreep(this.creep.creep);
	}
}
