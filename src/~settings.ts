// Global settings file containing player information

import {leftAngleQuote, rightAngleQuote} from './utilities/stringConstants';
import {
	getMyUsername,
	onPublicServer,
} from './utilities/utils';

/**
 * Your username - you shouldn't need to change this.
 */
export const MY_USERNAME: string = getMyUsername();
/**
 * Enable this to build from source including screeps-profiler. (This is separate from Overmind-Profiler.)
 */
var user = getMyUsername()
export const USE_SCREEPS_PROFILER: boolean = false;
export var ALLIES: [
	user: string
]

/**
 * Profiling is incredibly expensive and can cause the script to time out. By setting this option, you can limit the
 * number of colonies that will be handled while profiling. Colonies above this limit do not get run.
 */
export const PROFILER_COLONY_LIMIT = Math.ceil(Game.gcl.level / 2);

/**
 * While profiling, ensure these colonies are included in the randomly chosen ones specified by PROFILER_COLONY_LIMIT.
 */
export const PROFILER_INCLUDE_COLONIES: string[] = ['W7N7', 'W3N7', 'W7N4'];

/**
 * Enable this to wrap evaluations of constructor, init, and run phase for each colony in try...catch statemenets.
 */
export const USE_TRY_CATCH: boolean = true;

/**
 * Enable this to suppress alerts of invalid flag color codes. (Don't do this unless you know what you're doing.)
 */
export const SUPPRESS_INVALID_DIRECTIVE_ALERTS: boolean = false;

/**
 * Default controller signature; don't change this.
 * You can set your controller signature with the console command "setSignature()"
 * Operation will be penalized by skipping every 3rd tick for using a signature that does not contain the substring
 * "overmind" or the small-caps variant.
 */
export const OVERMIND_SMALL_CAPS = 'NOVAMIND';
export const DEFAULT_OVERMIND_SIGNATURE = leftAngleQuote + OVERMIND_SMALL_CAPS + rightAngleQuote;
global.__DEFAULT_OVERMIND_SIGNATURE__ = DEFAULT_OVERMIND_SIGNATURE;

/**
 * If this is enabled, Memory.bot will default to true. This will not change the mode if already set - use setMode().
 */
export const DEFAULT_OPERATION_MODE: operationMode = 'automatic';
// I AM FUCKING BLIND

/**
 * Limit how many rooms you can claim (for any shard)
 */
export const MAX_OWNED_ROOMS = Infinity;

/**
 * If you are running on shard3 (CPU limit 20), only claim this many rooms
 */
export const SHARD3_MAX_OWNED_ROOMS = 2;

/**
 * The amount of credits that Overmind will try to keep in the bank. Default:
 * Private servers: 1,000 (will spend aggressively)
 * Public servers: 100,000 if you are below GCL 10, otherwise 1,000,000.
 */
export const RESERVE_CREDITS = onPublicServer() ? (Game.gcl.level >= 10 ? 1e6 : 1e5) : 1000;

/**
 * The global Overmind object will be re-instantiated after this many ticks. In the meantime, refresh() is used.
 */
export const NEW_OVERMIND_INTERVAL = onPublicServer() ? 20 : 5;

/**
 * Master scale for the RoomVisuals GUI // TODO: not plugged in yet
 */
export const GUI_SCALE = 1.0;