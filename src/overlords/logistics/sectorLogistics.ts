import {Colony} from '../../Colony';
import {profile} from '../../profiler/decorator';
import {Overlord, OverlordMemory} from '../Overlord';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {Cartographer} from '../../utilities/Cartographer';
import {Stats} from '../../stats/stats';
import {Roles, Setups} from '../../creepSetups/setups';
import {Zerg} from '../../zerg/Zerg';
import {Tasks} from '../../tasks/Tasks';
import {SectorLogistics as PoolAPI} from '../../logistics/SectorLogistics';

export interface SectorLogisticsOverlordMemory extends OverlordMemory {
  sectorKey: string;
  colonies: string[]; // colony names in this sector
  queue?: Shipment[];
}

const getDefaultSectorLogisticsMemory: () => SectorLogisticsOverlordMemory = () => ({
  sectorKey: '',
  colonies : [],
});

/**
 * SectorLogisticsOverlord groups all colonies within a 10x10 map sector and coordinates intercolony logistics
 * using a single overlord per sector (no per-colony sector transport overlords).
 */
@profile
export class SectorLogisticsOverlord extends Overlord {

  memory: SectorLogisticsOverlordMemory;
  sectorKey: string;
  sectorColonies: Colony[];
  transporters: Zerg[];

  // Defaults reimplemented from legacy LogisticsSector
  private static DEFAULT_BUFFER = 100000;
  private static DEFAULT_RANGE_LIMIT = 4;
  private static DEFAULT_SPECIFIC_BUFFERS: Partial<Record<ResourceConstant, number>> = {
    [RESOURCE_ENERGY]: 200000,
    [RESOURCE_POWER] : 1000,
    [RESOURCE_OPS]   : 1000,
  };

  constructor(anchor: Colony, sectorColonies: Colony[]) {
    super(anchor, 'sectorLogistics', OverlordPriority.sectorLogi.intersectorTransport, getDefaultSectorLogisticsMemory);
    this.sectorColonies = sectorColonies;
    this.sectorKey = Cartographer.getSectorKey(anchor.room.name);
    this.memory.sectorKey = this.sectorKey;
    this.memory.colonies = sectorColonies.map(c => c.name);
    this.transporters = this.zerg(Roles.sectorTransport);
    // Create a spawn group covering colonies within configured range to help spawn sector transporters
    const maxPathDistance = this.getRangeLimit() * 50; // rough path upper bound per room
    this.spawnGroup = this.spawnGroup || this.colony.spawnGroup; // prefer existing
    if (!this.spawnGroup) {
      const {SpawnGroup} = require('../../logistics/SpawnGroup');
      this.spawnGroup = new SpawnGroup(this, { maxPathDistance, requiredRCL: 4 });
    }
  }

  refresh(): void {
    super.refresh();
    // Keep membership fresh
    this.sectorColonies = this.memory.colonies
      .map(name => Overmind.colonies[name])
      .filter((c): c is Colony => !!c);
  }

  init(): void {
    // Build shipments if empty
    if (!this.memory.queue || this.memory.queue.length == 0) {
      this.rebuildQueueFromPool();
    }
    // Determine desired transporters based on queue and setup capacity
  const totalToShip = _.sum(this.memory.queue || [], s => s.amount);
    const setup = Setups.sectorTransporters.default;
    const carryParts = setup.getBodyPotential(CARRY, this.colony) || 0;
    const perCreepCapacity = Math.max(1, carryParts * CARRY_CAPACITY);
  const maxCreepsCap = (Memory.settings as any)?.logistics?.intercolony?.maxTransporters;
  const minCreepsCap = (Memory.settings as any)?.logistics?.intercolony?.minTransporters;
  const maxCreeps = (typeof maxCreepsCap === 'number' && maxCreepsCap > 0) ? maxCreepsCap : 8;
  const minCreeps = (typeof minCreepsCap === 'number' && minCreepsCap > 0) ? minCreepsCap : 4;
  let desired = Math.ceil(totalToShip / perCreepCapacity);
  desired = Math.max(minCreeps, Math.min(maxCreeps, desired));
  // Ensure minimum is honored even if maxCreeps was set below
  if (desired < minCreeps) desired = minCreeps;
    this.wishlist(desired, setup, {reassignIdle: true});
    // Stats
    Stats.log(`sectors.${this.sectorKey}.colonyCount`, this.sectorColonies.length);
    Stats.log(`sectors.${this.sectorKey}.queueSize`, (this.memory.queue || []).length);
    Stats.log(`sectors.${this.sectorKey}.queueAmount`, totalToShip);
  }

