import {Colony} from '../Colony';
import {Cartographer} from '../utilities/Cartographer';
import {SectorLogisticsOverlord} from '../overlords/logistics/sectorLogistics';
import {SectorLogistics} from '../logistics/SectorLogistics';

/**
 * Represents a 10x10 Screeps map sector containing one or more of our colonies,
 * and owns the sector-level logistics overlord.
 */
export class Sector {
  key: string;              // e.g., E1N3
  colonies: Colony[];       // member colonies
  anchor: Colony;           // chosen representative colony
  overlord: SectorLogisticsOverlord;

  constructor(key: string, colonies: Colony[]) {
    this.key = key;
    this.colonies = colonies.slice();
    // Choose a stable anchor: highest RCL, break ties by name
    this.anchor = colonies.slice().sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name))[0];
    this.overlord = new SectorLogisticsOverlord(this.anchor, this.colonies);
    
    // Set sector reference on each colony
    for (const colony of this.colonies) {
      (colony as any).sector = this;
    }
  }

  static keyFor(colony: Colony): string {
    return Cartographer.getSectorKey(colony.room.name);
  }

  refresh(): void {
    // Overlord handles its own refresh and membership sync to live Overmind.colonies
    this.overlord.refresh();
  }

  init(): void {
    this.overlord.init();
  }

  run(): void {
    // Publish each colony's unfulfilled requests into the central pool
    for (const colony of this.colonies) {
      try { new SectorLogistics(colony).publishUnfulfilledRequests(); } catch (e) { /* noop */ }
    }
    this.overlord.run();
  }
}

export default Sector;
