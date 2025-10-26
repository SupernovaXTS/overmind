import { Directive } from 'directives/Directive';
import { AccountResources } from 'logistics/accountResources';
import { SpawnGroup } from 'logistics/SpawnGroup';
import { Overlord } from 'overlords/Overlord';
import { PowerZerg } from 'zerg/PowerZerg';
import { Zerg } from 'zerg/Zerg';
import { GameCache } from './caching/GameCache';
import { Colony } from './Colony';
import { log } from './console/log';
import { DirectiveClearRoom } from './directives/colony/clearRoom';
import { DirectivePoisonRoom } from './directives/colony/poisonRoom';
import { DirectiveWrapper } from './directives/initializer';
import { NotifierPriority } from './directives/Notifier';
import { RoomIntel } from './intel/RoomIntel';
import { TerminalNetworkV2 } from './logistics/TerminalNetwork_v2';
import { SectorLogistics } from './logistics/SectorLogistics';
import { TraderJoe, TraderJoeIntershard } from './logistics/TradeNetwork';
import { Cartographer } from './utilities/Cartographer';
import Sector from './sector/Sector';
import { Mem } from './memory/Memory';
import { Overseer } from './Overseer';
import { Overshard } from './Overshard';
import { profile } from './profiler/decorator';
import { Stats } from './stats/stats';
import { ExpansionPlanner } from './strategy/ExpansionPlanner';
import { alignedNewline } from './utilities/stringConstants';
import { Visualizer } from './visuals/Visualizer';
import {
	NEW_OVERMIND_INTERVAL, PROFILER_COLONY_LIMIT, PROFILER_INCLUDE_COLONIES,
	SUPPRESS_INVALID_DIRECTIVE_ALERTS, USE_SCREEPS_PROFILER, USE_TRY_CATCH
} from './~settings';
@profile
// tslint:disable-next-line:class-name
export default class _Overmind implements IOvermind {
	memory: Mem;
	suspendedColonies: string[];
	suppressedColonies: string[];
	overseer: Overseer;
	overshard: Overshard;
	cache: GameCache;
	shouldBuild: boolean;
	expiration: number;
	directives: { [flagName: string]: Directive };
	zerg: { [creepName: string]: Zerg };
	powerZerg: { [creepName: string]: PowerZerg };
	colonies: { [roomName: string]: Colony };
	overlords: { [ref: string]: Overlord };
	spawnGroups: { [ref: string]: SpawnGroup };
	colonyMap: { [roomName: string]: string };
	sectors: { [sectorKey: string]: Sector };
	terminalNetwork: TerminalNetworkV2;
	tradeNetwork: TraderJoe;
	tradeNetworkIntershard: TraderJoeIntershard;
	accountResources: AccountResources;
	expansionPlanner: ExpansionPlanner;
	exceptions: Error[];
	roomIntel: RoomIntel;
	profilerRooms: {[colonyName: string]: boolean};

	constructor() {
		this.memory = Memory.Overmind;
		this.overseer = new Overseer();
		this.overshard = new Overshard();
		this.shouldBuild = true;
		this.expiration = Game.time + NEW_OVERMIND_INTERVAL;
		this.cache = new GameCache();
		this.colonies = {};
		this.suspendedColonies = [];
		this.suppressedColonies = [];
		this.directives = {};
		this.zerg = {};
		this.powerZerg = {};
		this.overlords = {};
		this.spawnGroups = {};
		this.colonyMap = {};
		this.sectors = {} as any;
		this.terminalNetwork = new TerminalNetworkV2();
		this.tradeNetwork = new TraderJoe();
		this.tradeNetworkIntershard = new TraderJoeIntershard();
		this.accountResources = new AccountResources(this.tradeNetworkIntershard);
		global.accountResources = this.accountResources;
		global.TerminalNetwork = this.terminalNetwork;
		global.tradeNetworkIntershard = this.tradeNetworkIntershard;
		global.TradeNetwork = this.tradeNetwork;
		this.expansionPlanner = new ExpansionPlanner();
		this.roomIntel = new RoomIntel();
		this.exceptions = [];
		this.profilerRooms = {};
	}