  run(): void {
    // Aggregate pool visibility and publish stats
    const pool = (PoolAPI as any).pool || {};
    const sectorColNames = new Set(this.sectorColonies.map(c => c.name));
    const sectorPoolEntries = Object.values(pool).filter((e: any) => sectorColNames.has(e.colony));
    const poolTotal = _.sum(sectorPoolEntries, (e: any) => _.sum(_.values(e.manifest as any) as number[]));
    Stats.log(`sectors.${this.sectorKey}.pool.entries`, sectorPoolEntries.length);
    Stats.log(`sectors.${this.sectorKey}.pool.total`, poolTotal);

    // Rebuild queue occasionally if empty
    if (((this.memory.queue?.length) || 0) == 0 && Game.time % 10 == 0) {
      this.rebuildQueueFromPool();
    }
    // Run transporter creeps
    this.autoRun(this.transporters, t => this.handleTransporter(t));
    // Periodic stats
    if (Game.time % 8 === 0) {
      const totalToShip = _.sum(this.memory.queue || [], s => s.amount);
      Stats.log(`sectors.${this.sectorKey}.queueSize`, (this.memory.queue || []).length);
      Stats.log(`sectors.${this.sectorKey}.queueAmount`, totalToShip);
    }
  }

  // ===== Helpers =====
  
  /**
   * Get all available resources in this sector (aggregated across all colonies, respecting buffers)
   * @param resource Optional: specific resource to query; if omitted, returns all resources
   * @returns Object mapping resource types to total available amounts
   */
  getAvailableResources(resource?: ResourceConstant): { [resourceType: string]: number } {
    const available: { [resourceType: string]: number } = {};
    
    if (resource) {
      // Query specific resource
      const buffer = this.getBuffer(resource);
      let total = 0;
      for (const colony of this.sectorColonies) {
        const amount = (colony.assets[resource] as number) || 0;
        total += Math.max(0, amount - buffer);
      }
      available[resource] = total;
    } else {
      // Aggregate all resources
      const allResources = new Set<string>();
      for (const colony of this.sectorColonies) {
        for (const res in colony.assets) {
          allResources.add(res);
        }
      }
      
      for (const res of allResources) {
        const resourceType = res as ResourceConstant;
        const buffer = this.getBuffer(resourceType);
        let total = 0;
        for (const colony of this.sectorColonies) {
          const amount = (colony.assets[resourceType] as number) || 0;
          total += Math.max(0, amount - buffer);
        }
        if (total > 0) {
          available[resourceType] = total;
        }
      }
    }
    
    return available;
  }
  
  private getRangeLimit(): number {
    const limit = (Memory.settings as any)?.logistics?.intercolony?.rangeLimit;
    return (typeof limit === 'number' && limit > 0) ? limit : SectorLogisticsOverlord.DEFAULT_RANGE_LIMIT;
  }

  private getBuffer(resource: ResourceConstant): number {
    const memBuf = (Memory.settings as any)?.logistics?.intercolony?.buffers?.[resource];
    if (typeof memBuf === 'number') return memBuf;
    const specific = SectorLogisticsOverlord.DEFAULT_SPECIFIC_BUFFERS[resource];
    if (typeof specific === 'number') return specific;
    const def = (Memory.settings as any)?.logistics?.intercolony?.defaultBuffer;
    return (typeof def === 'number') ? def : SectorLogisticsOverlord.DEFAULT_BUFFER;
  }

