import { ReservingOverlord } from "overlords/colonization/reserver";
import { Colony, ColonyMemory, getAllColonies, isColony } from "../Colony";
import { Directive } from "../directives/Directive";
import {
	PortalInfo,
	ROOMINTEL_DEFAULT_VISUALS_RANGE,
	} from "../intel/RoomIntel";
import { RoomIntel } from "../intel/RoomIntel";
import {progress as statsProgress} from '../utilities/statistics';
import { Overlord } from "../overlords/Overlord";
import { ExpansionEvaluator } from "../strategy/ExpansionEvaluator";
import { Cartographer } from "../utilities/Cartographer";
import { EmpireAnalysis } from "../utilities/EmpireAnalysis";
import { alignedNewline, bullet } from "../utilities/stringConstants";
import { color, dump, maxBy, toColumns } from "../utilities/utils";
import { asciiLogoRL, asciiLogoSmall } from "../visuals/logos";
import { log } from "./log";
import { DirectiveOutpost } from "directives/colony/outpost";
import { Tasks } from "tasks/Tasks";
import columnify from "columnify";
import { Zerg } from "zerg/Zerg";
import { RESOURCE_IMPORTANCE } from "resources/map_resources";
import { config } from "../config";
import { DEFAULT_OVERMIND_SIGNATURE } from "~settings";
import { TerminalNetworkV2 } from "logistics/TerminalNetwork_v2";
type RecursiveObject = { [key: string]: number | RecursiveObject };

interface MemoryDebug {
	debug?: boolean;
}

interface ConsoleCommand {
	name: string;
	description: string;
	command: (...args: any[]) => any;
}

type ResourceTallyState = "!" | "-" | "~" | "+";
type ResourceTally = {
	resource: ResourceConstant;
	total: number;
	[colonyThreshold: `S-${string}`]: ResourceTallyState;
	[colonyTotal: `T-${string}`]: number;
};

/**
 * OvermindConsole registers a number of global methods for direct use in the Screeps console
 */
export class OvermindConsole {
	static refresh(): void {
		// Auto-update global.c to the room the player is currently viewing (if it's a colony)
		if (Game.rooms) {
			// Get the first owned room visible (player is likely looking at it)
			const visibleColonies = _.filter(_.values(Game.rooms),
				(room: Room) => room.my && Overmind.colonies[room.name]);
			if (visibleColonies.length > 0) {
				// If we don't have a current colony set, or if player switched rooms, update it
				const firstColony = Overmind.colonies[(visibleColonies[0] as Room).name];
				if (!global.c || (global.c.name !== firstColony.name)) {
					global.c = firstColony;
				}
			}
		}
	}

