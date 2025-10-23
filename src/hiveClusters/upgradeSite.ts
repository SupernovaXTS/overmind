import {$} from '../caching/GlobalCache';
import {Colony, ColonyStage} from '../Colony';
import {log} from '../console/log';
import {Roles,Setups} from '../creepSetups/setups';
import {Mem} from '../memory/Memory';
import {UpgradingOverlord} from '../overlords/core/upgrader';
import {profile} from '../profiler/decorator';
import {Stats} from '../stats/stats';
import {hasMinerals} from '../utilities/utils';
import {HiveCluster} from './_HiveCluster';
interface UpgradeSiteMemory {
	stats: { 
		downtime: number,
		energyPerTick: number,
		energy: number,
		energyPercent: number,
		progress: number,
		progressPercent: number,
		progressTotal: number,
		ticksTillUpgrade: number,
		secondsTillUpgrade: number,
	};
	speedFactor: number;		// Multiplier on upgrade parts for fast growth
	progressHistory: number[];	// Array to track progress over last 100 ticks
	lastProgress: number;		// Last recorded progress value
	tickTimes: number[];		// Array to track millisecond timestamps for calculating tick duration
}


/**
 * Upgrade sites group upgrade-related structures around a controller, such as an input link and energy container
 */
@profile
export class UpgradeSite extends HiveCluster {

	memory: UpgradeSiteMemory;
	controller: StructureController;						// The controller for the site
	upgradePowerNeeded: number;
	link: StructureLink | undefined;						// The primary object receiving energy for the site
	battery: StructureContainer | undefined; 				// The container to provide an energy buffer
	batteryPos: RoomPosition | undefined;
	overlord: UpgradingOverlord;
	energyPerTick: number;
	static settings = {
		energyBuffer     : 100000,	// Number of upgrader parts scales with energy minus this value
		// Scaling factor: this much excess energy adds one extra body repetition
		// TODO: scaling needs to increase with new storage/terminal system
		energyPerBodyUnit: 20000,
		minLinkDistance  : 10,		// Required distance to build link
		linksRequestBelow: 200,		// Links request energy when less than this amount
	};

	constructor(colony: Colony, controller: StructureController) {
		super(colony, controller, 'upgradeSite');
		this.controller = controller;
		this.memory = Mem.wrap(this.colony.memory, 'upgradeSite');
		this.upgradePowerNeeded = this.getUpgradePowerNeeded();
		// Register bettery
		$.set(this, 'battery', () => {
			const allowableContainers = _.filter(this.room.containers, container =>
				container.pos.findInRange(FIND_SOURCES, 1).length == 0); // only count containers that aren't near sources
			return this.pos.findClosestByLimitedRange(allowableContainers, 3);
		});
		this.batteryPos = $.pos(this, 'batteryPos', () => {
			if (this.battery) {
				return this.battery.pos;
			}
			const inputSite = this.findInputConstructionSite();
			if (inputSite) {
				return inputSite.pos;
			}
			return this.calculateBatteryPos() || log.alert(`Upgrade site at ${this.pos.print}: no batteryPos!`);
		});
		if (this.batteryPos) this.colony.destinations.push({pos: this.batteryPos, order: 0});
		// Register link
		$.set(this, 'link', () => this.pos.findClosestByLimitedRange(colony.availableLinks, 3));
		this.colony.linkNetwork.claimLink(this.link);
		// // Energy per tick is sum of upgrader body parts and nearby worker body parts
		// Compute stats
		this.stats();
	}

	refresh() {
		this.memory = Mem.wrap(this.colony.memory, 'upgradeSite');
		$.refreshRoom(this);
		$.refresh(this, 'controller', 'battery', 'link');
	}

	spawnMoarOverlords() {
		// Register overlord
		this.overlord = new UpgradingOverlord(this);
	}

	findInputConstructionSite(): ConstructionSite | undefined {
		const nearbyInputSites = this.pos.findInRange(this.room.constructionSites, 4, {
			filter: (s: ConstructionSite) => s.structureType == STRUCTURE_CONTAINER ||
											 s.structureType == STRUCTURE_LINK,
		});
		return _.first(nearbyInputSites);
	}

