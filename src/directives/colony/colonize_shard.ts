import {log} from '../../console/log';
import {ClaimingOverlord} from '../../overlords/colonization/claimer';
import {PioneerOverlord} from '../../overlords/colonization/pioneer';
import {profile} from '../../profiler/decorator';
import {Cartographer, ROOMTYPE_CONTROLLER, ROOMTYPE_CROSSROAD} from '../../utilities/Cartographer';
import {printRoomName} from '../../utilities/utils';
import {Directive} from '../Directive';


/**
 * Claims a new room and builds a spawn but does not incubate. Removes when spawn is constructed.
 */
@profile
export class DirectiveColonizeShard extends Directive {

	static directiveName = 'colonizeShard';
	static color = COLOR_PURPLE;
	static secondaryColor = COLOR_BLUE;

	static requiredRCL = 3;

	overlords: {
		claim: ClaimingOverlord;
		pioneer: PioneerOverlord;
	};

	constructor(flag: Flag) {
		flag.memory.allowPortals = true;
		super(flag, colony => colony.level >= DirectiveColonizeShard.requiredRCL
							  && colony.name != Directive.getPos(flag).roomName && colony.spawns.length > 0);
		// Remove if misplaced
		const roomType = Cartographer.roomType(this.pos.roomName)
		if (roomType != ROOMTYPE_CONTROLLER && roomType != ROOMTYPE_CROSSROAD) {
			log.warning(`${this.print}: ${printRoomName(this.pos.roomName)} is not a controller or crossroad (portal) room; ` +
						`removing directive!`);
			this.remove(true);
			return;
		}

		if (roomType == ROOMTYPE_CROSSROAD) {
			// TODO: make sure that this is places ON the portal
		}
	}

	spawnMoarOverlords() {
		this.overlords.claim = new ClaimingOverlord(this);
		this.overlords.pioneer = new PioneerOverlord(this);
	}

	init() {
		this.alert(`Colonization on new shard in progress`);
	}

	run() {
		// TODO remove directive once zergs are gone
		// NOTE: currently this needs to manually removed once bootstrapped
		// Remove the directive
		//this.remove();
	}
}
