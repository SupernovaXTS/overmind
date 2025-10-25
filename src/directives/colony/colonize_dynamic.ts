import { DirectiveOutpostDefense } from 'directives/defense/outpostDefense';
import { DirectiveControllerAttack } from 'directives/offense/controllerAttack';
import { DirectivePairDestroy } from 'directives/offense/pairDestroy';
import { RoomIntel } from 'intel/RoomIntel';
import {Colony} from '../../Colony';
import {log} from '../../console/log';
import {Roles} from '../../creepSetups/setups';
import {ClaimingOverlord} from '../../overlords/colonization/claimer';
import {PioneerOverlord} from '../../overlords/colonization/pioneer';
import {profile} from '../../profiler/decorator';
import {Cartographer, ROOMTYPE_CONTROLLER} from '../../utilities/Cartographer';
import {printRoomName} from '../../utilities/utils';
import {MY_USERNAME} from '../../~settings';
import {Directive} from '../Directive';
import {DirectiveRPEvolutionChamber} from '../roomPlanner/roomPlanner_evolutionChamber';

/**
 * Claims a new room with dynamic room planning enabled. 
 * Automatically places an evolution chamber flag to trigger DynamicPlanner usage.
 * Builds a spawn but does not incubate. Removes when spawn is constructed.
 */
@profile
export class DirectiveColonizeDynamic extends Directive {

	static directiveName = 'colonizeDynamic';
	static color = COLOR_PURPLE;
	static secondaryColor = COLOR_CYAN;

	static requiredRCL = 3;
	type = 'default';
	toColonize: Colony | undefined;
	overlords: {
		claim: ClaimingOverlord;
		pioneer: PioneerOverlord;
	};

	constructor(flag: Flag) {
		flag.memory.allowPortals = true;
		
		super(flag, colony => colony.level >= DirectiveColonizeDynamic.requiredRCL
							  && colony.name != Directive.getPos(flag).roomName && colony.spawns.length > 0);
		// Register incubation status
		this.toColonize = this.room ? Overmind.colonies[Overmind.colonyMap[this.room.name]] : undefined;
		
		// Remove if misplaced
		if (this.room && !!this.room.owner && this.room.owner != MY_USERNAME) {
			log.notify(`Removing ColonizeDynamic directive in ${this.pos.roomName}: room already owned by another player.`);
			const scan = true;
			if (scan) {
				const intel = RoomIntel.getAllRoomObjectInfo(this.room.name);
				const spawns = intel?.importantStructures?.spawnPositions;
				const towers = intel?.importantStructures?.towerPositions;
				const controller = intel?.controller;
				const safemode = intel?.controller?.safemode;
				const safemodeActive = (safemode && safemode > 0);
				const spawnP = (spawns?.length && spawns?.length <= 0);
				const towerP = (towers?.length && towers?.length <= 0);
				const viableRoom = (spawnP && towerP && !safemode);
				if (viableRoom && (this.room.controller)) {
					DirectiveControllerAttack.createIfNotPresent(this.room.controller.pos, 'room');
				}
				// if room is occupied outpost defense
				if ((this.room.controller) && this.room.playerHostiles.length > 0) {
					DirectiveOutpostDefense.createIfNotPresent(this.room.controller.pos, 'room');
				}
				
				// Unsure if this is needed?
				if ((this.room.controller) && this.room.dangerousPlayerHostiles.length > 0) {
					DirectivePairDestroy.createIfNotPresent(this.room.controller.pos,'room');
				}
			}
			this.remove(true);
		}
		if (Cartographer.roomType(this.pos.roomName) != ROOMTYPE_CONTROLLER) {
			log.warning(`${this.print}: ${printRoomName(this.pos.roomName)} is not a controller room; ` +
						`removing directive!`);
			this.remove(true);
			return;
		}
		
		// Automatically place evolution chamber flag if not already present
		if (this.room?.controller?.my) {
			this.placeEvolutionChamberFlag();
		}
	}