  private rebuildQueueFromPool(): void {
    const pool = (PoolAPI as any).pool as { [colony: string]: { colony: string; room: string; manifest: StoreDefinitionUnlimited; storageId?: Id<StructureStorage>; maxRange?: number } };
    if (!pool) return;
    const shipments: Shipment[] = [];
    for (const key in pool) {
      const entry = pool[key];
      if (!entry) continue;
      const destColony = Overmind.colonies[entry.colony];
      if (!destColony || !destColony.storage) continue; // require storage at dest
      // must be in same sector as this overlord
      if (Cartographer.getSectorKey(destColony.room.name) !== this.sectorKey) continue;
      for (const res in entry.manifest) {
        const resource = res as ResourceConstant;
        let requested = (entry.manifest[resource] as number) || 0;
        if (requested <= 0) continue;
        // If destination has a terminal, only send if the terminal network cannot obtain this request
        let tnBackfill = false;
        if (destColony.terminal && Overmind.terminalNetwork) {
          try {
            const totalDesired = (destColony.assets[resource] || 0) + requested;
            const tnCan = Overmind.terminalNetwork.canObtainResource(destColony, resource, totalDesired);
            if (tnCan) {
              continue; // TradeNetwork can handle it; skip creep shipment
            }
            tnBackfill = true;
          } catch (e) { /* fall through */ }
        }
        // Choose supplier colonies in this sector with available > buffer, split across several until filled
        const suppliers = this.sectorColonies
          .filter(c => c.name != entry.colony) // don't ship from destination to itself
          .map(c => {
            const available = (c.assets[resource] as number) || 0;
            const buffer = this.getBuffer(resource);
            const sendable = Math.max(0, available - buffer);
            return { colony: c, sendable };
          })
          .filter(x => x.sendable > 0)
          .sort((a, b) => b.sendable - a.sendable);

        for (const sup of suppliers) {
          if (requested <= 0) break;
          const amt = Math.min(requested, sup.sendable);
          if (amt > 0) {
            shipments.push({src: sup.colony.name, dest: entry.colony, resource, amount: amt, tnBackfill});
            requested -= amt;
          }
        }
      }
    }
    // Sort by proximity from anchor colony
    const sorted = _.sortBy(shipments, (s: Shipment) =>
      Game.map.getRoomLinearDistance(this.colony.room.name, Overmind.colonies[s.dest]?.room.name || s.dest));
    this.memory.queue = sorted;
  }

  private handleTransporter(creep: Zerg): void {
    const mem = creep.memory as any;
    if (mem.shipment && mem.shipment.amount <= 0) delete mem.shipment;
    const shipment = this.assignOrContinueShipment(creep);
    if (!shipment) {
      if (_.sum(creep.carry) > 0) {
        const target = this.colony.storage || this.colony.terminal;
        if (target) creep.task = Tasks.transferAll(target);
      } else {
        const spot = this.colony.storage?.pos || this.colony.pos;
        creep.park(spot);
      }
      return;
    }
    const destColony = Overmind.colonies[shipment.dest];
    const poolEntry = (PoolAPI as any).pool?.[shipment.dest] as { storageId?: Id<StructureStorage> } | undefined;
    const hintedStorage = poolEntry?.storageId ? (Game.getObjectById(poolEntry.storageId) as StructureStorage | null) : null;
    const dest = (hintedStorage || destColony?.storage || destColony?.terminal);
    if (!destColony || !dest) {
      delete mem.shipment; // invalid destination
      return;
    }
    const carrying = creep.carry[shipment.resource] || 0;
    if (carrying > 0) {
      creep.task = Tasks.transfer(dest, shipment.resource);
      if (carrying >= (mem.shipment?.amount || 0)) {
        mem.shipment.amount = 0;
      }
    } else {
      const srcColony = Overmind.colonies[shipment.src];
      const src = srcColony?.storage || srcColony?.terminal;
      if (!src) { delete mem.shipment; return; }
      const amount = Math.min(shipment.amount, creep.carryCapacity);
      creep.task = Tasks.withdraw(src, shipment.resource, amount);
    }
  }

  private assignOrContinueShipment(creep: Zerg): Shipment | undefined {
    const mem = creep.memory as any;
    if (mem.shipment && mem.shipment.amount > 0) {
      return mem.shipment as Shipment;
    }
    const next = (this.memory.queue || []).shift();
    if (next) {
      const cap = creep.carryCapacity - _.sum(creep.carry);
      const assignAmt = Math.min(cap, next.amount);
      mem.shipment = {src: next.src, dest: next.dest, resource: next.resource, amount: assignAmt, tnBackfill: next.tnBackfill} as Shipment;
      if (next.amount - assignAmt > 0) {
        (this.memory.queue as Shipment[]).unshift({src: next.src, dest: next.dest, resource: next.resource, amount: next.amount - assignAmt, tnBackfill: next.tnBackfill});
      }
      return mem.shipment;
    }
    return undefined;
  }
}

export default SectorLogisticsOverlord;

interface Shipment {
  src: string; // source colony name
  dest: string; // destination colony name
  resource: ResourceConstant;
  amount: number; // remaining amount to ship
  tnBackfill?: boolean;
}
