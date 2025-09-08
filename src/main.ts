// @formatter:off
/* tslint:disable:ordered-imports */

'use strict';
global.PHASE = 'build';
global.LATEST_BUILD_TICK = Game.time;
// Import ALL the things! ==============================================================================================
import './console/globals'; // Global functions accessible from CLI
import './prototypes/Game'; // Game prototypes
import './prototypes/Creep'; // Creep prototypes
import './prototypes/PowerCreep'; // PowerCreep prototypes
import './prototypes/RoomObject'; // RoomObject and targeting prototypes
import './prototypes/RoomPosition'; // RoomPosition prototypes
import './prototypes/RoomVisual'; // Prototypes used in Visualizer class
import './prototypes/Room'; // Non-structure room prototypes
import './prototypes/RoomStructures'; // IVM-cached structure prototypes
import './prototypes/Structures'; // Prototypes for accessed structures
import './prototypes/Miscellaneous'; // Everything else
import './tasks/initializer'; // This line is necessary to ensure proper compilation ordering...
import './zerg/CombatZerg'; // ...so is this one... rollup is dumb about generating reference errors
import {USE_SCREEPS_PROFILER} from './~settings';
import {sandbox} from './utilities/sandbox';
import {Mem} from './memory/Memory';
import {OvermindConsole} from './console/Console';
import {Stats} from './stats/stats';
import profiler from './profiler/screeps-profiler';
import _Overmind from './Overmind';
import {VersionMigration} from './versionMigration/migrator';
// =====================================================================================================================

// Main loop
function main(): void {
	// Bump stack trace limit so we see more of it
	Error.stackTraceLimit = 20;

	// Memory operations: load and clean memory, suspend operation as needed -------------------------------------------
	Mem.load();									// Load previous parsed memory if present
	if (!Mem.shouldRun()) return;				// Suspend operation if necessary
	Mem.clean();								// Clean memory contents

	// Instantiation operations: build or refresh the game state -------------------------------------------------------
	if (!global.Overmind || Overmind.shouldBuild || Game.time >= Overmind.expiration) {
		PHASE = 'build';
		delete global.Overmind;					// Explicitly delete the old Overmind object
		Mem.garbageCollect(true);				// Run quick garbage collection
		global.Overmind = new _Overmind();		// Instantiate the Overmind object
		Overmind.build();						// Build phase: instantiate all game components
		LATEST_BUILD_TICK = Game.time;			// Record this tick as having a build reset
	} else {
		PHASE = 'refresh';
		Overmind.refresh();						// Refresh phase: update the Overmind state
	}

	// Tick loop cycle: initialize and run each component --------------------------------------------------------------
	PHASE = 'init';
	Overmind.init();							// Init phase: spawning and energy requests
	PHASE = 'run';
	Overmind.run();								// Run phase: execute state-changing actions
	PHASE = 'postRun';
	Overmind.visuals(); 						// Draw visuals
	Stats.run(); 								// Record statistics
	Memory.tick++;								// Record successful tick

	// Post-run code: handle sandbox code and error catching -----------------------------------------------------------
	// sandbox();		 						// Sandbox: run any testing code
	Overmind.postRun();							// Throw errors at end of tick; anything after here might not get run
}

// This gets run on each global reset
function onGlobalReset(): void {
	global.LATEST_GLOBAL_RESET_TICK = Game.time;
	global.LATEST_GLOBAL_RESET_DATE = new Date();
	if (USE_SCREEPS_PROFILER) profiler.enable();
	Mem.format();
	OvermindConsole.init();
	VersionMigration.run();
	Memory.stats.persistent.lastGlobalReset = Game.time;
	OvermindConsole.printUpdateMessage();
}

// Decide which loop to export as the script loop
let _loop: () => void;
if (USE_SCREEPS_PROFILER) {
	// Wrap the main loop in the profiler
	_loop = () => profiler.wrap(main);
} else {
	// Use the default main loop
	_loop = main;
}

export const loop = _loop;

// Run the global reset code
onGlobalReset();