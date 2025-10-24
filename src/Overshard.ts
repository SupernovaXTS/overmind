import {log} from './console/log';
import {CROSSING_PORTAL, MoveOptions} from './movement/Movement';
import {profile} from './profiler/decorator';
import {onPublicServer, posFromReadableName} from './utilities/utils';
import {Zerg} from './zerg/Zerg';

const getInterShardMemory = function(shard: string): InterShardMemory | null {
	if (!InterShardMemory) return null;
	let raw: string | null;
	if (shard == Game.shard.name) {
		raw = InterShardMemory.getLocal();
	} else {
		raw = InterShardMemory.getRemote(shard);
	}
	if (raw == null) return null;
	return JSON.parse(raw);
};

const setInterShardMemory = function(data: InterShardMemory): void {
	if (!InterShardMemory) return;
	InterShardMemory.setLocal(JSON.stringify(data));
};

/**
 * This class contains methods for coordinating creeps across shards
 */
@profile
export class Overshard {

	private creeps: Zerg[];         // Creeps that belong to a non-existing colony
	private moveOptions: {
		[name: string]: MoveOptions; // Waypoints for each creep to follow
	};

	constructor() {
		this.creeps = [];
		this.moveOptions = {};
	}

	// When a creep crosses an inter shard portal, send its memory to the target shard
	static sendCreepMemory(creep: Creep, targetShard: string) {
		// Send creep memory to target shard
		let my = getInterShardMemory(Game.shard.name);
		if (my == null) {
			my = InterShardMemory;
		}

		_.defaultsDeep(my, {
			[targetShard]: {
				packets: {
					[Game.time]: {},
				},
				ack: 0
			}
		});
		log.info(`Inter shard packet: Sending creep ${creep.name} to ${targetShard} with TTL: ${creep.ticksToLive}`);
		my[targetShard].packets[Game.time][creep.name] = creep.memory;
		
		// Try to find the creep's overlord to suspend it
		const zerg = Overmind.zerg[creep.name];
		if (zerg) {
			const overlord = zerg.overlord;
			if (overlord != null) {
				// Optimistically suppose the creep will die of age
				overlord.suspendFor(500);
			}
		} else {
			log.warning(`Inter shard packet: Creep to send ${creep.name} is not in Overmind.zerg`);
		}
		setInterShardMemory(my);
	}


	// On the start of each tick, receive packets from other shards
	private receiveInterShardPackets(): void {
		// In sim environment or so, no inter shard things
		if (!onPublicServer()) return;
		let my = getInterShardMemory(Game.shard.name);
		if (my == null) {
			my = InterShardMemory;
		}
		for (let i = 0; i <= 3; i++) {
			const shard = 'shard' + i;
			if (shard == Game.shard.name) continue;
			const peer = getInterShardMemory(shard);
			if (peer == null || !peer[Game.shard.name]) continue;

			_.defaultsDeep(my, {
				[shard]: {
					packets: {},
					ack    : 0
				}
			});

			// Remove all packets that have been received by peer
			for (const packetTick in my[shard].packets) {
				if (parseInt(packetTick, 10) < peer[Game.shard.name].ack) {
					log.debug(`Inter shard packet: Removing obsolete packets to ${shard} of tick ${packetTick}`);
					delete my[shard].packets[packetTick];
				}
			}

			// Receive all peer packets
			let latestPeerTime = my[shard].ack - 1;
			// Maintain a receive window to tolerate inter shard latency
			// Packets within [receiveWindow, ack) are handled each tick
			let receiveWindow = 0;
			for (const peerTick in peer[Game.shard.name].packets) {
				const peerPacketTick = parseInt(peerTick, 10);
				// If packet already received, ignore it
				if (peerPacketTick < my[shard].ack) continue;
				let tickHasCreep = false;
				for (const creepName in peer[Game.shard.name].packets[peerTick]) {
					// Receive the packet containing creep memory
					const creep = Game.creeps[creepName];
					if (!creep) {
						receiveWindow = receiveWindow ? Math.min(receiveWindow, peerPacketTick) : peerPacketTick;
						log.debug(`Inter shard packet: postponing receiving packet of tick ${peerPacketTick}, ` +
								  `because creep ${creepName} not appear`);
						continue;
					}
					// Handle case where creep arrives but was already cross-shard tracked
					tickHasCreep = true;
					if (creep.memory && creep.memory[MEM.SHARD]) {
						log.warning(`Receiving inter shard creep: ${creep.name} should have empty memory, ` +
									`but got memory with move data ${JSON.stringify(creep.memory._go)}. Proceeding anyway`);
					}
					// Remove previous instance of this creep
					this.creeps = this.creeps.filter(crep => crep.name != creepName);
					creep.memory = peer[Game.shard.name].packets[peerTick][creepName];

					// Place new creep into this.creeps
					const zerg = new Zerg(creep);
					log.debug(`Received inter shard creep ${zerg.print} of colony ` +
							  `${zerg.memory[MEM.SHARD]} / ${zerg.memory[MEM.COLONY]} with TTL: ${zerg.ticksToLive}`);
					if (creep.memory._go) {
						this.creeps.push(zerg);
						this.moveOptions[creepName] = {
							waypoints: Overshard.parseWayPoints(creep.memory._go.waypoints)
						};
					} else {
						log.warning(`Inter shard creep ${zerg.print} has no move data. Cannot move`);
					}
				}
				// Assumption: If a creep appears after (or at the same time as) this tick, then the earlier creep 
				// is lost. Discard this packet and earlier packets.
				if (tickHasCreep) receiveWindow = 0;
				latestPeerTime = Math.max(latestPeerTime, peerPacketTick);
			}

			// Update ACK
			const ack = latestPeerTime + 1;
			// If there are delayed packets, set ACK to that packet's tick
			my[shard].ack = receiveWindow ? receiveWindow : ack;
		}
		setInterShardMemory(my);
	}

