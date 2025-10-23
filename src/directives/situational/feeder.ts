import { FeederOverlord } from 'overlords/situational/feeder';
import {Colony} from '../../Colony';
import {RemoteUpgradingOverlord} from '../../overlords/situational/remoteUpgrader';
import {profile} from '../../profiler/decorator';
import {Directive} from '../Directive';
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
		// Include source (parent) and destination (child) colony in notification without links or colors
		const sourceColonyName = this.colony?.name || 'unknown-source';
		const destinationColony = Overmind.colonies[this.pos.roomName];
		const destinationColonyName = destinationColony?.name || this.pos.roomName;
		this.alert(`Feeder active: ${sourceColonyName} ${rightArrow} ${destinationColonyName}`);
	}

	run(): void {
		if (this.colony && this.colony.assets.energy <= DirectiveFeeder.maxFeed) {
			this.remove();
			this.colony.state.beingFed = false;
		}
	}
}
