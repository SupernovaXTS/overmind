import {Assets, Colony} from '../Colony';
import {Cartographer} from '../utilities/Cartographer';
import {SectorLogisticsOverlord} from '../overlords/logistics/sectorLogistics';
import {SectorLogistics} from '../logistics/SectorLogistics';
import {mergeSum} from '../utilities/utils';
import {ALL_ZERO_ASSETS} from '../resources/map_resources';

/**
 * Represents a 10x10 Screeps map sector containing one or more of our colonies,
 * and owns the sector-level logistics overlord.
 */
export class Sector {
  key: string;              // e.g., E1N3
  colonies: Colony[];       // member colonies
  anchor: Colony;           // chosen representative colony
  overlord: SectorLogisticsOverlord | undefined;

  constructor(key: string, colonies: Colony[]) {
    this.key = key;
    this.colonies = colonies.slice();
    
    // Parse sector key to get sector bounds (e.g., "E1N3" = E10-19, N30-39)
    const re = /^([WE])(\d+)([NS])(\d+)$/;
    const m = re.exec(key);
    if (!m) {
      // Fallback if key doesn't parse: choose by highest RCL
      this.anchor = colonies.slice().sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name))[0];
    } else {
      // Calculate sector center coordinates
      const sectorX = Number(m[2]) * 10;
      const sectorY = Number(m[4]) * 10;
      const centerX = sectorX + 5;
      const centerY = sectorY + 5;
      
      // Choose anchor: prefer colony closest to sector center, break ties by highest RCL
      this.anchor = colonies.slice().sort((a, b) => {
        const aCoords = Cartographer.getRoomCoordinates(a.room.name);
        const bCoords = Cartographer.getRoomCoordinates(b.room.name);
        const aDist = Math.abs(aCoords.x - centerX) + Math.abs(aCoords.y - centerY);
        const bDist = Math.abs(bCoords.x - centerX) + Math.abs(bCoords.y - centerY);
        // Closer to center wins; if tied, higher RCL wins; if still tied, lexicographic
        return (aDist - bDist) || (b.level - a.level) || a.name.localeCompare(b.name);
      })[0];
    }
    
    // Don't create sector logistics overlord if anchor colony is in bootstrap mode
    // Bootstrap colonies should focus on their own infrastructure first
    if (!this.anchor.state.bootstrapping) {
      this.overlord = new SectorLogisticsOverlord(this.anchor, this.colonies);
    }
    
    // Set sector reference on each colony
    for (const colony of this.colonies) {
      (colony as any).sector = this;
    }
  }

  static keyFor(colony: Colony): string {
    return Cartographer.getSectorKey(colony.room.name);
  }

  /**
   * Get the total assets across all colonies in the sector
   */
  get assets(): Assets {
    const allColonyAssets = this.colonies.map(colony => colony.assets);
    return mergeSum([...allColonyAssets, ALL_ZERO_ASSETS]) as Assets;
  }

  refresh(): void {
    // Overlord handles its own refresh and membership sync to live Overmind.colonies
    if (this.overlord) {
      this.overlord.refresh();
    }
  }

  init(): void {
    if (this.overlord) {
      this.overlord.init();
    }
  }

  run(): void {
    // Publish each colony's unfulfilled requests into the central pool
    for (const colony of this.colonies) {
      try { new SectorLogistics(colony).publishUnfulfilledRequests(); } catch (e) { /* noop */ }
    }
    if (this.overlord) {
      this.overlord.run();
    }
  }
}

export default Sector;