	public static parseWayPoints(waypoints: string[] | undefined): RoomPosition[] {
		return _.compact(_.map(waypoints || [], waypoint => posFromReadableName(waypoint))) as RoomPosition[];
	}

	/* Move creeps from other shards along their previous routes */
	private handleInterShardCreeps(): void {
		for (const creep of this.creeps) {
			if (!Game.creeps[creep.name]) continue; // Creep is dead
			if (Overmind.colonies[creep.memory[MEM.COLONY] || ""]) continue; // Creep belongs to a colony
			
			// If creep has no waypoints or has finished waypoints, check for tasks
			if (!creep.memory._go || !creep.memory._go.waypoints ||
				(creep.memory._go.waypointsVisited &&
				 creep.memory._go.waypointsVisited.length == creep.memory._go.waypoints.length)) {
				if (creep.hasValidTask) {
					creep.run();
				}
				continue;
			}
			
			// Move along waypoints
			const ret = creep.goTo(
				// TODO: dynamically determine target based on creep role
				new RoomPosition(25, 25, creep.pos.roomName),
				this.moveOptions[creep.name]
			);
			if (ret == CROSSING_PORTAL) {
				log.info(`Creep ${creep.print} crossing portal`);
			} else if (ret == ERR_TIRED) {
				// Creep is fatigued
			} else if (ret == ERR_INVALID_ARGS) {
				// Has reached target
				delete creep.memory._go;
			} else if (ret != OK) {
				log.warning(`Cannot move inter-shard creep ${creep.print}: error code: ${ret}`);
			}
		}
	}

	init() {
		this.receiveInterShardPackets();
	}

	run() {
		this.handleInterShardCreeps();
	}

	refresh() {
		_.forEach(this.creeps, creep => creep.refresh());
	}

	build() {
		this.creeps = [];
		// All creeps without a colony are inter-shard creeps
		for (const colonyName in Overmind.cache.creepsByColony) {
			if (!Overmind.colonies[colonyName]) {
				this.creeps = this.creeps.concat(_.map(
					Overmind.cache.creepsByColony[colonyName],
					creep => Overmind.zerg[creep.name] || new Zerg(creep)
				));
			}
		}
		log.debug(`Overshard build phase: collected ${this.creeps.length} inter shard creeps`);

		// Assign move options
		for (const creep of this.creeps) {
			this.moveOptions[creep.name] = {
				waypoints: Overshard.parseWayPoints(creep.memory._go?.waypoints)
			};
		}
	}
}
