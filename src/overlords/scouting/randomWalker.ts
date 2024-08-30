import {Colony} from '../../Colony';
import {Roles, Setups} from '../../creepSetups/setups';
import {RoomIntel} from '../../intel/RoomIntel';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

const DEFAULT_NUM_SCOUTS = 3;

/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
@profile
export class RandomWalkerScoutOverlord extends Overlord {

	scouts: Zerg[];

	constructor(colony: Colony, priority = OverlordPriority.scouting.randomWalker) {
		super(colony, 'scout', priority);
		this.scouts = this.zerg(Roles.scout, {notifyWhenAttacked: false});
	}

	init() {
		this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
	}

	private handleScout(scout: Zerg) {
		/*
		if (RoomIntel.getMyZoneStatus() == 'normal') {
			// Check if room might be connected to newbie/respawn zone
			const indestructibleWalls = _.filter(scout.room.walls, wall => wall.hits == undefined);
			if (indestructibleWalls.length > 0) { // go back to origin colony if you find a room near newbie zone
				scout.task = Tasks.goToRoom(this.colony.room.name); // todo: make this more precise
				return
			}
		}
		*/

		// Pick a new room
		const neighboringRooms = _.values(Game.map.describeExits(scout.pos.roomName)) as string[];
		const roomName = _.sample(neighboringRooms);
		if (RoomIntel.isRoomAccessible(roomName)) {
			// TODO: check if scout is able to go there, otherwhise choose a different target
			scout.task = Tasks.goToRoom(roomName);
		}
	}

	run() {
		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
