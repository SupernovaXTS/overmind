import { FeederOverlord } from 'overlords/situational/feeder';
import {Colony} from '../../Colony';
import {RemoteUpgradingOverlord} from '../../overlords/situational/remoteUpgrader';
import {profile} from '../../profiler/decorator';
import {Directive} from '../Directive';

// spawns transporters to carry energy to child room
@profile
export class DirectiveFeeder extends Directive {

	static directiveName = 'feeder';
	static color = COLOR_ORANGE;
	static secondaryColor = COLOR_GREEN;

	static requiredRCL = 3;

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
		this.alert(`Feeder active`);
	}

	run(): void {
		if (this.room && this.room.controller && this.room.controller.level == 8) {
			this.remove();
		}
	}
}
