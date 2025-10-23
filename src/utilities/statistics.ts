// Extend StructureController at runtime with helper methods for RCL progress estimation
const _structureController = StructureController.prototype as any;
const structureController = _structureController;
structureController.updateRclAvg = function (): void {
    if (this.level === 8) return;
    const roomMem: any = this.room && this.room.memory ? this.room.memory : undefined;
    if (!roomMem) return;
    roomMem._rclStats = roomMem._rclStats || {};
    const stats = roomMem._rclStats as { lastProgress?: number; avgTick?: number };
    if (typeof stats.lastProgress === 'number' && this.level <= (this.room.controller?.level || 0)) {
        const diff: number = this.progress - stats.lastProgress;
        stats.avgTick = MM_AVG(diff, stats.avgTick, 1000);
    }
    stats.lastProgress = this.progress;
};

structureController.estimateInTicks = function (): number | undefined {
    const roomMem: any = this.room && this.room.memory ? this.room.memory : undefined;
    const avg = roomMem?._rclStats?.avgTick;
    if (typeof avg !== 'number' || avg <= 0 || !isFinite(avg)) return undefined;
    const remaining = this.progressTotal - this.progress;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / avg);
};

structureController.estimate = function (): Date | undefined {
    const ticks = this.estimateInTicks();
    if (typeof ticks !== 'number') return undefined;
    return estimate(ticks);
};

export function estimate(ticks: number, tickLength: number = getAvgTickLength()): Date {
    const seconds = tickDelay(ticks, tickLength);
    return new Date(Date.now() + 1000 * seconds);
}

export function tickDelay(ticks: number, tickLength: number = getAvgTickLength()): number {
    return ticks * tickLength; // you'll need to measure tickLength (average time of a tick) yourself.
}
export const DEFAULT_AVG_SAMPLES = 1000;
export const MM_AVG = (n: number, p: number = n, s: number = DEFAULT_AVG_SAMPLES): number =>
    ((s - 1) * p + n) / s; // Modified moving average.
export const LANGUAGE = 'en-US';
export const TIMEZONE = 'America/New_York';
export const DATETIME_FORMATTER = new Intl.DateTimeFormat(LANGUAGE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
});

/**
 * Formats a room name as a clickable link for the Screeps console
 */
function roomLink(roomName: string): string {
    return `<a href="#!/room/${Game.shard.name}/${roomName}">${roomName}</a>`;
}

/**
 * Gets or computes the GCL average progress per tick from memory
 */
function getGclAverageTick(): number {
    if (!Memory.stats) (Memory as any).stats = {};
    if (!Memory.stats.persistent) Memory.stats.persistent = {} as any;
    const gclStats = (Memory.stats.persistent as any).gclStats as { lastProgress?: number; avgTick?: number } | undefined;
    
    if (!gclStats) {
        (Memory.stats.persistent as any).gclStats = { lastProgress: Game.gcl.progress, avgTick: 1 };
        return 1;
    }
    
    // Update GCL average if we have a previous reading
    if (typeof gclStats.lastProgress === 'number' && Game.gcl.progress > gclStats.lastProgress) {
        const diff = Game.gcl.progress - gclStats.lastProgress;
        gclStats.avgTick = MM_AVG(diff, gclStats.avgTick || 1, 1000);
    }
    gclStats.lastProgress = Game.gcl.progress;
    
    return gclStats.avgTick || 1;
}

export function progress(): string {
    const gclAvgTick = getGclAverageTick();
    const ticksTilGCL = (Game.gcl.progressTotal - Game.gcl.progress) / gclAvgTick;
    let str = `Time till GCL ${(Game.gcl.level + 1)}: ${DATETIME_FORMATTER.format(estimate(ticksTilGCL))} <progress value="${Game.gcl.progress}" max="${Game.gcl.progressTotal}"/> \n`;
    _(Game.rooms)
        .map('controller')
    .filter('my')
    .filter((c: any) => c.level < 8)
        // .each(c => console.log("Room: " + c.room.name + ", RCL: " + (c.level+1) + ", " + c.estimate()))
    .each((c: any) => {
            const roomName = c?.room?.name || 'unknown';
            const rcl = ((c?.level || 0) + 1);
            const etaVal = (typeof c?.estimate === 'function') ? c.estimate() : undefined;
            const etaStr = (etaVal instanceof Date) ? DATETIME_FORMATTER.format(etaVal) : 'n/a';
            const ctrl = c?.room?.controller;
            const progressVal = ctrl?.progress ?? 0;
            const progressTotal = ctrl?.progressTotal ?? 0;
            const avgEt = _.round(((c?.room?.memory as any)?._rclStats?.avgTick) ?? 0, 2);
            const progressHtml = `<progress value="${progressVal}" max="${progressTotal}"/>`;
            str += `Room: ${roomLink(roomName)}, RCL: ${rcl}, ${etaStr} ${progressHtml}, ${avgEt} e/t \n`;
        })
        .commit();
    return str;
}
import {ema} from './utils';

// Loose declarations to satisfy TS for optional console helpers present elsewhere
declare const _: any;
declare function first(arg: any): any;

/**
 * Record and maintain an exponential moving average of tick length (in seconds).
 * Stores results in Memory.stats.persistent.avgTickLengthSeconds and lastTickTimestamp.
 * Returns the updated average in seconds.
 */
export function recordAvgTickLength(window: number = 100, maxGapSeconds: number = 60): number {
    // Ensure persistent stats object exists
    if (!Memory.stats) (Memory as any).stats = {};
    if (!Memory.stats.persistent) Memory.stats.persistent = {} as any;

    const now = Date.now();
    const lastTs: number | undefined = (Memory.stats.persistent as any).lastTickTimestamp;

    if (lastTs && now > lastTs) {
        const dtMs = now - lastTs;
        // Ignore absurdly long gaps (likely global reset or shard stall)
        if (dtMs < maxGapSeconds * 1000) {
            const sampleSeconds = dtMs / 1000;
            const prevAvg: number | undefined = (Memory.stats.persistent as any).avgTickLengthSeconds;
            const nextAvg = ema(sampleSeconds, prevAvg, window);
            (Memory.stats.persistent as any).avgTickLengthSeconds = nextAvg;
        }
    }
    // Update last timestamp for next tick
    (Memory.stats.persistent as any).lastTickTimestamp = now;

    return ((Memory.stats.persistent as any).avgTickLengthSeconds) || 3;
}

/**
 * Get the current average tick length in seconds (defaults to 3 if unknown).
 */
export function getAvgTickLength(defaultSeconds: number = 3): number {
    const avg = (Memory.stats && Memory.stats.persistent && (Memory.stats.persistent as any).avgTickLengthSeconds) || undefined;
    return typeof avg === 'number' && avg > 0 ? avg : defaultSeconds;
}
