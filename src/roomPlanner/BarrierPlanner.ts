import {getCutTiles} from '../algorithms/minCut';
import {Colony} from '../Colony';
import {log} from '../console/log';
import {Mem} from '../memory/Memory';
import {profile} from '../profiler/decorator';
import {packCoord, packCoordList, unpackCoordListAsPosList} from '../utilities/packrat';
import {minMax} from '../utilities/utils';
import {BUNKER_RADIUS, bunkerLayout, insideBunkerBounds} from './layouts/bunker';
import {getAllStructureCoordsFromLayout, RoomPlanner, translatePositions} from './RoomPlanner';

export interface BarrierPlannerMemory {
	barrierCoordsPacked: string;
}

const getDefaultBarrierPlannerMemory: () => BarrierPlannerMemory = () => ({
	barrierCoordsPacked: '',
});

@profile
export class BarrierPlanner {

	private colony: Colony;
	private memory: BarrierPlannerMemory;
	private roomPlanner: RoomPlanner;
	private barrierPositions: RoomPosition[];
	private _barrierLookup: ((pos: RoomPosition) => boolean) | undefined;

	static settings = {
		buildBarriersAtRCL: 3,
		padding           : 3, // allow this much space between structures and barriers (if possible)
		bunkerizeRCL      : 7
	};

	constructor(roomPlanner: RoomPlanner) {
		this.roomPlanner = roomPlanner;
		this.colony = roomPlanner.colony;
		this.memory = Mem.wrap(this.colony.memory, 'barrierPlanner', getDefaultBarrierPlannerMemory);
		this.barrierPositions = [];
	}

	refresh(): void {
		this.memory = Mem.wrap(this.colony.memory, 'barrierPlanner', getDefaultBarrierPlannerMemory);
		this.barrierPositions = [];
	}