	build() {
		if (USE_SCREEPS_PROFILER) {
			for (const name of PROFILER_INCLUDE_COLONIES) {
				this.profilerRooms[name] = true;
			}

			const myRoomNames = _.filter(_.keys(Game.rooms), name => Game.rooms[name] && Game.rooms[name].my);
			for (const name of _.sample(myRoomNames, PROFILER_COLONY_LIMIT - PROFILER_INCLUDE_COLONIES.length)) {
				this.profilerRooms[name] = true;
			}
		}

		this.cache.build();
		this.overshard.build();
		this.registerColonies();
		this.registerDirectives();
		_.forEach(this.colonies, c => c.spawnMoarOverlords());
		_.forEach(this.directives, d => d.spawnMoarOverlords());
		// Build Sector objects: one per sector, aggregating all colonies in that sector
		const grouped: { [sectorKey: string]: Colony[] } = {} as any;
		for (const name in this.colonies) {
			const colony = this.colonies[name];
			const sectorKey = Cartographer.getSectorKey(colony.room.name);
			(grouped[sectorKey] = grouped[sectorKey] || []).push(colony);
		}
		this.sectors = {} as any;
		for (const sectorKey in grouped) {
			const cols = grouped[sectorKey];
			if (cols.length == 0) continue;
			
			// Determine anchor colony (highest RCL, ties broken by name)
			const anchor = cols.slice().sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name))[0];
			
			// Don't create sector if:
			// 1. Only one colony exists (no inter-colony logistics needed)
			// 2. Anchor colony is below RCL 4 (needs storage for sector logistics)
			if (cols.length <= 1 || anchor.level < 4) {
				continue;
			}
			
