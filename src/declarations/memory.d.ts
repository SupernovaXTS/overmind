type operationMode = 'manual' | 'semiautomatic' | 'automatic';

/**
 * TODO make this an enum
 * 0: Basic
 * 1: Collect from enemy storage/terminal
 * 2: Collect from all sources TBD
 * 3: Collect all and mine walls for energy TBD
 */
type resourceCollectionMode = number;

interface RawMemory {
	_parsed: any;
}
interface MemorySettings {
	signature: string;
	operationMode: operationMode;
	log: import("console/log").LogSettings;
	enableVisuals: boolean;
	intelVisuals: {
		/**
		 * Tick until which the intel room visuals are shown
		 */
		until?: number;
		range?: number;
	};
	allies: string[];
	resourceCollectionMode: resourceCollectionMode;
	powerCollection: {
		enabled: boolean;
		maxRange: number;
		minPower: number;
	};
	autoPoison: {
		enabled: boolean;
		maxRange: number;
		maxConcurrent: number;
	};
	pixelGeneration: {
		enabled: boolean;
	};
	roomPlanner: {
		/** Whether the roomplanner can destroy structures that aren't in its plan */
		allowDestroy: boolean;
	};
	colonization: {
		/** The max number of rooms to colonize. Set to `undefined` to use GCL */
		maxRooms: number | undefined;
		/** How close of another player a room we could expand into can be */
		safeZone: number;
	};
	feeder: {
			enabled?: boolean;
			maxRange?: number;        // linear room distance to search for donors
			donorMinRCL?: number;      // donor colony minimum RCL
			checkFrequency?: number;   // cadence in ticks to check (0 to check every tick)
			feedAllLowRCL?: boolean;   // reserved for future behavior
			allowList?: string[];      // receiver allow list
			denyList?: string[];       // receiver deny list
			maxConcurrent?: number;    // global max active feeder directives
			perDonorMaxConcurrent?: number; // per-donor max active feeder directives
		};
	attitude: {
		/**
		 * How aggressive the AI is
		 * Only used in room hostility checks for now.
		 */
		brazenness: number;
	};
	logistics?: {
			haulQueue?: {
				maxRetries?: number;
				maxAge?: number; // ticks
			}
		},
	accountResources?: {
		pixelGenerationEnabled?: boolean;
		tradePixels?: boolean;
		tradeCPUUnlocks?: boolean;
		pixel?: {
			min?: number;           // Minimum pixels to maintain in account
			max?: number;           // Maximum pixels before selling excess
			buyThreshold?: number;  // Buy pixels when below this amount
			sellThreshold?: number; // Sell pixels when above this amount
		};
		cpuUnlock?: {
			min?: number;           // Minimum CPU unlocks to keep (reserve for emergencies)
			max?: number;           // Maximum CPU unlocks before selling excess
			buyThreshold?: number;  // Buy CPU unlocks when below this amount
			sellThreshold?: number; // Sell CPU unlocks when above this amount
		};
	}
}

interface Memory {
	tick: number;
	build: number;
	Overmind: {};
	profiler: any;
	overseer: any;
	segmenter: import ("console/Segmenter").SegmenterMemory;
	roomIntel: any;
	colonies: { [name: string]: any };
	creeps: { [name: string]: CreepMemory; };
	powerCreeps: {[name: string]: PowerCreepMemory};
	flags: { [name: string]: FlagMemory; };
	rooms: { [name: string]: RoomMemory; };
	spawns: { [name: string]: SpawnMemory; };
	pathing: PathingMemory;
	constructionSites: { [id: string]: number };
	stats: any;

	// suspend?: number;
	resetBucket?: boolean;
	haltTick?: number;
	combatPlanner: any;
	playerCreepTracker: { // TODO revisit for a better longterm solution
		[playerName: string]: CreepTracker
	};
	// zoneRooms: { [roomName: string]: { [type: string]: number } };

	reinforcementLearning?: {
		enabled?: boolean;
		verbosity?: number;
		workerIndex?: number;
	};