	static commands: ConsoleCommand[] = [
		{
			name: "help",
			description: "show this message",
			command: () => OvermindConsole.help()
		},
		{
			name: "info()",
			description: "display version and operation information",
			command: () => OvermindConsole.info()
		},
		{
			name: "setSignature(newSignature)",
			description:
				"set your controller signature; no argument sets to default",
			command: OvermindConsole.setSignature.bind(OvermindConsole),
		},
		{
			name: "print(...args[])",
			description: "log stringified objects to the console",
			command: OvermindConsole.print.bind(OvermindConsole),
		},
		{
			name: "debug(thing | ...things)",
			description: "enable debug logging for a game object or process",
			command: OvermindConsole.debug.bind(OvermindConsole),
		},
		{
			name: "stopDebug(thing | ...things)",
			description: "disable debug logging for a game object or process",
			command: OvermindConsole.debug.bind(OvermindConsole),
		},
		{
			name: "timeit(function, repeat=1)",
			description: "time the execution of a snippet of code",
			command: OvermindConsole.timeit.bind(OvermindConsole),
		},
		{
			name: "profileOverlord(overlord, ticks?)",
			description: "start profiling on an overlord instance or name",
			command: OvermindConsole.profileOverlord.bind(OvermindConsole),
		},
		{
			name: "finishProfilingOverlord(overlord)",
			description: "stop profiling on an overlord",
			command:
				OvermindConsole.finishProfilingOverlord.bind(OvermindConsole),
		},
		{
			name: "setLogLevel(int)",
			description: "set the logging level from 0 - 4",
			command: log.setLevel.bind(OvermindConsole),
		},
		{
			name: "suspendColony(roomName)",
			description: "Prints all suspended colonies",
			command: OvermindConsole.listSuspendedColonies.bind(OvermindConsole)
		},
		{
			name: "setSignature",
			description: "Set the controller signature for all colonies.",
			command: (signature: string | undefined) => OvermindConsole.setSignature(signature),
		},
		{
			name: "print",
			description: "Print a message to the console.",
			command: (...args: any[]) => OvermindConsole.print(...args),
		},
		{
			name: "debug",
			description: "Enable debug mode for a colony or overlord.",
			command: (...args: any[]) => OvermindConsole.debug(...args),
		},
		{
			name: "debugOverlord",
			description: "Enable debug mode for an overlord.",
			command: (...args: any[]) => OvermindConsole.debug(...args),
		},
		{
			name: "timeit",
			description: "Time a function execution.",
			command: (callback: () => any, repeat = 1) => OvermindConsole.timeit(callback, repeat),
		},
		{
			name: "profileOverlord",
			description: "Profile an overlord for a number of ticks.",
			command: (overlord: Overlord | string, ticks?: number) => OvermindConsole.profileOverlord(overlord, ticks),
		},
		{
			name: "finishProfilingOverlord",
			description: "Finish profiling an overlord.",
			command: (overlord: Overlord | string) => OvermindConsole.finishProfilingOverlord(overlord),
		},
		{
			name: "listSuspendedColonies",
			description: "List all suspended colonies.",
			command: () => OvermindConsole.listSuspendedColonies(),
		},
		{
			name: "openRoomPlanner",
			description: "Open the room planner for a room.",
			command: (roomName: string) => OvermindConsole.openRoomPlanner(roomName),
		},
		{
			name: "closeRoomPlanner",
			description: "Close the room planner for a room.",
			command: (roomName: string) => OvermindConsole.closeRoomPlanner(roomName),
		},
		{
			name: "cancelRoomPlanner",
			description: "Cancel the room planner for a room.",
			command: (roomName: string) => OvermindConsole.cancelRoomPlanner(roomName),
		},
		{
			name: "listActiveRoomPlanners()",
			description: "display a list of colonies with open room planners",
			command:
				OvermindConsole.listActiveRoomPlanners.bind(OvermindConsole),
		},
		{
			name: "destroyErrantStructures(roomName)",
			description:
				"destroys all misplaced structures within an owned room",
			command:
				OvermindConsole.destroyErrantStructures.bind(OvermindConsole),
		},
		{
			name: "destroyAllHostileStructures(roomName)",
			description: "destroys all hostile structures in an owned room",
			command:
				OvermindConsole.destroyAllHostileStructures.bind(
					OvermindConsole
				),
		},
		{
			name: "destroyAllBarriers(roomName)",
			description: "destroys all ramparts and barriers in a room",
			command: OvermindConsole.destroyAllBarriers.bind(OvermindConsole),
		},
		{
			name: "listConstructionSites(filter?)",
			description:
				"list all construction sites matching an optional filter",
			command:
				OvermindConsole.listConstructionSites.bind(OvermindConsole),
		},
		{
			name: "removeUnbuiltConstructionSites()",
			description: "removes all construction sites with 0 progress",
			command:
				OvermindConsole.removeUnbuiltConstructionSites.bind(
					OvermindConsole
				),
		},
		{
			name: "listDirectives(filter?)",
			description: "list directives, matching a filter if specified",
			command: OvermindConsole.listDirectives.bind(OvermindConsole),
		},
		{
			name: "listPersistentDirectives",
			description: "List all persistent directives.",
			command: () => OvermindConsole.listPersistentDirectives(),
		},
		{
			name: "removeFlagsByColor(color, secondaryColor)",
			description: "remove flags that match the specified colors",
			command: OvermindConsole.removeFlagsByColor.bind(OvermindConsole),
		},
		{
			name: "removeErrantFlags()",
			description: "remove all flags which don't match a directive",
			command: OvermindConsole.removeErrantFlags.bind(OvermindConsole),
		},
		{
			name: "deepCleanMemory()",
			description:
				"deletes all non-critical portions of memory (be careful!)",
			command: OvermindConsole.deepCleanMemory.bind(OvermindConsole),
		},
		{
			name: "profileMemory(root=Memory, depth=1)",
			description:
				"scan through memory to get the size of various objects",
			command: OvermindConsole.profileMemory.bind(OvermindConsole),
		},
		{
			name: "startRemoteDebugSession()",
			description:
				"enables the remote debugger so Muon can debug your code",
			command:
				OvermindConsole.startRemoteDebugSession.bind(OvermindConsole),
		},
		{
			name: "cancelMarketOrders(filter?)",
			description:
				"cancels all market orders matching filter (if provided)",
			command: OvermindConsole.cancelMarketOrders.bind(OvermindConsole),
		},
		{
			name: "setRoomUpgradeRate(Colony|string, upgradeRate?)",
			description:
				"changes the rate which a room upgrades at, default is 1. Pass no rate to get the current value",
			command: OvermindConsole.setRoomUpgradeRate.bind(OvermindConsole),
		},
		{
			name: "getEmpireMineralDistribution()",
			description:
				"returns current census of colonies and mined sk room minerals",
			command:
				OvermindConsole.getEmpireMineralDistribution.bind(
					OvermindConsole
				),
		},
		{
			name: "evaluateOutpostEfficiencies()",
			description: "prints all colony outposts efficiency",
			command:
				OvermindConsole.evaluateOutpostEfficiencies.bind(
					OvermindConsole
				),
		},
		{
			name: "evaluatePotentialOutpostEfficiencies()",
			description: "prints all nearby unmined outposts",
			command:
				OvermindConsole.evaluatePotentialOutpostEfficiencies.bind(
					OvermindConsole
				),
		},
		{
			name: "showRoomSafety(roomName?)",
			description: "show gathered safety data about rooms",
			command: OvermindConsole.showRoomSafety.bind(OvermindConsole),
		},
		{
			name: "spawnSummary(Colony | string)",
			description: "show all ongoing spawn requests",
			command: OvermindConsole.spawnSummary.bind(OvermindConsole),
		},
		{
			name: "idleCreeps(Colony | string)",
			description: "show all idle creeps",
			command: OvermindConsole.idleCreeps.bind(OvermindConsole),
		},
		{
			name: "visuals()",
			description: "enable/disable showing visuals",
			command: OvermindConsole.visuals.bind(OvermindConsole),
		},
		{
			name: "showIntelVisuals(ticks?, range?)",
			description:
				"show intel in range using visuals (ticks defaults to 100)",
			command: OvermindConsole.showIntelVisuals.bind(OvermindConsole),
		},
		{
			name: "showAssets()",
			description: "show all available resources across colonies",
			command: OvermindConsole.showAssets.bind(OvermindConsole),
		},
		{
			name: "toggleRoomActive(roomName, state?)",
			description: "activate or deactivate a given room",
			command: OvermindConsole.toggleRoomActive.bind(OvermindConsole),
		},
		{
			name: "listFactories()",
			description: "list all factories and their status",
			command: OvermindConsole.listFactories.bind(OvermindConsole),
		},
		{
			name: "resetFactories()",
			description: "reset all factories production queues",
			command: OvermindConsole.resetFactories.bind(OvermindConsole),
		},
		{
			name: 'getDirective(flagName)',
			description: 'returns the directive associated with the specified flag name',
			command: OvermindConsole.getDirective.bind(OvermindConsole),
		},
		{
			name: 'getOverlord(directive, overlordName)',
			description: 'returns the overlord associated with the directive and name',
			command: OvermindConsole.getOverlord.bind(OvermindConsole),
		},
		{
			name: 'getColony(roomName)',
			description: 'returns the colony associated with the specified room name',
			command: OvermindConsole.getColony.bind(OvermindConsole),
		},
		{
			name: 'setCurrentColony(roomName)',
			description: 'sets global.c to reference the specified colony for quick access',
			command: OvermindConsole.setCurrentColony.bind(OvermindConsole),
		},
		{
			name: 'getZerg(creepName)',
			description: 'returns the Zerg instance associated with the specified creep name',
			command: OvermindConsole.getZerg.bind(OvermindConsole),
		},
		{
			name: 'buyPixels(amount)',
			description: 'buys the specified number of pixels at the cheapest market price',
			command: OvermindConsole.buyPixels.bind(OvermindConsole),
		},
		{
			name: 'getAccountResourcesSettings()',
			description: 'displays current account resources settings',
			command: OvermindConsole.getAccountResourcesSettings.bind(OvermindConsole),
		},
		{
			name: 'setPixelSettings(options)',
			description: 'set pixel thresholds: {min, max, buyThreshold, sellThreshold}',
			command: OvermindConsole.setPixelSettings.bind(OvermindConsole),
		},
		{
			name: 'setCPUUnlockSettings(options)',
			description: 'set CPU unlock thresholds: {min, max, buyThreshold, sellThreshold}',
			command: OvermindConsole.setCPUUnlockSettings.bind(OvermindConsole),
		},
		{
			name: 'setPixelGeneration(enabled)',
			description: 'enable/disable automatic pixel generation (true/false)',
			command: OvermindConsole.setPixelGeneration.bind(OvermindConsole),
		},
		{
			name: 'setPixelTrading(enabled)',
			description: 'enable/disable automatic pixel buying/selling (true/false)',
			command: OvermindConsole.setPixelTrading.bind(OvermindConsole),
		},
		{
			name: 'setCPUUnlockTrading(enabled)',
			description: 'enable/disable automatic CPU unlock buying/selling (true/false)',
			command: OvermindConsole.setCPUUnlockTrading.bind(OvermindConsole),
		},
		{
			name: 'progress()',
			description: 'print GCL/RCL ETA overview with progress bars',
			command: OvermindConsole.progress.bind(OvermindConsole),
		},
		{
			name: 'clearRclStats(roomName)',
			description: 'clears the RCL statistics for the specified colony',
			command: OvermindConsole.clearRclStats.bind(OvermindConsole),
		},
		{
			name: 'sector.pool()',
			description: 'list intercolony pool requests (destination -> manifest)',
			command: OvermindConsole.sectorPool.bind(OvermindConsole),
		},
		{
			name: 'sector.queue(room?)',
			description: 'show SectorTransportOverlord shipment queue for a colony (default: current)',
			command: OvermindConsole.sectorQueue.bind(OvermindConsole),
		},
		{
			name: 'sector.summary()',
			description: 'show summary of pool size and queues per colony',
			command: OvermindConsole.sectorSummary.bind(OvermindConsole),
		},
		{
			name: 'sector.setBuffer(resource, amount)',
			description: 'set per-resource buffer for intercolony shipments',
			command: OvermindConsole.sectorSetBuffer.bind(OvermindConsole),
		},
		{
			name: 'sector.setDefaultBuffer(amount)',
			description: 'set default buffer for all resources (unless overridden)',
			command: OvermindConsole.sectorSetDefaultBuffer.bind(OvermindConsole),
		},
		{
			name: 'sector.setRangeLimit(limit)',
			description: 'set max room linear distance for intercolony shipments',
			command: OvermindConsole.sectorSetRangeLimit.bind(OvermindConsole),
		},
		{
			name: "buy(roomName, resourceType, amount)",
			description: "Buy a resource from the market (Game.market.deal)",
			command: OvermindConsole.buyResource.bind(OvermindConsole)
		},
		{
			name: "sell(roomName, resourceType, amount)",
			description: "Sell a resource to the market (Game.market.deal)",
			command: OvermindConsole.sellResource.bind(OvermindConsole)
		},
	];
	/**
	 * Buy a resource using TraderJoe
	 */
	static buyResource(colonyName: string, resourceType: ResourceConstant, amount: number): string {
		const colony = Overmind.colonies[colonyName];
		if (!colony) {
			return `Colony ${colonyName} not found.`;
		}
		if (!colony || !resourceType || typeof amount !== 'number' || amount <= 0) {
			return 'Usage: buyResource(colony, resourceType, amount)';
		}
		if (!colony.terminal || !colony.terminal.isReady) {
			return `Colony ${colony.name} does not have a ready terminal.`;
		}
		// Find the best terminal for trading (most energy, not on cooldown)
		const result = Overmind.tradeNetwork.buy(colony.terminal, resourceType, amount, {preferDirect: true});
		let message: string;
		switch (result) {
			case OK:
				return `Successfully bought ${amount} ${resourceType} for colony ${colony.name}.`;
			case ERR_NOT_ENOUGH_RESOURCES:
				return `Error: Not enough credits to buy ${amount} ${resourceType}.`;
			case ERR_INVALID_ARGS:
				return `Error: Invalid arguments provided for buy operation.`;
			case ERR_NOT_FOUND:
				return `Error: No suitable market orders found for ${resourceType}.`;
			case ERR_FULL:
				return `Error: Terminal cannot hold more of ${resourceType}.`;
			case ERR_NOT_OWNER:
				return `Error: You do not own the terminal in colony ${colony.name}.`;
			case ERR_INVALID_TARGET:
				return `Error: Invalid terminal target for trade.`;
			case ERR_TIRED:
				return `Error: Terminal is on cooldown.`;
			default:
				return `TraderJoe.buy result: ${result}`;
		}
	}