	private getUpgradePowerNeeded(): number {
		return $.number(this, 'upgradePowerNeeded', () => {
			// Workers perform upgrading until storage is set up
			if (!this.room.storage) return 0;

			const amountOver = Math.max(this.colony.assets.energy - UpgradeSite.settings.energyBuffer, 0);
			let upgradePower = 1 + Math.floor(amountOver / UpgradeSite.settings.energyPerBodyUnit);
			if (amountOver > 800000) {
				upgradePower *= 4; // double upgrade power if we have lots of surplus energy
			} else if (amountOver > 250000) {
				upgradePower *= 2;
			}
			if (this.controller.level == 8) {
				if (this.colony.assets.energy < 30000) {
					upgradePower = 0;
				} else {
					upgradePower = Math.min(upgradePower, 15); // don't go above 15 work parts at RCL 8
				}
			} else if (this.controller.level >= 5) {
				// Can set a room to upgrade at an accelerated rate manually
				upgradePower = this.memory.speedFactor != undefined ? upgradePower * this.memory.speedFactor : upgradePower;
			}
			return upgradePower;
		});
	}

	init(): void {
		// Register energy requests
		if (this.link && this.link.energy < UpgradeSite.settings.linksRequestBelow) {
			this.colony.linkNetwork.requestReceive(this.link);
		}
		const inThreshold = this.colony.stage == ColonyStage.Larva ? 0.75 : 0.5;
		if (this.battery) {
			if (this.colony.stage == ColonyStage.Larva) {
				if (this.battery.energy < inThreshold * this.battery.store.getCapacity(RESOURCE_ENERGY)) {
					const workers = this.colony.overlords.work.workers;
					const energyPerTick = UPGRADE_CONTROLLER_POWER * _.sum(workers, worker => worker.getBodyparts(WORK));
					this.colony.logisticsNetwork.requestInput(this.battery, {dAmountdt: energyPerTick});
				}
			} else {
				if (this.battery.energy < inThreshold * this.battery.store.getCapacity(RESOURCE_ENERGY)) {
					const energyPerTick = UPGRADE_CONTROLLER_POWER * this.upgradePowerNeeded;
					this.colony.logisticsNetwork.requestInput(this.battery, {dAmountdt: energyPerTick});
				}
			}
			if (hasMinerals(this.battery.store)) { // get rid of any minerals in the container if present
				this.colony.logisticsNetwork.requestOutputMinerals(this.battery);
			}
		}
	}

	/**
	 * Calculate where the input will be built for this site
	 */
	private calculateBatteryPos(): RoomPosition | undefined {
		let originPos: RoomPosition | undefined;
		if (this.colony.storage) {
			originPos = this.colony.storage.pos;
		} else if (this.colony.roomPlanner.storagePos) {
			originPos = this.colony.roomPlanner.storagePos;
		} else {
			return;
		}
		// Find all positions at range 2 from controller
		let inputLocations: RoomPosition[] = [];
		for (const pos of this.pos.getPositionsAtRange(2)) {
			if (pos.isWalkable(true)) {
				inputLocations.push(pos);
			}
		}
		// Try to find locations where there is maximal standing room
		const maxNeighbors = _.max(_.map(inputLocations, pos => pos.availableNeighbors(true).length));
		inputLocations = _.filter(inputLocations,
								  pos => pos.availableNeighbors(true).length >= maxNeighbors);
		// Return location closest to storage by path
		const inputPos = originPos.findClosestByPath(inputLocations);
		if (inputPos) {
			return inputPos;
		}
	}

