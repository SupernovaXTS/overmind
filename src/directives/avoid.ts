import { Directive } from './Directive';
import { profile } from 'profiler/decorator';

@profile
export class DirectiveAvoid extends Directive {
    static directiveName = 'avoid';
    static color = COLOR_RED;
    static secondaryColor = COLOR_YELLOW;

    constructor(flag: Flag) {
        super(flag);
    }

    spawnMoarOverlords() {
        // Implement avoidance logic here
    }

    init() {}
    run() {}
}