	/**
	 * Sell a resource using TraderJoe
	 */
	static sellResource(colonyName: string, resourceType: ResourceConstant, amount: number): string {
		const colony = Overmind.colonies[colonyName];
		if (!colony || !resourceType || typeof amount !== 'number' || amount <= 0) {
			return 'Usage: sellResource(colony, resourceType, amount)';
		}
		const terminal = colony.terminal;
		if (!terminal || !terminal.isReady || terminal.store[resourceType] < amount) {
			return `Colony ${colony.name} does not have a ready terminal with enough ${resourceType}.`;
		}
		const result = Overmind.tradeNetwork.sell(terminal, resourceType, amount, {preferDirect: true});
		switch (result) {
			case OK:
				return `Successfully sold ${amount} ${resourceType} from colony ${colony.name}.`;
			case ERR_NOT_ENOUGH_RESOURCES:
				return `Error: Not enough ${resourceType} in terminal to sell.`;
			case ERR_INVALID_ARGS:
				return `Error: Invalid arguments provided for sell operation.`;
			case ERR_NOT_FOUND:
				return `Error: No suitable market orders found for ${resourceType}.`;
			case ERR_FULL:
				return `Error: Terminal cannot send more of ${resourceType}.`;
			case ERR_NOT_OWNER:
				return `Error: You do not own the terminal in colony ${colony.name}.`;
			case ERR_INVALID_TARGET:
				return `Error: Invalid terminal target for trade.`;
			case ERR_TIRED:
				return `Error: Terminal is on cooldown.`;
			default:
				return `TraderJoe.sell result: ${result}`;
		}
	}
	static init() {
		for (const cmd of this.commands) {
			const para = cmd.name.indexOf("(");
			const funcName =
				para !== -1 ? cmd.name.substring(0, para) : cmd.name;
			global[funcName] = cmd.command;
		}
		this.generateHelp();
		global.help = this.helpMsg;
	}

	// Help, information, and operational changes ======================================================================

	static helpMsg: string;
	
	private static normalizeRoomName(input: string | Room): string {
		// If input is a Room object, use its name
		if (typeof input === 'object' && input.name) {
			return input.name;
		}
		// If input is 'c', use global.c's room name
		if (input === 'c') {
			return global.c?.name || '';
		}
		// Capitalize room name (e.g., 'e1s1' -> 'E1S1')
		return (input as string).toUpperCase();
	}

	static getColony(input: string | Room): Colony | undefined {
		const roomName = OvermindConsole.normalizeRoomName(input);
		return Overmind.colonies?.[roomName];
	}

	static setCurrentColony(input: string | Room): string {
		const roomName = OvermindConsole.normalizeRoomName(input);
		const colony = Overmind.colonies?.[roomName];
		if (!colony) {
			return `Colony ${roomName} not found!`;
		}
		global.c = colony;
		return `Current colony set to ${colony.name}`;
	}

	static getZerg(input: string): Zerg | undefined {
		return Overmind.zerg?.[input];
	}

	static getOverlord(input: Directive, name: string): Overlord | undefined {
		return input.overlords?.[name];
	}
	static help() {
		if (!this.helpMsg) {
			this.generateHelp();
		}
		console.log(this.helpMsg);
	}

	static generateHelp() {
		let msg = '\n<font color="#ff00ff">';
		for (const line of asciiLogoSmall) {
			msg += line + "\n";
		}
		msg += "</font>";

		// Console list
		const descr: { [functionName: string]: string } = {};
		for (const cmd of this.commands) {
			if (!cmd.description) {
				continue;
			}
			descr[cmd.name] = cmd.description;
		}
		const descrMsg = toColumns(descr, { justify: true, padChar: "." });
		const maxLineLength = _.max(_.map(descrMsg, (line) => line.length)) + 2;
		msg +=
			"Console Commands: ".padEnd(maxLineLength, "=") +
			"\n" +
			descrMsg.join("\n");

		msg += "\n\nRefer to the repository for more information\n";

		this.helpMsg = msg;
	}

	static printUpdateMessage(aligned = false): void {
		const joinChar = aligned ? alignedNewline : "\n";
		const msg =
			`Codebase updated or global reset. Type "help" for a list of console commands.` +
			joinChar +
			color(asciiLogoSmall.join(joinChar), "#ff00ff") +
			joinChar +
			OvermindConsole.info(aligned);
		log.warn(msg);
	}

	static printTrainingMessage(): void {
		console.log("\n" + asciiLogoRL.join("\n") + "\n");
	}

	static info(aligned = false): string {
		const b = bullet;
		const baseInfo = [
			`${b}Version:        Overmind v${__VERSION__}`,
			`${b}Operating mode: ${Memory.settings.operationMode}`,
		];
		const joinChar = aligned ? alignedNewline : "\n";
		return baseInfo.join(joinChar);
	}

	static notifications(): string {
		const notifications =
			Overmind.overseer.notifier.generateNotificationsList(true);
		return _.map(notifications, (msg) => bullet + msg).join("\n");
	}

	static setMode(mode: operationMode): void {
		if ("manual".startsWith(mode)) {
			Memory.settings.operationMode = "manual";
			console.log(
				`Operational mode set to manual. Only defensive directives will be placed automatically; ` +
					`remove harvesting, claiming, room planning, and raiding must be done manually.`
			);
		} else if ("semiautomatic".startsWith(mode)) {
			Memory.settings.operationMode = "semiautomatic";
			console.log(
				`Operational mode set to semiautomatic. Claiming, room planning, and raiding must be done manually; everything else is automatic.`
			);
		} else if ("automatic".startsWith(mode)) {
			Memory.settings.operationMode = "automatic";
			console.log(
				`Operational mode set to automatic. All actions are done automatically, but manually placed directives will still be responded to.`
			);
		} else {
			console.log(
				`Invalid mode: please specify 'manual', 'semiautomatic', or 'automatic'.`
			);
		}
	}

	static setSignature(signature: string | undefined): void {
		const sig = signature ? signature : config.DEFAULT_OVERMIND_SIGNATURE;
		if (sig.length > 100) {
			throw new Error(
				`Invalid signature: ${signature}; length is over 100 chars.`
			);
		} else if (
			!sig.toLowerCase().includes("overmind") &&
			!sig.includes(DEFAULT_OVERMIND_SIGNATURE)
		) {
			throw new Error(
				`Invalid signature: ${signature}; must contain the string "Overmind" or ` +
					`${DEFAULT_OVERMIND_SIGNATURE} (accessible on global with __DEFAULT_OVERMIND_SIGNATURE__)`
			);
		}

		Memory.settings.signature = sig;

		_.each(Overmind.colonies, (colony) => {
			const signer = _.sample(colony.getZergByRole("worker")) as Zerg | undefined;
			if (!signer) {
				log.warn(
					`${colony.print}: unable to find a random worker to re-sign the controller`
				);
				return;
			}
			signer.task = Tasks.signController(colony.controller);
		});

		_.filter(
			Overmind.directives,
			(directive) => directive instanceof DirectiveOutpost
		).forEach((directive) => {
			const overlord = <ReservingOverlord>directive.overlords.reserve;
			overlord.settings.resetSignature = true;
			if (overlord.reservers[0]) {
				overlord.reservers[0].task = null;
			}
		});
		console.log(`Controller signature set to ${sig}`);
	}

