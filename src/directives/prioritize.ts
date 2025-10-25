import { Directive } from './Directive';
import { profile } from 'profiler/decorator';

@profile
export class DirectivePrioritize extends Directive {
    static directiveName = 'prioritize';
    static color = COLOR_YELLOW;
    static secondaryColor = COLOR_RED;

    constructor(flag: Flag) {
        super(flag);
    }

    spawnMoarOverlords() {
        // Implement prioritization logic here
    }

    init() {}
    run() {}
}
