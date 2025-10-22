import {DirectiveClearRoom} from './colony/clearRoom';
import {DirectiveColonize} from './colony/colonize';
import {DirectiveColonizeShard} from './colony/colonize_shard';
import {DirectiveIncubate} from './colony/incubate';
import {DirectiveOutpost} from './colony/outpost';
import {DirectiveSKOutpost} from './colony/outpostSK';
import {DirectivePoisonRoom} from './colony/poisonRoom';
import {DirectiveGuard} from './defense/guard';
import {DirectiveInvasionDefense} from './defense/invasionDefense';
import {DirectiveOutpostDefense} from './defense/outpostDefense';
import {Directive} from './Directive';
import {DirectiveDrop} from './logistics/drop';
import {DirectiveControllerAttack} from './offense/controllerAttack';
import {DirectiveHarass} from './offense/harass';
import {DirectivePairDestroy} from './offense/pairDestroy';
import {DirectiveSwarmDestroy} from './offense/swarmDestroy';
import {DirectiveBaseOperator} from './powerCreeps/baseOperator';
import {DirectiveExtract} from './resource/extract';
import {DirectiveHarvest} from './resource/harvest';
import {DirectiveHaul} from './resource/haul';
import {DirectivePowerMine} from './resource/powerMine';
import {DirectiveRPBunker} from './roomPlanner/roomPlanner_bunker';
import {DirectiveRPCommandCenter} from './roomPlanner/roomPlanner_commandCenter';
import {DirectiveRPHatchery} from './roomPlanner/roomPlanner_hatchery';
import {DirectiveBootstrap} from './situational/bootstrap';
import {DirectiveNukeResponse} from './situational/nukeResponse';
import {DirectiveNukeTarget} from './situational/nukeTarget';
import {DirectivePortalScout} from './situational/portalScout';
import {DirectiveRemoteUpgrade} from './situational/remoteUpgrade';
import {DirectiveStronghold} from './situational/stronghold';
import {DirectiveDismantle} from './targeting/dismantle';
import {DirectiveModularDismantle} from './targeting/modularDismantle';
import {DirectiveTargetSiege} from './targeting/siegeTarget';
import {DirectiveTerminalEvacuateState} from './terminalState/terminalState_evacuate';
import {DirectiveTerminalRebuildState} from './terminalState/terminalState_rebuild';

// A class containing static references to all directive constructors
// Note: Using PascalCase for the class name to follow TS conventions
export class Directives {
	static DirectiveClearRoom = DirectiveClearRoom;
	static DirectiveColonize = DirectiveColonize;
	static DirectiveColonizeShard = DirectiveColonizeShard;
	static DirectiveIncubate = DirectiveIncubate;
	static DirectiveOutpost = DirectiveOutpost;
	static DirectiveSKOutpost = DirectiveSKOutpost;
	static DirectivePoisonRoom = DirectivePoisonRoom;
	static DirectiveGuard = DirectiveGuard;
	static DirectiveInvasionDefense = DirectiveInvasionDefense;
	static DirectiveOutpostDefense = DirectiveOutpostDefense;
	static DirectiveDrop = DirectiveDrop;
	static DirectiveControllerAttack = DirectiveControllerAttack;
	static DirectiveHarass = DirectiveHarass;
	static DirectivePairDestroy = DirectivePairDestroy;
	static DirectiveSwarmDestroy = DirectiveSwarmDestroy;
	static DirectiveBaseOperator = DirectiveBaseOperator;
	static DirectiveExtract = DirectiveExtract;
	static DirectiveHarvest = DirectiveHarvest;
	static DirectiveHaul = DirectiveHaul;
	static DirectivePowerMine = DirectivePowerMine;
	static DirectiveRPBunker = DirectiveRPBunker;
	static DirectiveRPCommandCenter = DirectiveRPCommandCenter;
	static DirectiveRPHatchery = DirectiveRPHatchery;
	static DirectiveBootstrap = DirectiveBootstrap;
	static DirectiveNukeResponse = DirectiveNukeResponse;
	static DirectiveNukeTarget = DirectiveNukeTarget;
	static DirectivePortalScout = DirectivePortalScout;
	static DirectiveRemoteUpgrade = DirectiveRemoteUpgrade;
	static DirectiveStronghold = DirectiveStronghold;
	static DirectiveDismantle = DirectiveDismantle;
	static DirectiveModularDismantle = DirectiveModularDismantle;
	static DirectiveTargetSiege = DirectiveTargetSiege;
	static DirectiveTerminalEvacuateState = DirectiveTerminalEvacuateState;
	static DirectiveTerminalRebuildState = DirectiveTerminalRebuildState;
	// Base Directive class (included for completeness)
	static Directive = Directive;

	// Optional: a convenient iterable map
	static all = Object.freeze({
		DirectiveClearRoom: Directives.DirectiveClearRoom,
		DirectiveColonize: Directives.DirectiveColonize,
		DirectiveColonizeShard: Directives.DirectiveColonizeShard,
		DirectiveIncubate: Directives.DirectiveIncubate,
		DirectiveOutpost: Directives.DirectiveOutpost,
		DirectiveSKOutpost: Directives.DirectiveSKOutpost,
		DirectivePoisonRoom: Directives.DirectivePoisonRoom,
		DirectiveGuard: Directives.DirectiveGuard,
		DirectiveInvasionDefense: Directives.DirectiveInvasionDefense,
		DirectiveOutpostDefense: Directives.DirectiveOutpostDefense,
		DirectiveDrop: Directives.DirectiveDrop,
		DirectiveControllerAttack: Directives.DirectiveControllerAttack,
		DirectiveHarass: Directives.DirectiveHarass,
		DirectivePairDestroy: Directives.DirectivePairDestroy,
		DirectiveSwarmDestroy: Directives.DirectiveSwarmDestroy,
		DirectiveBaseOperator: Directives.DirectiveBaseOperator,
		DirectiveExtract: Directives.DirectiveExtract,
		DirectiveHarvest: Directives.DirectiveHarvest,
		DirectiveHaul: Directives.DirectiveHaul,
		DirectivePowerMine: Directives.DirectivePowerMine,
		DirectiveRPBunker: Directives.DirectiveRPBunker,
		DirectiveRPCommandCenter: Directives.DirectiveRPCommandCenter,
		DirectiveRPHatchery: Directives.DirectiveRPHatchery,
		DirectiveBootstrap: Directives.DirectiveBootstrap,
		DirectiveNukeResponse: Directives.DirectiveNukeResponse,
		DirectiveNukeTarget: Directives.DirectiveNukeTarget,
		DirectivePortalScout: Directives.DirectivePortalScout,
		DirectiveRemoteUpgrade: Directives.DirectiveRemoteUpgrade,
		DirectiveStronghold: Directives.DirectiveStronghold,
		DirectiveDismantle: Directives.DirectiveDismantle,
		DirectiveModularDismantle: Directives.DirectiveModularDismantle,
		DirectiveTargetSiege: Directives.DirectiveTargetSiege,
		DirectiveTerminalEvacuateState: Directives.DirectiveTerminalEvacuateState,
		DirectiveTerminalRebuildState: Directives.DirectiveTerminalRebuildState,
		Directive: Directives.Directive,
	});
}

export type DirectivesMap = typeof Directives.all;