	// Debugging methods ===============================================================================================

	static debug(
		...things: {
			name?: string;
			ref?: string;
			print?: string;
			memory: MemoryDebug;
		}[]
	): void {
		let mode;
		const debugged = [];
		for (const thing of things) {
			const name = `${
				thing.print || thing.ref || thing.name || "(no name or ref)"
			}`;
			if (
				(thing.memory && thing.memory.debug && mode === undefined) ||
				mode === false
			) {
				mode = false;
				delete thing.memory.debug;
				debugged.push(name);
			} else if ((thing.memory && mode === undefined) || mode === true) {
				mode = true;
				thing.memory.debug = true;
				debugged.push(name);
			} else {
				log.info(`don't know what to do with ${thing}`);
				return;
			}
		}
		console.log(
			`${mode ? "Enabled" : "Disabled"} debugging for ${debugged.join(
				", "
			)}`
		);
	}

	static startRemoteDebugSession(): void {
		global.remoteDebugger.enable();
		console.log(`Started remote debug session.`);
	}

	static endRemoteDebugSession(): void {
		global.remoteDebugger.disable();
		console.log(`Ended remote debug session.`);
	}

	static print(...args: any[]): void {
		console.log(dump(args));
	}

	static timeit(callback: () => any, repeat = 1): void {
		const start = Game.cpu.getUsed();
		let i: number;
		for (i = 0; i < repeat; i++) {
			callback();
		}
		const used = Game.cpu.getUsed() - start;
		console.log(
			`CPU used: ${used}. Repetitions: ${repeat} (${used / repeat} each).`
		);
	}

	// Overlord profiling ==============================================================================================
	static profileOverlord(overlord: Overlord | string, ticks?: number): void {
		const overlordInstance =
			typeof overlord == "string" ?
				Overmind.overlords[overlord]
			:	(overlord as Overlord | undefined);
		if (!overlordInstance) {
			console.log(`No overlord found for ${overlord}!`);
		} else {
			overlordInstance.startProfiling(ticks);
			console.log(
				`Profiling ${overlordInstance.print} for ${
					ticks || "indefinite"
				} ticks.`
			);
		}
	}

	static finishProfilingOverlord(overlord: Overlord | string): void {
		const overlordInstance =
			typeof overlord == "string" ?
				Overmind.overlords[overlord]
			:	(overlord as Overlord | undefined);
		if (!overlordInstance) {
			console.log(`No overlord found for ${overlord}!`);
		} else {
			overlordInstance.finishProfiling();
			console.log(`Profiling ${overlordInstance.print} stopped.`);
		}
	}

	// Colony suspension ===============================================================================================

	static suspendColony(roomName: string): void {
		if (!Memory.colonies[roomName]) {
			console.log(`Colony ${roomName} is not a valid colony!`);
			return;
		}
		const colonyMemory = Memory.colonies[roomName] as
			| ColonyMemory
			| undefined;
		if (!colonyMemory) {
			console.log(`No colony memory for ${roomName}!`);
			return;
		}
		colonyMemory.suspend = true;
		Overmind.shouldBuild = true;
		console.log(`Colony ${roomName} suspended.`);
	}

	static unsuspendColony(roomName: string): void {
		if (!Memory.colonies[roomName]) {
			console.log(`Colony ${roomName} is not a valid colony!`);
			return;
		}
		const colonyMemory = Memory.colonies[roomName] as
			| ColonyMemory
			| undefined;
		if (!colonyMemory) {
			console.log(`No colony memory for ${roomName}!`);
			return;
		}
		delete colonyMemory.suspend;
		Overmind.shouldBuild = true;
		console.log(`Colony ${roomName} unsuspended.`);
	}

	static listSuspendedColonies(): Colony[] {
		const suspended = _.filter(
			Object.entries(Memory.colonies),
			([_name, mem]) => mem.suspend
		);

		let msg = "Colonies currently suspended: \n";
		for (const [name, _mem] of suspended) {
			msg += `Colony ${name}\n`;
		}
		console.log(msg);
		return suspended.map(([name, _mem]) => Overmind.colonies[name]);
	}

	// Room planner control ============================================================================================

	static openRoomPlanner(roomName: string): void {
		if (!Overmind.colonies[roomName]) {
			console.log(`Error: ${roomName} is not a valid colony!`);
			return;
		}
		if (Overmind.colonies[roomName].roomPlanner.active) {
			console.log(`RoomPlanner for ${roomName} is already active!`);
			return;
		}
		console.log(
			`Enabled RoomPlanner for ${Overmind.colonies[roomName].print}`
		);
		Overmind.colonies[roomName].roomPlanner.active = true;
	}

	static closeRoomPlanner(roomName: string): void {
		if (!Overmind.colonies[roomName]) {
			console.log(`Error: ${roomName} is not a valid colony!`);
			return;
		}
		if (!Overmind.colonies[roomName].roomPlanner.active) {
			console.log(`RoomPlanner for ${roomName} is not active!`);
			return;
		}
		console.log(
			`Closed RoomPlanner for ${Overmind.colonies[roomName].print}`
		);
		Overmind.colonies[roomName].roomPlanner.finalize();
	}

	static cancelRoomPlanner(roomName: string): void {
		if (!Overmind.colonies[roomName]) {
			console.log(`Error: ${roomName} is not a valid colony!`);
			return;
		}
		if (!Overmind.colonies[roomName].roomPlanner.active) {
			console.log(`RoomPlanner for ${roomName} is not active!`);
			return;
		}
		Overmind.colonies[roomName].roomPlanner.active = false;
		console.log(
			`RoomPlanner for ${Overmind.colonies[roomName].print} has been deactivated without saving changes`
		);
	}

	static listActiveRoomPlanners(): Colony[] {
		const coloniesWithActiveRoomPlanners: Colony[] = _.filter(
			_.map(
				_.keys(Overmind.colonies),
				(colonyName) => Overmind.colonies[colonyName]
			),
			(colony: Colony) => colony.roomPlanner.active
		);
		const names: string[] = _.map(
			coloniesWithActiveRoomPlanners,
			(colony) => colony.room.print
		);
		if (names.length > 0) {
			console.log(
				"Colonies with active room planners: " + names.toString()
			);
			return coloniesWithActiveRoomPlanners;
		} else {
			console.log(`No colonies with active room planners`);
			return [];
		}
	}

	static listConstructionSites(
		filter?: (site: ConstructionSite) => any
	): ConstructionSite[] {
		if (!filter) {
			filter = () => true;
		}
		const sites = _.filter(Game.constructionSites, filter);

		let msg = `${
			_.keys(Game.constructionSites).length
		} construction sites currently present: \n`;
		for (const site of sites) {
			msg +=
				`${bullet}Type: ${site.structureType}`.padEnd(20) +
				`Pos: ${site.pos.print}`.padEnd(65) +
				`Progress: ${site.progress} / ${site.progressTotal} \n`;
		}
		console.log(msg);
		return sites;
	}

	// Directive management ============================================================================================

	static listDirectives(
		filter?: string | ((dir: Directive) => boolean)
	): Directive[] {
		if (typeof filter === "string") {
			const match = filter;
			filter = (dir) => dir.name.startsWith(match);
		} else if (!filter) {
			filter = () => true;
		}

		const matches = _.filter(Overmind.directives, filter);
		let msg = "";
		for (const dir of matches) {
			msg +=
				`${bullet}Name: ${dir.print}`.padEnd(70) +
				`Colony: ${dir.colony.print}`.padEnd(55) +
				`Pos: ${dir.pos.print}\n`;
		}
		console.log(msg);
		return matches;
	}

	static removeAllLogisticsDirectives(): void {
		const logisticsFlags = _.filter(
			Game.flags,
			(flag) =>
				flag.color == COLOR_YELLOW &&
				flag.secondaryColor == COLOR_YELLOW
		);
		for (const dir of logisticsFlags) {
			dir.remove();
		}
		console.log(`Removed ${logisticsFlags.length} logistics directives.`);
	}

	static listPersistentDirectives(): Directive[] {
		const directives = _.filter(
			Overmind.directives,
			(dir) => dir.memory.persistent
		);
		let msg = "";
		for (const dir of directives) {
			msg +=
				`Type: ${dir.directiveName}`.padEnd(20) +
				`Name: ${dir.name}`.padEnd(15) +
				`Pos: ${dir.pos.print}\n`;
		}
		console.log(msg);
		return directives;
	}