	screepsProfiler?: any;
	settings: MemorySettings;
	settings: {
		signature: string;
		operationMode: operationMode;
		log: any;
		enableVisuals: boolean;
		allies: string[];
		resourceCollectionMode: resourceCollectionMode;
		
		powerCollection: {
			enabled: boolean;
			maxRange: number;
			minPower: number;
			minEnergy: number;
		};
		autoPoison: {
			enabled: boolean;
			maxRange: number;
			maxConcurrent: number;
		},
		
	};

	[otherProperty: string]: any;
}

interface StatsMemory {
	cpu: {
		getUsed: number;
		limit: number;
		bucket: number;
		usage: {
			[colonyName: string]: {
				init: number;
				run: number;
				visuals: number;
			}
		}
	};
	gcl: {
		progress: number;
		progressTotal: number;
		level: number;
	};
	colonies: {
		[colonyName: string]: {
			hatchery: {
				uptime: number;
			}
			miningSite: {
				usage: number;
				downtime: number;
			}
			storage: {
				energy: number;
			}
			rcl: {
				level: number,
				progress: number,
				progressTotal: number,
			}
		}
	};
}

interface PublicSegment {

}

interface CreepMemory {
	[MEM.OVERLORD]: string | null;
	[MEM.COLONY]: string | null;
	[MEM.SHARD]?: string;
	role: string;
	task: ProtoTask | null;
	mission?: ProtoMission;
	sleepUntil?: number;
	needBoosts?: ResourceConstant[];
	data: {
		origin: string;
	};
	avoidDanger?: {
		start: number;
		timer: number;
		fallback: string;
	};
	noNotifications?: boolean;
	_go?: MoveData;
	debug?: boolean;
	talkative?: boolean;
}

interface MoveData {
	state: any[];
	path?: string;
	roomVisibility: { [roomName: string]: boolean };
	delay?: number;
	fleeWait?: number;
	destination?: ProtoPos;
	priority?: number;
	waypoints?: string[];
	waypointsVisited?: string[];
	portaling?: boolean;
}

interface CachedPath {
	path: RoomPosition[];
	length: number;
	tick: number;
}

interface PathingMemory {
	// paths: { [originName: string]: { [destinationName: string]: CachedPath; } };
	distances: { [pos1Name: string]: { [pos2Name: string]: number; } };
	// weightedDistances: { [pos1Name: string]: { [pos2Name: string]: number; } };
}

interface CreepTracker {
	creeps: { [name: string]: number }; 	// first tick seen
	types: { [type: string]: number }; 		// amount seen
	parts: { [bodyPart: string]: number }; 	// quantity
	boosts: { [boostType: string]: number };	// how many boosts are spent
}

interface FlagMemory {
	[MEM.TICK]?: number;
	[MEM.EXPIRATION]?: number;
	[MEM.COLONY]?: string;
	[MEM.DISTANCE]?: {
		[MEM_DISTANCE.UNWEIGHTED]: number;
		[MEM_DISTANCE.WEIGHTED]: number;
		[MEM.EXPIRATION]: number;
		incomplete?: boolean;
	};
	debug?: boolean;
	amount?: number;
	persistent?: boolean;
	setPos?: ProtoPos;
	rotation?: number;
	parent?: string;
	maxPathLength?: number;
	pathNotRequired?: boolean;
	maxLinearRange?: number;
	keepStorageStructures?: boolean;
	keepRoads?: boolean;
	keepContainers?: boolean;
	// waypoints?: string[];
	allowPortals?: boolean;
	recalcColonyOnTick?: number;
}

// Room memory key aliases to minimize memory size

declare const enum MEM {
	TICK       = 'T',
	EXPIRATION = 'X',
	COLONY     = 'C',
	OVERLORD   = 'O',
	DISTANCE   = 'D',
	STATS      = 'S',
	SHARD      = 'H',
}

declare const enum MEM_DISTANCE {
	UNWEIGHTED = 'u',
	WEIGHTED   = 'w',
}