	private computeBunkerBarrierPositions(bunkerPos: RoomPosition, upgradeSitePos: RoomPosition): RoomPosition[] {
		const rectArray = [];
		const padding = BarrierPlanner.settings.padding;
		if (bunkerPos) {
			const {x, y} = bunkerPos;
			const r = BUNKER_RADIUS - 1;
			let [x1, y1] = [Math.max(x - r - padding, 0), Math.max(y - r - padding, 0)];
			let [x2, y2] = [Math.min(x + r + padding, 49), Math.min(y + r + padding, 49)];
			// Make sure you don't leave open walls
			x1 = minMax(x1, 3, 50 - 3);
			x2 = minMax(x2, 3, 50 - 3);
			y1 = minMax(y1, 3, 50 - 3);
			y2 = minMax(y2, 3, 50 - 3);
			rectArray.push({x1: x1, y1: y1, x2: x2, y2: y2});
		}
		// Get Min cut
		const barrierCoords = getCutTiles(this.colony.name, rectArray, false, 2, false);
		let positions = _.map(barrierCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
		positions = positions.concat(upgradeSitePos.availableNeighbors(true));
		
		// Add tunnel positions (roads through walls)
		positions = positions.concat(this.getTunnelPositions());

		return positions;
	}

	private computeBarrierPositions(hatcheryPos: RoomPosition, commandCenterPos: RoomPosition,
									upgradeSitePos: RoomPosition): RoomPosition[] {
		const rectArray = [];
		const padding = BarrierPlanner.settings.padding;
		if (hatcheryPos) {
			const {x, y} = hatcheryPos;
			const [x1, y1] = [Math.max(x - 5 - padding, 0), Math.max(y - 4 - padding, 0)];
			const [x2, y2] = [Math.min(x + 5 + padding, 49), Math.min(y + 6 + padding, 49)];
			rectArray.push({x1: x1, y1: y1, x2: x2, y2: y2});
		}
		if (commandCenterPos) {
			const {x, y} = commandCenterPos;
			const [x1, y1] = [Math.max(x - 3 - padding, 0), Math.max(y - 0 - padding, 0)];
			const [x2, y2] = [Math.min(x + 0 + padding, 49), Math.min(y + 5 + padding, 49)];
			rectArray.push({x1: x1, y1: y1, x2: x2, y2: y2});
		}
		if (upgradeSitePos) {
			const {x, y} = upgradeSitePos;
			const [x1, y1] = [Math.max(x - 1, 0), Math.max(y - 1, 0)];
			const [x2, y2] = [Math.min(x + 1, 49), Math.min(y + 1, 49)];
			rectArray.push({x1: x1, y1: y1, x2: x2, y2: y2});
		}
		// Get Min cut
		const barrierCoords = getCutTiles(this.colony.name, rectArray, true, 2, false);
		let positions = _.map(barrierCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
		
		// Add tunnel positions (roads through walls)
		positions = positions.concat(this.getTunnelPositions());
		
		return positions;
	}

	init(): void {

	}

	/* Write everything to memory after roomPlanner is closed */
	finalize(): void {
		if (this.barrierPositions.length == 0) {
			if (this.roomPlanner.bunkerPos) {
				this.barrierPositions = this.computeBunkerBarrierPositions(this.roomPlanner.bunkerPos,
										   this.colony.controller.pos,);
			} else if (this.roomPlanner.storagePos && this.roomPlanner.hatcheryPos) {
				this.barrierPositions = this.computeBarrierPositions(this.roomPlanner.hatcheryPos,
										 this.roomPlanner.storagePos,
										 this.colony.controller.pos);
			} else {
				log.error(`${this.colony.print} BARRIER PLANNER: couldn't generate barrier plan!`);
				return;
			}
		}
		// Include any tunnel tiles before saving so they're persisted
		this.protectTunnels();
		this.memory.barrierCoordsPacked = packCoordList(this.barrierPositions);
	}
	/* Quick lookup for if a barrier should be in this position. Barriers returning false won't be maintained. */
	barrierShouldBeHere(pos: RoomPosition): boolean {
		// Once you are high level, only maintain ramparts at bunker or controller
		if (this.colony.layout == 'bunker' && this.colony.level >= BarrierPlanner.settings.bunkerizeRCL) {
			return insideBunkerBounds(pos, this.colony) || pos.getRangeTo(this.colony.controller) == 1;
		}
		// Otherwise look up from memory
		if (this._barrierLookup == undefined) {
			this._barrierLookup = _.memoize((p: RoomPosition) =>
												this.memory.barrierCoordsPacked.includes(packCoord(p)));
		}
		return this._barrierLookup(pos);
	}

	/* Create construction sites for any buildings that need to be built */
	private buildMissingRamparts(): void {
		// Max buildings that can be placed each tick
		let count = RoomPlanner.settings.maxSitesPerColony - this.colony.constructionSites.length;

		// Build missing ramparts
		const barrierPositions = unpackCoordListAsPosList(this.memory.barrierCoordsPacked, this.colony.room.name);

		// Add critical structures to barrier lookup
		const criticalStructures: Structure[] = _.compact([...this.colony.towers,
														   ...this.colony.spawns,
														   this.colony.storage!,
														   this.colony.terminal!]);
		for (const structure of criticalStructures) {
			barrierPositions.push(structure.pos);
		}

		for (const pos of barrierPositions) {
			if (count > 0 && RoomPlanner.canBuild(STRUCTURE_RAMPART, pos) && this.barrierShouldBeHere(pos)) {
				const ret = pos.createConstructionSite(STRUCTURE_RAMPART);
				if (ret != OK) {
					log.warning(`${this.colony.name}: couldn't create rampart site at ${pos.print}. Result: ${ret}`);
				} else {
					count--;
				}
			}
		}
	}

	private buildMissingBunkerRamparts(): void {
		if (!this.roomPlanner.bunkerPos) return;
		const bunkerCoords = getAllStructureCoordsFromLayout(bunkerLayout, this.colony.level);
		bunkerCoords.push(bunkerLayout.data.anchor); // add center bunker tile
		let bunkerPositions = _.map(bunkerCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
		bunkerPositions = translatePositions(bunkerPositions, bunkerLayout.data.anchor, this.roomPlanner.bunkerPos);
		let count = RoomPlanner.settings.maxSitesPerColony - this.colony.constructionSites.length;
		for (const pos of bunkerPositions) {
			if (count > 0 && !pos.lookForStructure(STRUCTURE_RAMPART)
				&& pos.lookFor(LOOK_CONSTRUCTION_SITES).length == 0) {
				const ret = pos.createConstructionSite(STRUCTURE_RAMPART);
				if (ret != OK) {
					log.warning(`${this.colony.name}: couldn't create bunker rampart at ${pos.print}. Result: ${ret}`);
				} else {
					count--;
				}
			}
		}
	}
	private getTunnelPositions(): RoomPosition[] {
		// Get adjacent open spaces around tunnels (roads through walls) to protect them with ramparts
		const barrierPositions: RoomPosition[] = [];
		const roadPlanner = this.roomPlanner.roadPlanner;
		if (!roadPlanner) return barrierPositions;
		const roomName = this.colony.room.name;
		const packed = (roadPlanner as any).memory.roadCoordsPacked;
		if (!packed || !packed[roomName]) return barrierPositions;
		const terrain = Game.map.getRoomTerrain(roomName);
		const positions = roadPlanner.getRoadPositions(roomName);
		
		for (const pos of positions) {
			// A tunnel is represented by a road coordinate on wall terrain
			if (terrain.get(pos.x, pos.y) == TERRAIN_MASK_WALL) {
				// Add all adjacent non-wall positions around this tunnel
				for (let dx = -1; dx <= 1; dx++) {
					for (let dy = -1; dy <= 1; dy++) {
						if (dx === 0 && dy === 0) continue; // Skip the tunnel itself
						const x = pos.x + dx;
						const y = pos.y + dy;
						if (x < 0 || x > 49 || y < 0 || y > 49) continue; // Skip out of bounds
						
						// Only add positions that are not walls
						if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
							const adjacentPos = new RoomPosition(x, y, roomName);
							// Avoid duplicates
							if (!barrierPositions.some(p => p.isEqualTo(adjacentPos))) {
								barrierPositions.push(adjacentPos);
							}
						}
					}
				}
			}
		}
		return barrierPositions;
	}

	private protectTunnels(): void {
		// Add tunnel positions to the current barrier positions array
		const tunnels = this.getTunnelPositions();
		for (const pos of tunnels) {
			if (!this.barrierPositions.some(p => p.isEqualTo(pos))) {
				this.barrierPositions.push(pos);
			}
		}
	}
	private recomputeBarrierPositions(): void {
		this.barrierPositions = [];
		if (this.roomPlanner.bunkerPos) {
			this.barrierPositions = this.computeBunkerBarrierPositions(
				this.roomPlanner.bunkerPos,
				this.colony.controller.pos,
			);
		} else if (this.roomPlanner.storagePos && this.roomPlanner.hatcheryPos) {
			this.barrierPositions = this.computeBarrierPositions(
				this.roomPlanner.hatcheryPos,
				this.roomPlanner.storagePos,
				this.colony.controller.pos,
			);
		}

		// Include any tunnel tiles from the road planner into barriers for protection
		this.protectTunnels();

		this.memory.barrierCoordsPacked = packCoordList(this.barrierPositions);
	}

	run(): void {
		if (this.roomPlanner.active) {
			this.recomputeBarrierPositions();
			this.visuals();
			return;
		}

		if (this.roomPlanner.bunkerPos && this.roomPlanner.shouldRecheck(3)) {
			this.recomputeBarrierPositions();
		}

		if (!this.roomPlanner.memory.relocating && this.colony.level >= BarrierPlanner.settings.buildBarriersAtRCL
			&& this.roomPlanner.shouldRecheck(2)) {
			this.buildMissingRamparts();
			if (this.colony.layout == 'bunker' && this.colony.level >= 7) {
				this.buildMissingBunkerRamparts();
			}
		}
	}

	visuals(): void {
		for (const pos of this.barrierPositions) {
			this.colony.room.visual.structure(pos.x, pos.y, STRUCTURE_RAMPART);
		}
	}

}