	static removeFlagsByColor(
		color: ColorConstant,
		secondaryColor: ColorConstant
	): void {
		const removeFlags = _.filter(
			Game.flags,
			(flag) =>
				flag.color == color && flag.secondaryColor == secondaryColor
		);
		for (const flag of removeFlags) {
			flag.remove();
		}
		console.log(`Removed ${removeFlags.length} flags.`);
	}

	static removeErrantFlags(): void {
		// This may need to be be run several times depending on visibility
		if (config.USE_SCREEPS_PROFILER) {
			console.log(`ERROR: should not be run while profiling is enabled!`);
			return;
		}
		let count = 0;
		for (const name in Game.flags) {
			if (!Overmind.directives[name]) {
				Game.flags[name].remove();
				count += 1;
			}
		}
		console.log(`Removed ${count} flags.`);
	}

	// Structure management ============================================================================================

	static destroyErrantStructures(roomName: string): void {
		const colony = Overmind.colonies[roomName];
		if (!colony) {
			console.log(`${roomName} is not a valid colony!`);
			return;
		}
		const room = colony.room;
		const allStructures = room.find(FIND_STRUCTURES);
		let i = 0;
		for (const s of allStructures) {
			if (s.structureType == STRUCTURE_CONTROLLER) {
				continue;
			}
			if (
				!colony.roomPlanner.structureShouldBeHere(
					s.structureType,
					s.pos
				)
			) {
				const result = s.destroy();
				if (result == OK) {
					i++;
				}
			}
		}
		console.log(`Destroyed ${i} misplaced structures in ${roomName}.`);
	}

	static destroyAllHostileStructures(roomName: string): void {
		const room = Game.rooms[roomName];
		if (!room) {
			console.log(`${roomName} is undefined! (No vision?)`);
			return;
		}
		if (!room.my) {
			console.log(`${roomName} is not owned by you!`);
			return;
		}
		const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
		for (const structure of hostileStructures) {
			structure.destroy();
		}
		console.log(
			`Destroyed ${hostileStructures.length} hostile structures.`
		);
	}

	static destroyAllBarriers(roomName: string): void {
		const room = Game.rooms[roomName];
		if (!room) {
			console.log(`${roomName} is undefined! (No vision?)`);
			return;
		}
		if (!room.my) {
			console.log(`${roomName} is not owned by you!`);
			return;
		}
		for (const barrier of room.barriers) {
			barrier.destroy();
		}
		console.log(`Destroyed ${room.barriers.length} barriers.`);
	}

	static removeUnbuiltConstructionSites(): void {
		let msg = "";
		for (const id in Game.constructionSites) {
			const csite = Game.constructionSites[id];
			if (csite.progress == 0) {
				const ret = csite.remove();
				msg +=
					`Removing construction site for ${csite.structureType} with 0% progress at ` +
					`${csite.pos.print}; response: ${ret}\n`;
			}
		}
		console.log(msg);
	}

	// Colony Management ===============================================================================================

	static setRoomUpgradeRate(
		colonySpec: Colony | string,
		rate?: number | null
	): void {
		const colony = this.resolveSingleColonySpec(colonySpec);
		const oldRate = colony.upgradeSite.memory.speedFactor;

		if (typeof rate === "number") {
			rate = Math.max(0, rate);
			colony.upgradeSite.memory.speedFactor = rate;

			console.log(
				`Colony ${colony.name} is now upgrading at a rate of ${rate} (previously ${oldRate}).`
			);
		} else if (rate === null) {
			delete colony.upgradeSite.memory.speedFactor;
		} else {
			const rate = colony.upgradeSite.memory.speedFactor;
			console.log(
				`Colony ${colony.name} currently upgrading at a rate of ${rate}.`
			);
		}
	}

	static getEmpireMineralDistribution(): void {
		const minerals = EmpireAnalysis.empireMineralDistribution();
		let msg = "Empire Mineral Distribution \n";
		for (const mineral in minerals) {
			msg += `${mineral}: ${minerals[mineral]} \n`;
		}
		console.log(msg);
	}

	static evaluateOutpostEfficiencies(): void {
		const outpostsPerColony: [Colony, string[]][] = getAllColonies()
			.filter((c) => c.bunker)
			.map((c) => [c, c.outposts.map((r) => r.name)]);

		console.log(
			OvermindConsole.reportOutpostEfficiency(
				outpostsPerColony,
				(avg, colonyAvg) => avg < colonyAvg * 0.75
			)
		);
	}

	static evaluatePotentialOutpostEfficiencies(): void {
		const outpostsPerColony: [Colony, string[]][] = getAllColonies()
			.filter((c) => c.bunker)
			.map((c) => {
				const outpostNames = c.outposts.map((room) => room.name);
				return [
					c,
					Cartographer.findRoomsInRange(c.name, 2).filter(
						(r) => !outpostNames.includes(r)
					),
				];
			});

		console.log(
			OvermindConsole.reportOutpostEfficiency(
				outpostsPerColony,
				(avg, colonyAvg) => avg > colonyAvg * 1.25 || avg > 20
			)
		);
	}

	static reportOutpostEfficiency(
		outpostsPerColony: [Colony, string[]][],
		selectionCallback: (avg: number, colonyAvg: number) => boolean
	): string {
		let msg = `Estimated outpost efficiency:\n`;
		for (const [colony, outposts] of outpostsPerColony) {
			let avgEnergyPerCPU = 0;
			const outpostAvgEnergyPerCPU = [];

			msg += ` • Colony at ${colony.room.name}:\n`;
			for (const outpost of outposts) {
				const efficiency = ExpansionEvaluator.computeTheoreticalMiningEfficiency(
					colony.bunker!.anchor,
					outpost
				);
				if (typeof efficiency === "number") {
					msg += `\t - ${outpost}: Efficiency = ${efficiency.toFixed(2)} net energy/CPU\n`;
					outpostAvgEnergyPerCPU.push(efficiency);
					avgEnergyPerCPU += efficiency;
				} else {
					msg += `\t - ${outpost}: Unable to compute efficiency\n`;
				}
			}

			const bestOutposts = outpostAvgEnergyPerCPU
				.map((avg, idx) => {
					// 20E/cpu is a good guideline for an efficient room
					if (selectionCallback(avg, avgEnergyPerCPU)) {
						return idx + 1;
					}
					return undefined;
				})
				.filter((avg) => avg);

			msg += `\n   Outposts with above average efficiency of ${avgEnergyPerCPU.toFixed(
				2
			)}: `;
			msg += `${bestOutposts.join(", ")}\n`;
		}

		return msg;
	}

	// Memory management ===============================================================================================

	static deepCleanMemory(): string {
		// Clean colony memory
		const protectedColonyKeys = ['defcon', 'roomPlanner', 'roadPlanner', 'barrierPlanner'];
		for (const colName in Memory.colonies) {
			for (const key in Memory.colonies[colName]) {
				if (!protectedColonyKeys.includes(key)) {
					delete (<any>Memory.colonies[colName])[key];
				}
			}
		}
		// Suicide any creeps which have no memory
		for (const i in Game.creeps) {
			if (_.isEmpty(Game.creeps[i].memory)) {
				Game.creeps[i].suicide();
			}
		}
		// Remove profiler memory
		delete Memory.screepsProfiler;
		// Remove overlords memory from flags
		for (const i in Memory.flags) {
			if ((<any>Memory.flags[i]).overlords) {
				delete (<any>Memory.flags[i]).overlords;
			}
		}
		// Clean creep memory
		for (const i in Memory.creeps) {
			// Remove all creep tasks to fix memory leak in 0.3.1
			if (Memory.creeps[i].task) {
				Memory.creeps[i].task = null;
			}
		}
		return `Memory has been cleaned.`;
	}

