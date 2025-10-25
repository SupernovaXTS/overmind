import {evolutionChamberLayout} from '../../roomPlanner/layouts/evolutionChamber';
import {profile} from '../../profiler/decorator';
import {Visualizer} from '../../visuals/Visualizer';
import {Directive} from '../Directive';

/**
 * Manually place an evolution chamber anchored at the target location for the RoomPlanner to use in semiautomatic or manual mode.
 * This enables dynamic bunker planning - the bunker core must be placed separately with a standard bunker directive.
 */
@profile
export class DirectiveRPDynamicBunker extends Directive {

	static directiveName = 'roomPlanner:EvolutionChamber';
	static color = COLOR_WHITE;
	static secondaryColor = COLOR_CYAN;

	constructor(flag: Flag) {
		super(flag);
	}

	spawnMoarOverlords() {

	}

	init(): void {
		this.colony.roomPlanner.addComponent('evolutionChamber', this.pos, this.memory.rotation);
	}

	run(): void {

	}

	visuals(): void {
		Visualizer.drawLayout(evolutionChamberLayout, this.pos);
	}
}