	/**
	 * Build a container output at the optimal location
	 */
	private buildBatteryIfMissing(): void {
		if (!this.battery && !this.findInputConstructionSite()) {
			const buildHere = this.batteryPos;
			if (buildHere) {
				const result = buildHere.createConstructionSite(STRUCTURE_CONTAINER);
				if (result == OK) {
					return;
				} else {
					log.warning(`Upgrade site at ${this.pos.print}: cannot build battery! Result: ${result}`);
				}
			}
		}
	}
	private get investedEnergyPerTick(): number {
		const lastProgress = this.memory.lastProgress || this.controller.progress;
		const progressThisTick = this.controller.progress - lastProgress;
		return progressThisTick/100;
	}
	private get progressPerTick(): number {
		const lastProgress = this.memory.lastProgress || this.controller.progress;
		const progressThisTick = this.controller.progress - lastProgress;
		return progressThisTick/100;
	}
	private get averageProgressPerTick(): number {
		if (!this.memory.progressHistory || this.memory.progressHistory.length === 0) {
			return this.progressPerTick;
		}
		const sum = _.sum(this.memory.progressHistory);
		return sum / this.memory.progressHistory.length;
	}
	private get averageTickDuration(): number {
		// Calculate average tick duration in seconds based on recorded timestamps
		if (!this.memory.tickTimes || this.memory.tickTimes.length < 2) {
			return 3; // Default to 3 seconds if we don't have enough data
		}
		// Calculate time differences between consecutive ticks
		const timeDiffs: number[] = [];
		for (let i = 1; i < this.memory.tickTimes.length; i++) {
			timeDiffs.push(this.memory.tickTimes[i] - this.memory.tickTimes[i - 1]);
		}
		// Return average in seconds
		const avgMilliseconds = _.sum(timeDiffs) / timeDiffs.length;
		return avgMilliseconds / 1000;
	}
	private get progress(): number {
		return this.controller.progress;
	}
	private get progressTotal(): number {
		return this.controller.progressTotal;
	}
	private get energy(): number {
		return this.controller.progress/100;
	}
	private get energyTotal(): number {
		return this.controller.progressTotal/100;
	}
	private get progressPercent(): number {
		const progressPercent = Math.floor(100 * this.controller.progress / this.controller.progressTotal);
		return progressPercent;
	}
	private get energyPercent(): number {
		const energyPercent = Math.floor(100 * this.energy / this.energyTotal);
		return energyPercent;
	}
	private get ticksTillUpgrade(): number {
		const ticksTillUpgrade = Math.ceil((this.controller.progressTotal - this.controller.progress)
			/ (this.averageProgressPerTick || 1));
		return ticksTillUpgrade;
	}	
	private stats() {
		const defaults = {
			downtime: 0,
			energyPerTick: 0,
			energy: 0,
			energyPercent: 0,
			progress: 0,
			progressPercent: 0,
			progressTotal: 0,
			ticksTillUpgrade: 0,
			secondsTillUpgrade: 0,
		};
		if (!this.memory.stats) this.memory.stats = defaults;
		_.defaults(this.memory.stats, defaults);
		
		// Initialize progress history if needed
		if (!this.memory.progressHistory) {
			this.memory.progressHistory = [];
		}
		
		// Initialize tick times array if needed
		if (!this.memory.tickTimes) {
			this.memory.tickTimes = [];
		}
		
		// Record current timestamp
		this.memory.tickTimes.push(Date.now());
		
		// Keep only the last 100 ticks of timestamp data
		if (this.memory.tickTimes.length > 100) {
			this.memory.tickTimes.shift();
		}
		
		// Calculate and store progress for this tick
		const currentProgressPerTick = this.progressPerTick;
		this.memory.progressHistory.push(currentProgressPerTick);
		
		// Keep only the last 100 ticks of data
		if (this.memory.progressHistory.length > 100) {
			this.memory.progressHistory.shift();
		}
		
		// Update lastProgress for next tick
		this.memory.lastProgress = this.controller.progress;
		
		// Compute downtime
		this.memory.stats.downtime = (this.memory.stats.downtime * (CREEP_LIFE_TIME - 1) +
									  (this.battery ? +this.battery.isEmpty : 0)) / CREEP_LIFE_TIME;
		this.memory.stats.energyPerTick = this.investedEnergyPerTick;
		this.memory.stats.energy = this.energy;
		this.memory.stats.energyPercent = this.energyPercent;
		this.memory.stats.progress = this.progress;
		this.memory.stats.progressPercent = this.progressPercent;
		this.memory.stats.progressTotal = this.progressTotal;
		this.memory.stats.ticksTillUpgrade = this.ticksTillUpgrade;
		this.memory.stats.secondsTillUpgrade = Math.ceil(this.ticksTillUpgrade * this.averageTickDuration);
		// Log stats
		Stats.log(`colonies.${this.colony.name}.upgradeSite.energy`, this.memory.stats.energy);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.energyPercent`, this.memory.stats.energyPercent);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.progress`, this.memory.stats.progress);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.progressPercent`, this.memory.stats.progressPercent);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.progressTotal`, this.memory.stats.progressTotal);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.downtime`, this.memory.stats.downtime);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.energyPerTick`, this.memory.stats.energyPerTick);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.ticksTillUpgrade`, this.memory.stats.ticksTillUpgrade);
		Stats.log(`colonies.${this.colony.name}.upgradeSite.secondsTillUpgrade`, this.memory.stats.secondsTillUpgrade);
	}

	run(): void {
		if (Game.time % 25 == 7 && this.colony.level >= 2) {
			this.buildBatteryIfMissing();
		}
		this.stats();
	}

	visuals() {
		// let info = [];
		// if (this.controller.level != 8) {
		// 	let progress = `${Math.floor(this.controller.progress / 1000)}K`;
		// 	let progressTotal = `${Math.floor(this.controller.progressTotal / 1000)}K`;
		// 	let percent = `${Math.floor(100 * this.controller.progress / this.controller.progressTotal)}`;
		// 	info.push(`Progress: ${progress}/${progressTotal} (${percent}%)`);
		//
		// }
		// info.push(`Downtime: ${this.memory.stats.downtime.toPercent()}`);
		// Visualizer.showInfo(info, this);
	}
}