	static showAssets(...args: (string | Colony)[]) {
		const colonyFilter = new Set();
		const resourceFilter = new Set();
		for (const arg of args) {
			if (typeof arg === "string" && RESOURCES_ALL.includes(arg as ResourceConstant)) {
				resourceFilter.add(arg);
			} else if (typeof arg === "string" && Overmind.colonies[arg]) {
				colonyFilter.add(arg);
			} else if (isColony(arg)) {
				colonyFilter.add(arg.name);
			}
		}

		let data: ResourceTally[] = [];
		const columnifyOpts: any = {
			config: { resource: { align: "right" }, total: { align: "right" } },
			headingTransform(header: string) {
				if (header.startsWith("S-")) {
					return "";
				} else if (header.startsWith("T-")) {
					return header.substring(2);
				} else {
					return header.toUpperCase();
				}
			},
		};
		for (const resourceType of RESOURCES_ALL) {
			if (resourceFilter.size > 0 && !resourceFilter.has(resourceType)) {
				continue;
			}
			let total = 0;
			const resourceTally: ResourceTally = {
				resource: resourceType,
				total: 0,
			};
			for (const colony of Object.values(Overmind.colonies)) {
				let count = 0;

				count += colony.storage?.store[resourceType] ?? 0;
				count += colony.terminal?.store[resourceType] ?? 0;
				count += colony.factory?.store[resourceType] ?? 0;
				total += count;

				const threshold = Overmind.terminalNetwork.thresholds(
					colony,
					resourceType
				);
				const min = threshold.target - threshold.tolerance;
				const max = threshold.target + threshold.tolerance;
				let status: ResourceTallyState = "~";
				if (count > 0 && count >= (threshold.surplus ?? Infinity)) {
					status = "!";
				} else if (count < min) {
					status = "-";
				} else if (count > max) {
					status = "+";
				}

				columnifyOpts.config![`T-${colony.name}`] ??= {};
				columnifyOpts.config![`T-${colony.name}`].align = "right";
				resourceTally[`S-${colony.name}`] = status;
				resourceTally[`T-${colony.name}`] = count;
			}
			resourceTally.total = total;
			// We only display the row if there's any stored amount, unless we're filtering
			if (
				total > 0 ||
				resourceFilter.has(resourceType) ||
				colonyFilter.size
			) {
				data.push(resourceTally);
			}
		}

		data = data.sort((a, b) => {
			const a_prio = RESOURCE_IMPORTANCE.includes(a.resource as any)
				? RESOURCE_IMPORTANCE.indexOf(a.resource as any)
				: Number.MAX_SAFE_INTEGER;
			const b_prio = RESOURCE_IMPORTANCE.includes(b.resource as any)
				? RESOURCE_IMPORTANCE.indexOf(b.resource as any)
				: Number.MAX_SAFE_INTEGER;
			if (a_prio === b_prio) {
				return b.total - a.total;
			}
			return a_prio - b_prio;
		});

		if (colonyFilter.size > 0) {
			data = data.map((tally) => {
				const filteredTally: ResourceTally = {
					resource: tally.resource,
					total: tally.total,
				};
				colonyFilter.forEach((name) => {
					filteredTally[`S-${name}`] = tally[`S-${name}`];
					filteredTally[`T-${name}`] = tally[`T-${name}`];
				});
				return filteredTally;
			});
		}

		let type = "all";
		if (colonyFilter.size || resourceFilter.size) {
			const filters = [
				...colonyFilter.values(),
				...resourceFilter.values(),
			];
			type = `filtered on ${filters.join(", ")}`;
		}
		const msg =
			`Reporting ${type} assets:\n` +
			`\tThresholds markers: <b>!</b> - surplus, <b>+</b> - above, <b>~</b> - between, <b>-</b> - under\n` +
			columnify(data, columnifyOpts);
		console.log(msg);
		return data;
	}


	private static recursiveMemoryProfile(
		prefix: string,
		memoryObject: any,
		sizes: { [key: string]: number },
		currentDepth: number
	): number {
		let total = 0;
		for (const key in memoryObject) {
			const fullKey = `${prefix}.${key}`;
			if (
				currentDepth == 0 ||
				!_.keys(memoryObject[key]) ||
				_.keys(memoryObject[key]).length == 0
			) {
				let len = NaN;
				try {
					len = JSON.stringify(memoryObject[key]).length; // 2 for the brackets
				} catch (e) {
					if (memoryObject[key] !== undefined) {
						console.log(
							`failed to get JSON for ${fullKey}: ${memoryObject[key]}`
						);
					}
				}
				sizes[fullKey] = len;
				if (!isNaN(len)) {
					total += len;
				}
			} else {
				total += OvermindConsole.recursiveMemoryProfile(
					fullKey,
					memoryObject[key],
					sizes,
					currentDepth - 1
				);
				sizes[`${prefix}.TOTAL`] = total;
			}
		}
		return total;
	}

	static profileMemory(root = Memory, depth = 1): RecursiveObject {
		const sizes: { [key: string]: number } = {};
		console.log(`Profiling memory...`);
		const start = Game.cpu.getUsed();
		OvermindConsole.recursiveMemoryProfile("ROOT", root, sizes, depth);
		const sortedSizes = _.sortBy(Object.entries(sizes), (val) => -val[1]);
		console.log(`Time elapsed: ${Game.cpu.getUsed() - start}`);
		const maxKeyLen =
			maxBy(sortedSizes, ([k, _v]) => k.length)?.[0].length ?? 0;
		console.log(
			sortedSizes
				.map(
					([k, v]) => `${k}:${"".padStart(maxKeyLen - k.length)}${v}`
				)
				.join("\n")
		);
		return sizes;
	}

	static cancelMarketOrders(filter?: (order: Order) => boolean): void {
		const ordersToCancel =
			!!filter ?
				_.filter(Game.market.orders, (order) => filter(order))
			:	Game.market.orders;
		_.forEach(_.values(ordersToCancel), (order: Order) =>
			Game.market.cancelOrder(order.id)
		);
		console.log(`Canceled ${_.values(ordersToCancel).length} orders.`);
	}

	static showRoomSafety(roomName?: string): void {
		const names = roomName ? [roomName] : Object.keys(Memory.rooms);

		let msg = `Room Intelligence data for ${
			roomName ? `room ${roomName}` : "all rooms"
		}:\n`;
		const roomData = _.sortBy(
			names.map((n) => {
				const {
					threatLevel,
					safeFor,
					unsafeFor,
					invisibleFor,
					combatPotentials,
					numHostiles,
					numBoostedHostiles,
				} = RoomIntel.getSafetyData(n);

				function fmtThreat(lvl: number): string {
					let suffix = "";
					if (lvl < 0.1) {
						suffix = "---";
					} else if (lvl < 0.2) {
						suffix = " --";
					} else if (lvl < 0.4) {
						suffix = "  -";
					} else if (lvl < 0.6) {
						suffix = "   ";
					} else if (lvl < 0.8) {
						suffix = "  +";
					} else if (lvl < 0.9) {
						suffix = " ++";
					} else {
						suffix = "+++";
					}
					return lvl.toFixed(4) + " " + suffix;
				}

				const obj = {
					room: n,
					threatlevel: fmtThreat(threatLevel),
					safeFor: safeFor ?? 0,
					unsafeFor: unsafeFor ?? 0,
					invisibleFor: invisibleFor ?? 0,
					hostiles: numHostiles ?? 0,
					boostedHostiles: numBoostedHostiles ?? 0,
					ranged: combatPotentials?.r ?? 0,
					heal: combatPotentials?.h ?? 0,
					dismantle: combatPotentials?.d ?? 0,
				};
				return obj;
			}),
			(data) => data.room
		);

		msg += columnify(roomData);
		console.log(msg);
	}

	private static resolveColonySpec(colonySpec?: Colony | string) {
		let colonies;
		if (typeof colonySpec === "string") {
			if (!Overmind.colonies[colonySpec]) {
				throw new Error(`Unknown colony ${colonySpec}`);
			}
			colonies = [Overmind.colonies[colonySpec]];
		} else if (colonySpec instanceof Colony) {
			colonies = [colonySpec];
		} else if (typeof colonySpec === "undefined") {
			colonies = Object.values(Overmind.colonies);
		} else {
			throw new Error(`Don't know what to do with ${colonySpec}`);
		}
		return colonies;
	}

	private static resolveSingleColonySpec(colonySpec?: Colony | string) {
		const colonies = this.resolveColonySpec(colonySpec);
		if (colonies.length > 1) {
			throw new Error(`more than one colony matched ${colonySpec}`);
		}
		return colonies[0];
	}

