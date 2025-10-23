import { FeederOverlord } from 'overlords/situational/feeder';
import {Colony} from '../../Colony';
import {RemoteUpgradingOverlord} from '../../overlords/situational/remoteUpgrader';
import {profile} from '../../profiler/decorator';
import {Directive} from '../Directive';
import {color, printRoomName} from '../../utilities/utils';
import {rightArrow} from '../../utilities/stringConstants';

// spawns transporters to carry energy to child room
@profile
export class DirectiveFeeder extends Directive {

	static directiveName = 'feeder';
	static color = COLOR_ORANGE;
	static secondaryColor = COLOR_GREEN;
	
	static requiredRCL = 3;
	static maxFeed: number = 100000; // Max total energy to be fed
	overlords: {
		feeder: FeederOverlord
	};

	constructor(flag: Flag) {
		flag.memory.allowPortals = true;
		super(flag, (colony: Colony) => colony.level >= DirectiveFeeder.requiredRCL);
	}

	spawnMoarOverlords() {
		this.overlords.feeder = new FeederOverlord(this);
	}

	init(): void {
		this.colony.state.beingFed = true;
		// Include source (parent) and destination (child) colony in notification with colored markers
		const sourceColonyName = this.colony?.name || 'unknown-source';
		const destinationColony = Overmind.colonies[this.pos.roomName];
		const destinationColonyName = destinationColony?.name || this.pos.roomName;
		const src = color(printRoomName(sourceColonyName, true), '#00c853'); // green
		const dst = color(printRoomName(destinationColonyName, true), '#ff9800'); // orange
		this.alert(`Feeder active: ${src} ${rightArrow} ${dst}`);
	}

	run(): void {
		if (this.colony && this.colony.assets.energy <= DirectiveFeeder.maxFeed) {
			this.remove();
			this.colony.state.beingFed = false;
		}
	}
}
