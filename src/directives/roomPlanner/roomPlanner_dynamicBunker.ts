import {bunkerLayout} from '../../roomPlanner/layouts/bunker';
import {profile} from '../../profiler/decorator';
import {Visualizer} from '../../visuals/Visualizer';
import {Directive} from '../Directive';

/**
 * Manually place a dynamic bunker core anchored at the target location for the RoomPlanner to use in semiautomatic or manual mode.
 * The evolution chamber must be placed separately away from the bunker.
 */
@profile
export class DirectiveRPDynamicBunker extends Directive {

	static directiveName = 'roomPlanner:DynamicBunker';
	static color = COLOR_WHITE;
	static secondaryColor = COLOR_CYAN;

	constructor(flag: Flag) {
		super(flag);
	}

	spawnMoarOverlords() {

	}

	init(): void {
		this.colony.roomPlanner.addComponent('bunker', this.pos, this.memory.rotation);
	}

	run(): void {

	}

	visuals(): void {
		Visualizer.drawLayout(bunkerLayout, this.pos);
	}
}