	static spawnSummary(colonySpec?: Colony | string) {
		const colonies = this.resolveColonySpec(colonySpec);
		let msg = `Ongoing creep requests:\n`;
		for (const colony of colonies) {
			if (!colony.hatchery) {
				msg += `\n${bullet} ${colony.name} has no hatchery\n`;
				continue;
			}
			if (colony.hatchery?.spawnRequests.length === 0) {
				msg += `\n${bullet} ${colony.name} is idle\n`;
				continue;
			}
			msg += `\n${bullet} ${colony.name} has the following requests:\n`;
			const requestsByRole = _.groupBy(
				colony.hatchery?.spawnRequests as any[],
				(req: any) => req.setup.role
			);
			for (const [role, requests] of Object.entries(requestsByRole)) {
				const reqs = requests as any[];
				if (reqs.length === 1) {
					const req = reqs[0];
					msg += `\t\t- "${role}": ${req.overlord.print} at priority ${req.priority}\n`;
				} else {
					msg += `\t\t- "${role}":\n`;
					for (const req of reqs) {
						msg += `\t\t\t${req.overlord.print} at priority ${req.priority}\n`;
					}
				}
			}
			msg += `\n`;
		}
		console.log(msg);
	}

	static idleCreeps(colonySpec?: Colony | string) {
		const colonies = this.resolveColonySpec(colonySpec);
		let idleCreeps: Zerg[] = [];
		let msg = "The following creeps are idle:\n";
		for (const colony of colonies) {
			const idle = colony.overlords.default.idleZerg;
			if (idle.length === 0) {
				continue;
			}

			msg += `\t${bullet} ${colony.name}: ${idle.map((z: Zerg) => z.print)}\n`;
			idleCreeps = idleCreeps.concat(...idle);
		}
		if (idleCreeps.length === 0) {
			msg = "No idle creeps";
		}
		console.log(msg);
		return idleCreeps;
	}

	static visuals() {
		Memory.settings.enableVisuals = !Memory.settings.enableVisuals;
		console.log(
			`Visuals ${Memory.settings.enableVisuals ? "enabled" : "disabled"}.`
		);
	}

	static showIntelVisuals(ticks: number = 100, range?: number) {
		Memory.settings.intelVisuals.until = Game.time + ticks;
		Memory.settings.intelVisuals.range =
			range && range > 0 ? range : ROOMINTEL_DEFAULT_VISUALS_RANGE;
		RoomIntel.limitedRoomVisual = undefined;
		console.log(
			`Intel visuals enabled in range ${Memory.settings.intelVisuals.range} for the next ${ticks} ticks (until ${Memory.settings.intelVisuals.until}).`
		);
	}

	static toggleRoomActive(roomName: string, state?: boolean) {
		const colonyName = Overmind.colonyMap[roomName];
		if (!colonyName) {
			log.error(`${roomName} is not a known outpost`);
			return;
		}

		const colony = Overmind.colonies[colonyName];
		if (state === undefined) {
			state = !colony.memory.outposts[roomName].active;
		}
		colony.memory.outposts[roomName].active = state;
		console.log(
			`Toggled room ${roomName} of colony ${colony.name} ${
				state ? "online" : "offline"
			}`
		);
	}

	static listFactories() {
		const status = getAllColonies()
			.filter((c) => c.infestedFactory)
			.map((c) => {
				return Object.assign(
					{ colony: c.name },
					c.infestedFactory?.memory.activeProduction,
					{ produced: c.infestedFactory?.memory.produced }
				);
			});
		log.info(`Factory status:\n${columnify(status)}`);
	}

	static resetFactories() {
		_.each(
			_.filter(Overmind.colonies, (c) => c.infestedFactory),
			(c) =>
				(c.infestedFactory!.memory.suspendProductionUntil = Game.time)
		);
	}
	
	/**
	 * Buys the specified amount of pixels at the cheapest price available on the market
	 * @param amount - Number of pixels to buy
	 * @returns A message indicating the result of the purchase
	 */
	static buyPixels(amount: number): string {
		if (!Overmind.accountResources) {
			return 'Error: AccountResources not initialized';
		}

		if (!amount || amount <= 0) {
			return 'Error: Please specify a valid amount of pixels to buy (must be greater than 0)';
		}

		const currentPixels = Game.resources[PIXEL] || 0;
		const currentCredits = Game.market.credits;

		log.info(`Attempting to buy ${amount} pixels...`);
		log.info(`Current pixels: ${currentPixels}, Current credits: ${currentCredits.toFixed(2)}`);

		const result = Overmind.accountResources.buyPixelsAtCheapestPrice(amount);

		if (result === OK) {
			const newPixels = Game.resources[PIXEL] || 0;
			const creditsSpent = currentCredits - Game.market.credits;
			return `Successfully bought ${amount} pixels for ${creditsSpent.toFixed(2)} credits! ` +
				   `New pixel count: ${newPixels}`;
		} else if (result === ERR_INVALID_ARGS) {
			return `Error: Invalid amount specified`;
		} else if (result === ERR_NOT_FOUND) {
			return `Error: No pixel sell orders available on the market`;
		} else if (result === ERR_NOT_ENOUGH_RESOURCES) {
			return `Error: Insufficient credits or pixels unavailable on market`;
		} else if (result === ERR_FULL) {
			const newPixels = Game.resources[PIXEL] || 0;
			const bought = newPixels - currentPixels;
			return `Partial success: Only bought ${bought}/${amount} pixels`;
		} else {
			return `Error: Failed to buy pixels (error code: ${result})`;
		}
	}

	/**
	 * Get current account resources settings
	 */
	static getAccountResourcesSettings(): string {
		const settings = Memory.settings.accountResources || {};
		let msg = 'Account Resources Settings:\n';
		msg += '========================\n';
		msg += `Pixel Generation: ${settings.pixelGenerationEnabled ? 'ENABLED' : 'DISABLED'}\n`;
		msg += `Pixel Trading: ${settings.tradePixels ? 'ENABLED' : 'DISABLED'}\n`;
		msg += `CPU Unlock Trading: ${settings.tradeCPUUnlocks ? 'ENABLED' : 'DISABLED'}\n\n`;
		
		msg += 'Pixel Settings:\n';
		msg += `  Min: ${settings.pixel?.min ?? 'default'}\n`;
		msg += `  Max: ${settings.pixel?.max ?? 'default'}\n`;
		msg += `  Buy Threshold: ${settings.pixel?.buyThreshold ?? 'default'}\n`;
		msg += `  Sell Threshold: ${settings.pixel?.sellThreshold ?? 'default'}\n\n`;
		
		msg += 'CPU Unlock Settings:\n';
		msg += `  Min: ${settings.cpuUnlock?.min ?? 'default'}\n`;
		msg += `  Max: ${settings.cpuUnlock?.max ?? 'default'}\n`;
		msg += `  Buy Threshold: ${settings.cpuUnlock?.buyThreshold ?? 'default'}\n`;
		msg += `  Sell Threshold: ${settings.cpuUnlock?.sellThreshold ?? 'default'}\n`;
		
		return msg;
	}

	// Statistics helpers ==============================================================================================
	static progress(): string {
		return statsProgress();
	}

	/**
	 * Clear RCL statistics for a colony to force recalculation
	 */
	static clearRclStats(roomName: string): string {
		if (!roomName) {
			return 'Error: Please provide a room name';
		}

		if (!Memory.rooms[roomName]) {
			return `Error: Room ${roomName} not found in memory`;
		}

		if (!Memory.rooms[roomName]._rclStats) {
			return `Room ${roomName} has no RCL statistics to clear`;
		}

		delete Memory.rooms[roomName]._rclStats;
		return `RCL statistics cleared for ${roomName}. Statistics will recalculate next tick.`;
	}

	/**
	 * Set pixel threshold settings
	 */
	static setPixelSettings(options: {min?: number, max?: number, buyThreshold?: number, sellThreshold?: number}): string {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		if (!Memory.settings.accountResources.pixel) {
			Memory.settings.accountResources.pixel = {};
		}

		const pixel = Memory.settings.accountResources.pixel;
		const changes: string[] = [];

		if (options.min !== undefined) {
			pixel.min = options.min;
			changes.push(`min: ${options.min}`);
		}
		if (options.max !== undefined) {
			pixel.max = options.max;
			changes.push(`max: ${options.max}`);
		}
		if (options.buyThreshold !== undefined) {
			pixel.buyThreshold = options.buyThreshold;
			changes.push(`buyThreshold: ${options.buyThreshold}`);
		}
		if (options.sellThreshold !== undefined) {
			pixel.sellThreshold = options.sellThreshold;
			changes.push(`sellThreshold: ${options.sellThreshold}`);
		}

		if (changes.length === 0) {
			return 'No settings changed. Provide at least one of: {min, max, buyThreshold, sellThreshold}';
		}

		return `Pixel settings updated: ${changes.join(', ')}`;
	}

