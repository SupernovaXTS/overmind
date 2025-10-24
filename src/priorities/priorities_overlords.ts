import {Colony} from 'Colony';

/**
 * Default ordering for processing spawning requests and prioritizing overlords
 */
export const OverlordPriority = {
	emergency: {				// Colony-wide emergencies such as a catastrophic crash
		bootstrap: 1,
	},

	core: {						// Functionality related to spawning more creeps
		queen  : 100,
		manager: 101,
	},

	powerCreeps: {
		default: 150,
	},

	defense: {					// Defense of local and remote rooms
		meleeDefense : 200,
		rangedDefense: 201,
	},

	outpostDefense: {
		outpostDefense: 250,
		guard         : 251,
	},

	warSpawnCutoff: 299,		// Everything past this is non-critical and won't be spawned in case of emergency

	offense: {					// Offensive operations like raids or sieges
		destroy         : 300,
		healPoint       : 301,
		siege           : 302,
		controllerAttack: 399,
	},
	scouting: {
		stationary  : 410,
		randomWalker: 411,
	},
	colonization: {				// Colonizing new rooms
		claim          : 401,
		pioneer        : 402,
		remoteUpgrading: 410,
	},

	priorityOwnedRoom: {		// Situationally prioritized in-room operations
		priorityUpgrade  : 450,
		priorityTransport: 451,
	},

	ownedRoom: {				// Operation of an owned room
		firstTransport: 400,	// High priority to spawn the first transporter
		mine          : 460,
		work          : 503,
		mineralRCL8   : 504,
		transport     : 505,	// Spawn the rest of the transporters
		mineral       : 506,
	},
	remoteRoom: {				// Operation of a remote room. Allows colonies to restart one room at a time.
		reserve      : 510,
		mine         : 460,
		roomIncrement: 5,		// Remote room priorities are incremented by this for each outpost
	},
	outpostOffense: {
		harass      : 560,
		roomPoisoner: 561,
	},
	sectorLogi: {
		feeder: 603,
		intersectorTransport: 602,
	},
	upgrading: {				// Spawning upgraders
		upgrade: 600,
	},

	collectionUrgent: {			// Collecting resources that are time sensitive, like decaying resources on ground
		haul: 700,
	},

	throttleThreshold: 799,		// Everything past this may be throttled in the event of low CPU

	remoteSKRoom: {
		sourceReaper : 1000,
		mineral      : 1001,
		mine         : 1002,
		roomIncrement: 5,
	},			
	powerMine: {
		cool         : 1050,
		drill        : 1051,
		roomIncrement: 5,
	},

	tasks: {					// Non-urgent tasks, such as collection from a deserted storage
		haul     : 1100,
		dismantle: 1101,
	},

	default: 99999,				// Default overlord priority to ensure it gets run last
};

export type OverlordPriorityType = typeof OverlordPriority;

/**
 * Priority manager class for handling multiple priority profiles
 */
export class PrioritiesOverlords {
	private _profile: string;
	private _colony: Colony | null;
	private readonly _priorities: {[profile: string]: OverlordPriorityType} = {
		default: {
			emergency: {				// Colony-wide emergencies such as a catastrophic crash
				bootstrap: 1,
			},

			core: {						// Functionality related to spawning more creeps
				queen  : 100,
				manager: 101,
			},

			powerCreeps: {
				default: 150,
			},

			defense: {					// Defense of local and remote rooms
				meleeDefense : 200,
				rangedDefense: 201,
			},

			outpostDefense: {
				outpostDefense: 250,
				guard         : 251,
			},

			warSpawnCutoff: 299,		// Everything past this is non-critical and won't be spawned in case of emergency

			offense: {					// Offensive operations like raids or sieges
				destroy         : 300,
				healPoint       : 301,
				siege           : 302,
				controllerAttack: 399,
			},
			scouting: {
				stationary  : 410,
				randomWalker: 411,
			},
			colonization: {				// Colonizing new rooms
				claim          : 401,
				pioneer        : 402,
				remoteUpgrading: 410,
			},

			priorityOwnedRoom: {		// Situationally prioritized in-room operations
				priorityUpgrade  : 450,
				priorityTransport: 451,
			},

			ownedRoom: {				// Operation of an owned room
				firstTransport: 500,	// High priority to spawn the first transporter
				mine          : 501,
				work          : 503,
				mineralRCL8   : 504,
				transport     : 505,	// Spawn the rest of the transporters
				mineral       : 506,
			},
			remoteRoom: {				// Operation of a remote room. Allows colonies to restart one room at a time.
				reserve      : 604,
				mine         : 502,
				roomIncrement: 1,		// Remote room priorities are incremented by this for each outpost
			},
			outpostOffense: {
				harass      : 560,
				roomPoisoner: 561,
			},
			sectorLogi: {
				feeder: 602,
				intersectorTransport: 601,
			},
			upgrading: {				// Spawning upgraders
				upgrade: 600,
			},

			collectionUrgent: {			// Collecting resources that are time sensitive, like decaying resources on ground
				haul: 700,
			},

			throttleThreshold: 799,		// Everything past this may be throttled in the event of low CPU
			
			
			remoteSKRoom: {
				sourceReaper : 1000,
				mineral      : 1001,
				mine         : 1002,
				roomIncrement: 5,
			},

			powerMine: {
				cool         : 1050,
				drill        : 1051,
				roomIncrement: 5,
			},

			tasks: {					// Non-urgent tasks, such as collection from a deserted storage
				haul     : 1100,
				dismantle: 1101,
			},

			default: 99999,				// Default overlord priority to ensure it gets run last
		},
	};

	constructor(colony?: Colony, profile: string = 'default') {
		this._colony = colony || null;
		this._profile = profile;

		// Validate profile exists
		if (!this._priorities[this._profile]) {
			console.log(`Warning: Profile '${this._profile}' not found, using 'default'`);
			this._profile = 'default';
		}
	}

	get profile(): string {
		return this._profile;
	}

	get colony(): Colony | null {
		return this._colony;
	}

	set colony(colony: Colony | null) {
		this._colony = colony;
	}

	/**
	 * Get the priorities for the current profile
	 */
	getPriorities(): OverlordPriorityType {
		return this._priorities[this._profile] || this._priorities.default;
	}

	/**
	 * Set the active priority profile
	 */
	setProfile(profile: string): void {
		if (this._priorities[profile]) {
			this._profile = profile;
		} else {
			console.log(`Warning: Profile '${profile}' not found, using 'default'`);
			this._profile = 'default';
		}
	}

	/**
	 * Add a new priority profile
	 */
	addProfile(name: string, priorities: OverlordPriorityType): void {
		this._priorities[name] = priorities;
	}

	/**
	 * Get all available profile names
	 */
	getProfileNames(): string[] {
		return Object.keys(this._priorities);
	}
}

// Create a singleton instance for global use
export const priorityManager = new PrioritiesOverlords();

export default PrioritiesOverlords;
