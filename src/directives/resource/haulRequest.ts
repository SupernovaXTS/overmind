import {$} from '../../caching/GlobalCache';
import {profile} from '../../profiler/decorator';
import {Directive} from '../Directive';
import { HaulingOverlordRequest } from 'overlords/situational/haulerRequest';
import { Colony } from 'Colony';


interface DirectiveHaulRequestMemory extends FlagMemory {
	totalResources?: number;
	hasDrops?: boolean;
	manifest?: StoreDefinitionUnlimited;
	// Explicit routing hints
	source?: string;
	destination?: string;
	// store: { [resource: string]: number };
	path?: {
		plain: number,
		swamp: number,
		road: number
	};
}


/**
 * Hauling directive: spawns hauler creeps to move large amounts of resources from a location (e.g. draining a storage)
 */
@profile
export class DirectiveHaulRequest extends Directive {

	static directiveName = 'haul';
	static color = COLOR_YELLOW;
	static secondaryColor = COLOR_BLUE;
	static requiredRCL = 4;

	private _store: StoreDefinition;
	private _drops: { [resourceType: string]: Resource[] };
	private _finishAtTime: number;
	private _source?: string;
	private _destination?: string;

	memory: DirectiveHaulRequestMemory;

	constructor(flag: Flag) {
		super(flag, (colony) => colony.level >= DirectiveHaulRequest.requiredRCL);
		// Default destination to the directive-associated colony
		if (this.colony) {
			this._destination = this.colony.name;
		}
		// Default source to a colony in the directive room if present
		const roomName = this.pos.roomName;
		if (roomName && Overmind.colonies[roomName]) {
			this._source = Overmind.colonies[roomName].name;
		}
		// Override from memory if provided
		if (this.memory.source) this._source = this.memory.source;
		if (this.memory.destination) this._destination = this.memory.destination;
	}

	public get manifest() {
		var request = this.memory.manifest || {};
		var store = this.store || {};
		var manifest: StoreDefinitionUnlimited = {};
		if (store) {
			for (const resourceType in store) {
				if (request[resourceType as ResourceConstant] == undefined) {
					request[resourceType as ResourceConstant] = 0;
				}
				if (store[resourceType as ResourceConstant] == undefined) {
					store[resourceType as ResourceConstant] = 0;
				}
				var requestResource = request[resourceType as ResourceConstant] || 0;
				var sourceResource = store[resourceType as ResourceConstant] || 0;
				if (requestResource == 0 || sourceResource == 0) {
					continue;
				}
				if (requestResource >= sourceResource) {
					manifest[resourceType as ResourceConstant] = requestResource;
				}
			}
		}
		return manifest;
	}

	spawnMoarOverlords() {
		this.overlords.haul = new HaulingOverlordRequest(this);
	}

	get targetedBy(): string[] {
		return Overmind.cache.targets[this.ref];
	}

	get drops(): { [resourceType: string]: Resource[] } {
		if (!this.pos.isVisible) {
			return {};
		}
		if (!this._drops) {
			const drops = (this.pos.lookFor(LOOK_RESOURCES) || []) as Resource[];
			this._drops = _.groupBy(drops, drop => drop.resourceType);
		}
		return this._drops;
	}

	get hasDrops(): boolean {
		return _.keys(this.drops).length > 0;
	}

	get storeStructure(): StructureStorage | StructureTerminal | StructureNuker | StructureContainer | Ruin | undefined {
		if (this.pos.isVisible) {
			return <StructureStorage>this.pos.lookForStructure(STRUCTURE_STORAGE) ||
				   <StructureTerminal>this.pos.lookForStructure(STRUCTURE_TERMINAL) ||
				   <StructureNuker>this.pos.lookForStructure(STRUCTURE_NUKER) ||
				   <StructureContainer>this.pos.lookForStructure(STRUCTURE_CONTAINER) ||
				   <Ruin>this.pos.lookFor(LOOK_RUINS).filter(ruin => ruin.store.getUsedCapacity() > 0)[0] ||
				   <Tombstone>this.pos.lookFor(LOOK_TOMBSTONES).filter(tombstone => tombstone.store.getUsedCapacity() > 0)[0];
		}
		return undefined;
	}

	get store(): { [resource: string]: number } {
		if (!this._store) {
			// Merge the "storage" of drops with the store of structure
			let store: { [resourceType: string]: number } = {};
			if (this.storeStructure) {
				store = this.storeStructure.store;
			} else {
				store = {energy: 0};
			}

			// Merge with drops
			for (const resourceType of _.keys(this.drops)) {
				const totalResourceAmount = _.sum(this.drops[resourceType], drop => drop.amount);
				if (store[resourceType]) {
					store[resourceType] += totalResourceAmount;
				} else {
					store[resourceType] = totalResourceAmount;
				}
			}
			this._store = store as StoreDefinition;
		}
		// log.alert(`Haul directive ${this.print} has store of ${JSON.stringify(this._store)}`);
		return this._store;
	}

	/**
	 * Source colony for the haul request
	 */
	get source(): string | undefined {
		return this._source;
	}

	set source(colonyName: string | undefined) {
		this._source = colonyName;
	}

	/**
	 * Destination colony for the haul request
	 */
	get destination(): string | undefined {
		return this._destination || this.colony?.name;
	}

	set destination(colonyName: string | undefined) {
		this._destination = colonyName;
	}

	/**
	 * Total amount of resources remaining to be transported; cached into memory in case room loses visibility
	 */
	get totalResources(): number {
		if (this.pos.isVisible && this.manifest) {
			this.memory.totalResources = _.sum(this.manifest); // update total amount remaining
		} else {
			if (this.memory.totalResources == undefined) {
				return 1000; // pick some non-zero number so that haulers will spawn
			}
		}
		return this.memory.totalResources;
	}

	refresh(): void {
		super.refresh();
		this._store = undefined;
	}

	init(): void {
		this.alert(`Haul directive active - ${this.totalResources}`);
	}

	run(): void {
		if (this.pos.isVisible && _.sum(this.store) == 0) {
			// If everything is picked up, crudely give enough time to bring it back
			this._finishAtTime = this._finishAtTime || (Game.time + 300);
		}
		if (Game.time >= this._finishAtTime || (this.totalResources == 0 &&
												(this.overlords.haul as HaulingOverlordRequest).haulers.length == 0)) {
			// this.remove();
		}
	}
}

