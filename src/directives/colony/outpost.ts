import {log} from '../../console/log';
import {patternCost} from '../../creepSetups/CreepSetup';
import {Setups} from '../../creepSetups/setups';
import {RoomIntel} from '../../intel/RoomIntel';
import {ReservingOverlord} from '../../overlords/colonization/reserver';
import {StationaryScoutOverlord} from '../../overlords/scouting/stationary';
import {profile} from '../../profiler/decorator';
import {Cartographer, ROOMTYPE_CONTROLLER} from '../../utilities/Cartographer';
import {Directive} from '../Directive';

/**
 * Registers an unowned mining outpost for a nearby colony
 */
@profile
export class DirectiveOutpost extends Directive {

	static directiveName = 'outpost';
	static color = COLOR_PURPLE;
	static secondaryColor = COLOR_PURPLE;

	static settings = {
		canSpawnReserversAtRCL: 3,
	};

	spawnMoarOverlords() {
		if (Cartographer.roomType(this.pos.roomName) == ROOMTYPE_CONTROLLER &&
			this.colony.level >= DirectiveOutpost.settings.canSpawnReserversAtRCL &&
			// only use this overlord if the extensions are alrady built
			patternCost(Setups.infestors.reserve) <= this.colony.room.energyCapacityAvailable
		) {
			this.overlords.reserve = new ReservingOverlord(this);
			return;
		}

		this.overlords.scout = new StationaryScoutOverlord(this);
	}

	init(): void {

	}

	run(): void {
		if (RoomIntel.roomOwnedBy(this.pos.roomName)) {
			log.warning(`Removing ${this.print} since room is owned!`);
			this.remove();
		}
		if (Game.time % 10 == 3 && this.room && this.room.controller
			&& !this.pos.isEqualTo(this.room.controller.pos) && !this.memory.setPos) {
			this.setPosition(this.room.controller.pos);
		}
	}
}

