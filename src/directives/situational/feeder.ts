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
		if (DirectiveFeeder.findInColony(this.colony).length > 1) {
			this.remove();
			return;
		}
		if (this.room && DirectiveFeeder.isPresent(this.pos) || this.colony.state.beingFed) {
			this.remove();
			return;
		}

		this.colony.state.beingFed = true;
		this.alert(`Feeder active`);
	}

	run(): void {
		if (this.colony && this.colony.assets.energy <= DirectiveFeeder.maxFeed) {
			this.remove();
			this.colony.state.beingFed = false;
		}
		if (DirectiveFeeder.findInColony(this.colony).length > 1) {
			this.remove();
			return;
		}
		if (this.room && DirectiveFeeder.isPresent(this.pos) || this.colony.state.beingFed) {
			this.remove();
			return;
		}
	}
}
