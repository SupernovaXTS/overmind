import {Colony} from '../../Colony';
import {log} from '../../console/log';
import {Roles, Setups} from '../../creepSetups/setups';
import {RoomIntel} from '../../intel/RoomIntel';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

const DEFAULT_NUM_SCOUTS = 1;

/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */

// Global toggle for controlling if we scout in newbie or respawn zones
// Realistically should only be used when WE are in a respawn area
const zoneController = true;
@profile
export class RandomWalkerScoutOverlord extends Overlord {
	scouts: Zerg[];

	constructor(colony: Colony, priority = OverlordPriority.scouting.randomWalker) {
		super(colony, 'scout', priority);
		this.scouts = this.zerg(Roles.scout, {notifyWhenAttacked: false});
	}

	init() {
		if ( !zoneController && this.room && this.hasIndestrucibleWalls(this.room)) {
			// do not spawn random scouts if we have walls in our room
			// FIXME: just navigate to another room
			return;
		}

		this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
	}

	private handleScout(scout: Zerg) {
		// Check if room might be connected to newbie/respawn zone
		if (!zoneController && this.hasIndestrucibleWalls(scout.room)) {
			log.debug(`suiciding scout since newbie room discovered: ${this.room?.print}`);
			scout.retire();
			return;
		}

		// Pick a new room
		const neighboringRooms = _.values(Game.map.describeExits(scout.pos.roomName)) as string[];
		const roomName = _.sample(neighboringRooms);
		if (RoomIntel.isRoomAccessible(roomName)) {
			// TODO: check if scout is able to go there, otherwhise choose a different target
			scout.task = Tasks.goToRoom(roomName);
		}
	}

	hasIndestrucibleWalls(room: Room): boolean {
		const indestructibleWalls = _.filter(room.walls, wall => wall.hits == undefined);
		return indestructibleWalls.length > 0;
	}

	run() {
		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
