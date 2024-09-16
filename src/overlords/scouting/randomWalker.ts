import {Colony} from '../../Colony';
import {Roles, Setups} from '../../creepSetups/setups';
import {RoomIntel} from '../../intel/RoomIntel';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
import {log} from '../../console/log';

const DEFAULT_NUM_SCOUTS = 1;

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
		if (this.room && this.hasIndestrucibleWalls(this.room)) {
			// do not spawn random scouts if we have walls in our room
			// FIXME: just navigate to another room
			return
		}

		this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
	}

	private handleScout(scout: Zerg) {
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
		return indestructibleWalls.length > 0
	}

	run() {
		for (const scout of this.scouts) {
			// Check if room might be connected to newbie/respawn zone
			if (this.hasIndestrucibleWalls(scout.room)) {
				log.debug(`suiciding scout since newbie room discovered: ${this.room?.print}`)
				scout.retire()
				continue
			}
		}

		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