			this.sectors[sectorKey] = new Sector(sectorKey, cols);
		}
		this.shouldBuild = false;
	}

	refresh() {
		this.shouldBuild = true;
		this.memory = Memory.Overmind;
		this.exceptions = [];
		this.cache.refresh();
		this.overshard.refresh();
		this.overseer.refresh();
		this.terminalNetwork.refresh();
		this.tradeNetwork.refresh();
		this.expansionPlanner.refresh();
		_.forEach(this.colonies, c => c.refresh());
		_.forEach(this.directives, d => d.refresh());
		this.registerDirectives();

		for (const o in this.overlords) {
			this.overlords[o].refresh();
		}
		for (const s in this.spawnGroups) {
			this.spawnGroups[s].refresh();
		}
		// Refresh sectors
		for (const k in this.sectors) {
			this.sectors[k].refresh();
		}
		this.shouldBuild = false;
	}

	private try(callback: () => any, identifier?: string): void {
		if (!USE_TRY_CATCH) return callback();

		try {
			callback();
		} catch (e: any) {
			if (identifier) {
				e.name = `Caught unhandled exception at ${'' + callback} (identifier: ${identifier}): \n`
							+ e.name + '\n' + e.stack;
			} else {
				e.name = `Caught unhandled exception at ${'' + callback}: \n` + e.name + '\n' + e.stack;
			}
			this.exceptions.push(e);
		}
	}

	handleExceptions() {
		if (this.exceptions.length == 0) return;

		log.warn('Exceptions present this tick! Rebuilding Overmind object in next tick.');
		Memory.stats.persistent.lastErrorTick = Game.time;
		this.shouldBuild = true;
		this.expiration = Game.time;

		if (this.exceptions.length == 1) {
			throw _.first(this.exceptions);
		}
		
		for (const e of this.exceptions) {
			log.throw(e);
		}
		const err = new Error('Multiple exceptions caught this tick!');
		err.stack = _.map(this.exceptions, e => e.name).join('\n');
		throw err;
	}

	registerColonies() {
		this.colonyMap = {};

		for (const roomName in Game.rooms) {
			const room = Game.rooms[roomName];
			if (!room.my) continue;
			
			const colony = Memory.colonies[roomName];
			if (colony && colony.suspend) {
				this.suspendedColonies.push(roomName);
				continue;
			}

			if (room.flags) {
				const suppressed = _.filter(room.flags,
					flag => DirectiveClearRoom.filter(flag) || DirectivePoisonRoom.filter(flag));
				if (suppressed.length > 0) {
					this.suppressedColonies.push(roomName);
					continue;
				}
			}

			this.colonyMap[roomName] = roomName;
		}
		
		const outpostFlagMap = _.groupBy(this.cache.outpostFlags, flag => flag.memory[MEM.COLONY]);
		const outpostMap = _.mapValues(outpostFlagMap, flag => _.map(flag, f => (f.memory.setPos || f.pos).roomName));
		for (const colonyName in outpostMap) {
			for (const outpostName of outpostMap[colonyName]) {
				this.colonyMap[outpostName] = colonyName;
			}
		}
		
		let id = 0;
		for (const colonyName in this.colonyMap) {
			// if these do not match, it is an outpost
			if (this.colonyMap[colonyName] != colonyName) continue;

			if (USE_SCREEPS_PROFILER && !this.profilerRooms[colonyName]) {
				if (Game.time % 20 == 0) {
					log.alert('Suppressing instantiation of colony ' + colonyName + '.');
				}
				continue;
			}
			
			this.try(() => this.colonies[colonyName] = new Colony(id, colonyName, outpostMap[colonyName]));
			id++;
		}
	}

	registerDirectives() {
		for (const flag in Game.flags) {
			if (this.directives[flag]) {
				continue;
			}

			const room = Game.flags[flag].memory[MEM.COLONY];
			if (room) {
				if (USE_SCREEPS_PROFILER && !this.profilerRooms[room]) {
					continue;
				}
				const colony = Memory.colonies[room];
				if (colony && colony.suspend) {
					continue;
				}
			}

			const directive = DirectiveWrapper(Game.flags[flag]);
			if (!directive && !SUPPRESS_INVALID_DIRECTIVE_ALERTS && Game.time % 10 == 0) {
				log.alert('Flag [' + flag + ' @ ' + Game.flags[flag].pos.print + '] does not match ' + 'a valid directive color code! (Refer to /src/directives/initializer.ts)' + alignedNewline + 'Use removeErrantFlags() to remove flags which do not match a directive.');
			}
		}
	}

	init() {
		this.try(() => RoomIntel.init());
		this.try(() => this.overshard.init(), 'overshard.init()');
		this.try(() => this.tradeNetwork.init());
		this.try(() => this.terminalNetwork.init());
		this.try(() => this.overseer.init(), 'overseer.init()');

		for (const colonyName in this.colonies) {
			const usedCPU = Game.cpu.getUsed();
			this.try(() => this.colonies[colonyName].init(), colonyName);
			Stats.log('cpu.usage.' + colonyName + '.init', Game.cpu.getUsed() - usedCPU);
		}

		for (const spawnGroupName in this.spawnGroups) {
			this.try(() => this.spawnGroups[spawnGroupName].init(), spawnGroupName);
		}

		this.try(() => this.expansionPlanner.init());

		// Initialize sectors
		for (const key in this.sectors) {
			this.try(() => this.sectors[key].init(), key);
		}
	}

	run() {
		for (const spawnGroupName in this.spawnGroups) {
			this.try(() => this.spawnGroups[spawnGroupName].run(), spawnGroupName);
		}

		this.try(() => this.overshard.run(), 'overshard.run()');
		this.try(() => this.overseer.run(), 'overseer.run()');

		for (const colonyName in this.colonies) {
			this.try(() => this.colonies[colonyName].run(), colonyName);
		}
		// Run sectors (publishes pool entries and aggregates sector logistics)
		for (const key in this.sectors) {
			this.try(() => this.sectors[key].run(), key);
		}
		// Central pool is consumed by SectorTransportOverlords; no directive-based processing needed here
		this.try(() => this.terminalNetwork.run());
		this.try(() => this.tradeNetwork.run());
		this.try(() => this.expansionPlanner.run());
		this.try(() => RoomIntel.run());
		this.try(() => this.accountResources.handleCPUUnlock());
		this.try(() => this.accountResources.handlePixel());
		// this.try(() => this.accountResources.main());

		/* Broken?
        var cpuTime = Game.cpu.unlockedTime;
        var cpuTimeWanted = 1
        var cpuTimeCalc = (cpuTimeWanted * 1000) * (3600 * 24)
        var checkCpuTime = (cpuTime && ((cpuTime - Date.now()) < cpuTimeCalc))
        var cpuTimeCount = Game.resources.cpuTime
        if ((cpuTimeCount >= cpuTimeWanted) && checkCpuTime) {
            if (checkCpuTime) {
                var result = Game.cpu.unlock();
                if (result == 0) {
                    log.info("CPU Unlock Successful")
                }
                else {
                    log.error("Unable to unlock CPU")
                }
            }
        }
        else {
            if (cpuTime && cpuTime <= 0) {
                log.alert("Attempted to unlock CPU, Insufficent CPU Unlocks")
            }
            
        }
        */
		
	}

	postRun() {
		this.handleExceptions();
	}

	handleNotifications() {
		for (const colony of this.suspendedColonies) {
			this.overseer.notifier.alert('Colony suspended', colony, NotifierPriority.High);
		}

		for (const colony of this.suppressedColonies) {
			this.overseer.notifier.alert('Colony suppressed', colony, NotifierPriority.Low);
		}
	}

	visuals() {
		if (Game.cpu.bucket < 9000 && Game.shard.name == 'shard3') {
			if (Game.time % 10 == 0) {
				log.info('CPU bucket is too low (' + Game.cpu.bucket + ') - skip rendering visuals.');
			}
			return;
		}

		Visualizer.visuals();

		this.overseer.visuals();
		for (const c in this.colonies) {
			this.colonies[c].visuals();
		}
	}
}
