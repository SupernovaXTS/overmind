import {Tasks} from '../tasks/Tasks';
import {Zerg} from '../zerg/Zerg';
import {Mission} from './Mission';
import {MoveOptions} from '../movement/Movement';

export const missionClaimName = 'claim';
export class MissionClaim extends Mission {
	public run(claimer: Zerg) {
		if (claimer.room == this.room && !claimer.pos.isEdge) {
			claimer.task = Tasks.claim(this.room.controller!);
		} else {
			let option: MoveOptions = {repathChance: 0.01};
			if (this.pos.roomName != claimer.pos.roomName) {
				option.waypoints = this.waypoints;
			}
			claimer.goTo(this.pos, option);
		}
	}
}