	/**
	 * Set CPU unlock threshold settings
	 */
	static setCPUUnlockSettings(options: {min?: number, max?: number, buyThreshold?: number, sellThreshold?: number}): string {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		if (!Memory.settings.accountResources.cpuUnlock) {
			Memory.settings.accountResources.cpuUnlock = {};
		}

		const cpuUnlock = Memory.settings.accountResources.cpuUnlock;
		const changes: string[] = [];

		if (options.min !== undefined) {
			cpuUnlock.min = options.min;
			changes.push(`min: ${options.min}`);
		}
		if (options.max !== undefined) {
			cpuUnlock.max = options.max;
			changes.push(`max: ${options.max}`);
		}
		if (options.buyThreshold !== undefined) {
			cpuUnlock.buyThreshold = options.buyThreshold;
			changes.push(`buyThreshold: ${options.buyThreshold}`);
		}
		if (options.sellThreshold !== undefined) {
			cpuUnlock.sellThreshold = options.sellThreshold;
			changes.push(`sellThreshold: ${options.sellThreshold}`);
		}

		if (changes.length === 0) {
			return 'No settings changed. Provide at least one of: {min, max, buyThreshold, sellThreshold}';
		}

		return `CPU unlock settings updated: ${changes.join(', ')}`;
	}

	/**
	 * Enable or disable automatic pixel generation
	 */
	static setPixelGeneration(enabled: boolean): string {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		Memory.settings.accountResources.pixelGenerationEnabled = enabled;
		return `Pixel generation ${enabled ? 'enabled' : 'disabled'}`;
	}

	/**
	 * Enable or disable automatic pixel trading
	 */
	static setPixelTrading(enabled: boolean): string {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		Memory.settings.accountResources.tradePixels = enabled;
		return `Pixel trading ${enabled ? 'enabled' : 'disabled'}`;
	}

	/**
	 * Enable or disable automatic CPU unlock trading
	 */
	static setCPUUnlockTrading(enabled: boolean): string {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		Memory.settings.accountResources.tradeCPUUnlocks = enabled;
		return `CPU unlock trading ${enabled ? 'enabled' : 'disabled'}`;
	}

	// =========================
	// Sector logistics helpers
	// =========================

	private static ensureIntercolonySettings() {
		(Memory as any).settings = Memory.settings || {} as any;
		(Memory.settings as any).logistics = (Memory.settings as any).logistics || {};
		(Memory.settings as any).logistics.intercolony = (Memory.settings as any).logistics.intercolony || {};
		(Memory.settings as any).logistics.intercolony.buffers = (Memory.settings as any).logistics.intercolony.buffers || {};
	}

	static sectorPool(): string {
		const root = (Memory as any).Overmind || {};
		const pool = (root.sectorLogistics && root.sectorLogistics.pool) || {};
		const entries = _.values(pool) as Array<{colony: string; room: string; manifest: StoreDefinitionUnlimited; tick: number}>;
		if (!entries.length) return 'Sector pool is empty';
		let msg = `Sector pool (${entries.length}):\n`;
		for (const e of entries) {
			const total = _.sum(_.values(e.manifest as any) as number[]);
			msg += `  -> ${e.colony} (${e.room}) total=${total} manifest=${JSON.stringify(e.manifest)}\n`;
		}
		return msg;
	}

	static sectorQueue(input?: string | Room): string {
		const colony = input ? this.getColony(input) : (global.c as Colony | undefined);
		if (!colony) return 'No colony specified or current colony (global.c) unset';
		// Find sector overlord for the colony's sector
		const sectorKey = Cartographer.getSectorKey(colony.room.name);
		const sector = (Overmind as any).sectors?.[sectorKey];
		const ov = sector?.overlord as any;
		if (!ov) return `No SectorLogisticsOverlord found for sector ${sectorKey}`;
		const q = ov.memory?.queue || [];
		const total = _.sum(q, (s: any) => s.amount || 0);
		const backfillCount = _.sum(q, (s: any) => s.tnBackfill ? 1 : 0);
		const backfillAmount = _.sum(_.filter(q, (s: any) => s.tnBackfill), (s: any) => s.amount || 0);
		return `${sectorKey} sector queue: ${q.length} shipments, total=${total}, backfill: count=${backfillCount}, amount=${backfillAmount}\n` + JSON.stringify(q, undefined, 2);
	}

	static sectorSummary(): string {
		const root = (Memory as any).Overmind || {};
		const pool = (root.sectorLogistics && root.sectorLogistics.pool) || {};
		const poolCount = _.keys(pool).length;
		let msg = `Intercolony logistics summary\n`; 
		msg += `  Pool entries: ${poolCount}\n`;
		const sectors = (Overmind as any).sectors || {};
		for (const key in sectors) {
			const ov = sectors[key].overlord as any;
			const q = ov?.memory?.queue || [];
			const total = _.sum(q, (s: any) => s.amount || 0);
			const backfillCount = _.sum(q, (s: any) => s.tnBackfill ? 1 : 0);
			const backfillAmount = _.sum(_.filter(q, (s: any) => s.tnBackfill), (s: any) => s.amount || 0);
			msg += `  ${key}: queueSize=${q.length}, queueAmount=${total}, backfillCount=${backfillCount}, backfillAmount=${backfillAmount}\n`;
		}
		return msg;
	}

	static sectorSetBuffer(resource: ResourceConstant, amount: number): string {
		this.ensureIntercolonySettings();
		(Memory.settings as any).logistics.intercolony.buffers[resource] = Math.max(0, Math.floor(Number(amount) || 0));
		return `Set intercolony buffer for ${resource} to ${(Memory.settings as any).logistics.intercolony.buffers[resource]}`;
	}

	static sectorSetDefaultBuffer(amount: number): string {
		this.ensureIntercolonySettings();
		(Memory.settings as any).logistics.intercolony.defaultBuffer = Math.max(0, Math.floor(Number(amount) || 0));
		return `Set intercolony default buffer to ${(Memory.settings as any).logistics.intercolony.defaultBuffer}`;
	}
	static getDirective(name: string): Directive | undefined {
		return _.find(Overmind.directives, { name });
	}
	static sectorSetRangeLimit(limit: number): string {
		this.ensureIntercolonySettings();
		(Memory.settings as any).logistics.intercolony.rangeLimit = Math.max(1, Math.floor(Number(limit) || 1));
		return `Set intercolony rangeLimit to ${(Memory.settings as any).logistics.intercolony.rangeLimit}`;
	}

	static sectorCreateRequest(colonyName: string, resourceType: ResourceConstant, amount: number): string {
		const colony = Overmind.colonies[colonyName];
		if (!colony) return `Colony '${colonyName}' not found`;
		if (!colony.storage) return `Colony '${colonyName}' has no storage`;
		
		// Validate resource type
		if (!RESOURCES_ALL.includes(resourceType)) {
			return `Invalid resource type '${resourceType}'`;
		}
		
		// Validate amount
		const amt = Math.floor(Number(amount) || 0);
		if (amt <= 0) return `Amount must be positive (got ${amount})`;
		
		// Create the pool entry directly
		const root = (Memory as any).Overmind || (Memory.Overmind = {} as any);
		if (!root.sectorLogistics) root.sectorLogistics = {};
		if (!root.sectorLogistics.pool) root.sectorLogistics.pool = {};
		
		const manifest: StoreDefinitionUnlimited = {} as any;
		(manifest as any)[resourceType] = amt;
		
		root.sectorLogistics.pool[colonyName] = {
			colony: colonyName,
			room: colony.room.name,
			manifest,
			tick: Game.time,
			storageId: colony.storage.id,
		};
		
		return `Created sector logistics request: ${colonyName} requests ${amt} ${resourceType}`;
	}
	
}
