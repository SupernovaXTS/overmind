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
import {DirectiveRPDynamicBunker} from '../roomPlanner/roomPlanner_dynamicBunker';
import {BasePlanner} from '../../roomPlanner/BasePlanner';
import {DynamicPlanner, canBuildDynamicBunker} from '../../roomPlanner/DynamicPlanner';

/**
 * Claims a new room with dynamic room planning enabled. 
 * Automatically places a dynamic bunker core flag at the bunker anchor position.
 * The evolution chamber must be placed separately away from the bunker.
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
	}

	/**
	 * Automatically place dynamic bunker core and evolution chamber flags in optimal positions
	 * Only uses dynamic layout if a normal bunker cannot fit - prefers normal bunkers
	 * Uses BasePlanner to find the best bunker location and DynamicPlanner to validate evolution chamber placement
	 * Only places flags when we own the room (controller is ours)
	 */
	private placeDynamicBunkerFlags(): void {
		if (!this.room) return;
		
		// Only place dynamic bunker if we own the room
		if (!this.room.controller || !this.room.controller.my) {
			return;
		}
		
		// Check if dynamic bunker flag already exists in this room
		const existingBunkerFlags = _.filter(
			Game.flags,
			flag => flag.pos.roomName === this.pos.roomName &&
					flag.color === DirectiveRPDynamicBunker.color &&
					flag.secondaryColor === DirectiveRPDynamicBunker.secondaryColor
		);
		
		if (existingBunkerFlags.length > 0) {
			// Dynamic bunker flag already exists, no need to create another
			return;
		}
		
		// Use BasePlanner to find optimal bunker location
		const bunkerLocation = BasePlanner.getBunkerLocation(this.room, false);
		if (!bunkerLocation) {
			log.warning(`Could not find suitable bunker location in ${this.pos.roomName}`);
			return;
		}
		
		// Check if a normal (non-dynamic) bunker can fit
		const canFitNormalBunker = BasePlanner.canFitNormalBunker(this.room, bunkerLocation);
		
		if (canFitNormalBunker) {
			// Normal bunker fits perfectly - use standard bunker planning instead
			log.info(`${this.pos.roomName} can fit a normal bunker - dynamic planning not needed. Use standard colonize directive instead.`);
			return;
		}
		
		// Normal bunker doesn't fit - check if dynamic bunker is viable
		const evolutionChamberPos = canBuildDynamicBunker(this.room, bunkerLocation);
		if (!evolutionChamberPos) {
			log.warning(`Could not find suitable evolution chamber position in ${this.pos.roomName} - room may not be suitable for dynamic bunker`);
			return;
		}
		
		// Create the dynamic bunker core flag
		const bunkerFlagName = `dynamicBunker_${this.pos.roomName}_${Game.time}`;
		const bunkerResult = bunkerLocation.createFlag(bunkerFlagName, DirectiveRPDynamicBunker.color, DirectiveRPDynamicBunker.secondaryColor);
		
		if (typeof bunkerResult === 'string') {
			log.info(`Created dynamic bunker core flag at ${bunkerLocation.print} for dynamic colony ${this.pos.roomName} (normal bunker doesn't fit)`);
			
			// Save evolution chamber position to colony memory if colony exists
			if (this.toColonize && this.toColonize.roomPlanner) {
				this.toColonize.roomPlanner.memory.bunkerData = {
					anchor: bunkerLocation,
					evolutionChamber: evolutionChamberPos,
				};
				log.info(`Saved evolution chamber position ${evolutionChamberPos.print} to colony memory for ${this.pos.roomName}`);
			}
		} else {
			log.warning(`Failed to create dynamic bunker core flag: ${bunkerResult}`);
			return;
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
		// Periodically check if we own the room and place dynamic bunker flags
		if (Game.time % 10 == 0) {
			this.placeDynamicBunkerFlags();
		}
		
		// Only remove directive if we actually have a colony with a spawn built in this specific room
		if (this.toColonize && this.toColonize.room.name === this.pos.roomName && this.toColonize.spawns.length > 0) {
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
			log.info(`Removing DirectiveColonizeDynamic in ${this.pos.roomName}: spawn construction complete`);
			this.remove();
		}
		if (Game.time % 10 == 2 && (this.room && !!this.room.owner && this.room.owner != MY_USERNAME)) {
			log.notify(`Removing ColonizeDynamic directive in ${this.pos.roomName}: room already owned by another player.`);
			this.remove();
		}
	}
}