	/**
	 * Automatically place an evolution chamber flag in the room to enable dynamic planning
	 */
	private placeEvolutionChamberFlag(): void {
		if (!this.room) return;
		
		// Check if evolution chamber flag already exists in this room
		const existingEvoChamberFlags = _.filter(
			Game.flags,
			flag => flag.pos.roomName === this.pos.roomName &&
					flag.color === DirectiveRPEvolutionChamber.color &&
					flag.secondaryColor === DirectiveRPEvolutionChamber.secondaryColor
		);
		
		if (existingEvoChamberFlags.length > 0) {
			// Evolution chamber flag already exists, no need to create another
			return;
		}
		
		// Find a suitable position for the evolution chamber
		// Ideally near the center but away from controller/sources
		const controller = this.room.controller;
		const sources = this.room.sources;
		
		if (!controller) return;
		
		// Try to find a position that's:
		// - Not too close to sources (>= 5 tiles)
		// - Not too close to controller (>= 8 tiles)
		// - Not on terrain walls
		// - Reasonably central
		const centerPos = new RoomPosition(25, 25, this.room.name);
		let bestPos: RoomPosition | undefined;
		let bestScore = -Infinity;
		
		// Search in a spiral pattern from center
		for (let radius = 5; radius <= 15; radius++) {
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					// Only check positions on the current radius
					if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
					
					const x = 25 + dx;
					const y = 25 + dy;
					
					if (x < 5 || x > 45 || y < 5 || y > 45) continue;
					
					const pos = new RoomPosition(x, y, this.room.name);
					const terrain = pos.lookFor(LOOK_TERRAIN)[0];
					
					if (terrain === 'wall') continue;
					
					// Check distances
					const controllerDist = pos.getRangeTo(controller);
					const minSourceDist = Math.min(...sources.map(s => pos.getRangeTo(s)));
					
					if (controllerDist < 8 || minSourceDist < 5) continue;
					
					// Score: prefer positions closer to center, but not too close to edges
					const distToCenter = pos.getRangeTo(centerPos);
					const score = -distToCenter;
					
					if (score > bestScore) {
						bestScore = score;
						bestPos = pos;
					}
				}
			}
			
			// If we found a good position, stop searching
			if (bestPos) break;
		}
		
		// Create the evolution chamber flag
		if (bestPos) {
			const flagName = `evolutionChamber_${this.pos.roomName}_${Game.time}`;
			const result = bestPos.createFlag(flagName, DirectiveRPEvolutionChamber.color, DirectiveRPEvolutionChamber.secondaryColor);
			
			if (typeof result === 'string') {
				log.info(`Created evolution chamber flag at ${bestPos.print} for dynamic colony ${this.pos.roomName}`);
			} else {
				log.warning(`Failed to create evolution chamber flag: ${result}`);
			}
		} else {
			log.warning(`Could not find suitable position for evolution chamber in ${this.pos.roomName}`);
		}
	}

	spawnMoarOverlords() {
		this.overlords.claim = new ClaimingOverlord(this);
		this.overlords.pioneer = new PioneerOverlord(this);
	}

	init() {
		this.alert(`Dynamic colonization in progress`);
	}

	run(verbose = false) {
		if (this.room?.controller?.my) {
			this.placeEvolutionChamberFlag();
		}
        if (this.toColonize && this.toColonize.spawns.length > 0) {
			// Reassign all pioneers to be miners and workers
			const miningOverlords = _.map(this.toColonize.miningSites, site => site.overlords.mine);
			
			// Check if pioneer overlord exists before accessing pioneers
			if (this.overlords.pioneer) {
				for (const pioneer of this.overlords.pioneer.pioneers) {
					const miningOverlord = miningOverlords.shift();
					if (miningOverlord) {
						if (verbose) {
							log.debug(`Reassigning: ${pioneer.print} to mine: ${miningOverlord.print}`);
						}
						pioneer.reassign(miningOverlord, Roles.drone);
					} else {
						if (verbose) {
							log.debug(`Reassigning: ${pioneer.print} to work: ${this.toColonize.overlords.work.print}`);
						}
						pioneer.reassign(this.toColonize.overlords.work, Roles.worker);
					}
				}
			}
			// Remove the directive
			this.remove();
		}
		if (Game.time % 10 == 2 && (this.room && !!this.room.owner && this.room.owner != MY_USERNAME)) {
			log.notify(`Removing ColonizeDynamic directive in ${this.pos.roomName}: room already owned by another player.`);
			this.remove();
		}
	}
}
