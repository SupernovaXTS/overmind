/**
 * Logger module for Screeps (TypeScript)
 * Provides structured logging with different severity levels, formatting, and memory persistence.
 */

const TIME_OFFSET = 540; // UTC time offset. Adjust this to your region
const MAX_LOG_NUM = 100;
const NOTIFY_INTERVAL = 60;

const PATH: Record<string, string> = {
	jaysee: "http://jayseegames.localhost:8080/(http://jayseegames.com:21025)",
	shardSeason: "https://screeps.com/season",
	DEFAULT: "https://screeps.com/a",
	thunderdrone: "http://localhost:8080/(https://server.pandascreeps.com/)",
};

const LEVEL_NAMES = [
	"FATAL",
	"ERROR",
	"WARN",
	"ALERT",
	"INFO",
	"NOTIFY",
	"DEBUG",
	"TRACE",
] as const;

export const LOG_LEVELS = {
	FATAL: 0,
	ERROR: 1,
	WARN: 2,
	ALERT: 3,
	INFO: 4,
	NOTIFY: 5,
	DEBUG: 6,
	TRACE: 7,
} as const;

const DEFAULT_LOG_LEVEL = LOG_LEVELS.INFO;
const NOTIFY_LOG_LEVEL = LOG_LEVELS.WARN;

const LEVEL_COLORS: Record<string, string> = {
	FATAL: "#C0392B",
	ERROR: "#B22222",
	WARN: "#B8860B",
    ALERT: "#FF8C00",
	INFO: "#0055AA",
	NOTIFY: "#008B8B",
	DEBUG: "#228B22",
	TRACE: "#555555",
	DEFAULT: "#dddddd",
};

export interface LogEntry {
	level: number;
	message: string | (() => string);
	timestamp: number;
	tick: number;
	roomName?: string;
	memory?: boolean;
	notify?: boolean;
}

export interface LoggerOptions {
	level?: number;
	limit?: number;
	format?: (name: string, entry: LogEntry) => string;
	notifyCallback?: (entry: LogEntry) => boolean;
	memoryCallback?: (entry: LogEntry) => boolean;
}

export class Logger {
	name: string;
	level: number;
	limit: number;
	format: (entry: LogEntry) => string;
	notifyCallback: (entry: LogEntry) => boolean;
	memoryCallback: (entry: LogEntry) => boolean;

	constructor(name: string, options: LoggerOptions = {}) {
		this.name = name;
		this.level = options.level ?? DEFAULT_LOG_LEVEL;
		this.limit = options.limit ?? MAX_LOG_NUM;
		this.format =
			options.format && typeof options.format === "function"
				? (entry) => options.format!(name, entry)
				: (entry) => Logger.defaultFormat(name, entry);
		this.notifyCallback =
			options.notifyCallback ?? Logger.defaultNotifyCallback;
		this.memoryCallback =
			options.memoryCallback ?? Logger.defaultMemoryCallback;
	}

	static setStream(names?: string | string[]): void {
		if (!Memory._logs) Memory._logs = {};
		if (names === undefined) {
			delete Memory._logs._stream;
			return;
		}
		if (typeof names === "string") names = [names];
		Memory._logs._stream = names;
	}

	static getStreamTarget(): string[] | undefined {
		if (!Memory._logs) Memory._logs = {};
		return Memory._logs._stream;
	}

	static clearAll(): void {
		if (!Memory._logs) return;
		for (const key in Memory._logs) {
			if (key !== "._stream") {
				delete Memory._logs[key];
			}
		}
	}

	static getReplayLink(
		roomName: string,
		tick: number = Game.time,
		msg = "replay"
	): string {
		const front = PATH[Game.shard.name] || PATH["DEFAULT"];
		return `<a href='${front}/#!/history/${Game.shard.name}/${roomURLescape(
			roomName
		)}?t=${tick}'>${msg}</a>`;
	}

	static getRoomLink(roomName: string): string {
		const url = getRoomUrl(roomName);
		return `<a href="${url}" target="_blank">${roomName}</a>`;
	}

	static defaultFormat(name: string, entry: LogEntry): string {
		const { level, message, timestamp, tick = Game.time, roomName } = entry;
		const formattedTime = getFormattedTime(timestamp);
		const levelName = LEVEL_NAMES[level];
		const levelNameFormatted = levelName.padEnd(5, " ");
		const nameFormatted = name.padEnd(10, " ");
		let result = `[${formattedTime}] [${tick}] [${levelNameFormatted}] [${nameFormatted}] [${
			typeof message === "function" ? message() : message
		}]`;
		if (roomName) {
			const roomLink = Logger.getRoomLink(roomName);
			result += ` [${roomLink}]`;
			const replayLink = Logger.getReplayLink(roomName, tick);
			result += ` [${replayLink}]`;
		}
		const color = LEVEL_COLORS[levelName] || LEVEL_COLORS["DEFAULT"];
		return getColoredText(result, color);
	}

	static defaultMemoryCallback(entry: LogEntry): boolean {
		return entry.level <= LOG_LEVELS.INFO;
	}

	static defaultNotifyCallback(entry: LogEntry): boolean {
		return entry.level <= LOG_LEVELS.WARN;
	}

	get memory(): any {
		Memory._logs = Memory._logs || {};
		Memory._logs[this.name] = Memory._logs[this.name] || {};
		return Memory._logs[this.name];
	}

	get logs(): Record<number, LogEntry> {
		this.memory.logs = this.memory.logs || {};
		return this.memory.logs || {};
	}

	fatal(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.FATAL,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
	error(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.ERROR,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
	warn(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.WARN,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
    alert(message: string | (() => string), options: Partial<LogEntry> = {}): void {
		this.log({
			level: LOG_LEVELS.ALERT,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
    
	info(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.INFO,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
	notify(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.NOTIFY,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
	debug(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.DEBUG,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}
	trace(
		message: string | (() => string),
		options: Partial<LogEntry> = {}
	): void {
		this.log({
			level: LOG_LEVELS.TRACE,
			message,
			timestamp:
				typeof options.timestamp === "number" ? options.timestamp : Date.now(),
			tick: typeof options.tick === "number" ? options.tick : Game.time,
			roomName: options.roomName,
			memory: options.memory,
			notify: options.notify,
		});
	}

	print(): void {
		let num = 0;
		const currentIndex = this.memory.index;
		if (currentIndex === undefined) return;
		let index = currentIndex;
		let result = "";
		do {
			const entry = this.logs[index];
			index = (index + 1) % this.limit;
			if (!entry) continue;
			num++;
			const text = this.format(entry);
			result += "#" + String(num).padStart(2, "0") + text + "<br>";
		} while (index !== currentIndex);
		console.log(result);
	}

	clear(): void {
		if (!Memory._logs) return;
		delete Memory._logs[this.name];
	}

	log(entry: LogEntry): void {
		if (
			Logger.getStreamTarget() &&
			!Logger.getStreamTarget()?.includes(this.name)
		)
			return;
		if (!entry || entry.level === undefined || entry.level > this.getLevel())
			return;
		if (typeof entry.message === "function") entry.message = entry.message();
		entry.timestamp = Date.now();
		entry.tick = entry.tick || Game.time;
		const formattedLog = this.format(entry);
		console.log(formattedLog);
		if (entry.notify === undefined) entry.notify = this.notifyCallback(entry);
		if (entry.memory === undefined) entry.memory = this.memoryCallback(entry);
		if (entry.memory) {
			if (this.memory.index === undefined) this.memory.index = 0;
			this.logs[this.memory.index] = entry;
			this.memory.index = (this.memory.index + 1) % this.limit;
		}
		if (entry.notify) {
			Game.notify(formattedLog, NOTIFY_INTERVAL);
		}
	}

	setLevel(level: number): void {
		this.level = level;
	}

	getLevel(): number {
		return this.level;
	}
}

function roomURLescape(roomName: string): string {
	const mapping: Record<string, string> = {
		N: "%4E",
		S: "%53",
		E: "%45",
		W: "%57",
	};
	let out = "";
	for (let i = 0; i < roomName.length; i++) {
		const c = roomName[i];
		out += mapping[c] || c;
	}
	return out;
}

function getRoomUrl(roomName: string): string {
	const front = PATH[Game.shard.name] || PATH["DEFAULT"];
	return front + `/#!/room/${Game.shard.name}/${roomURLescape(roomName)}`;
}

function getFormattedTime(timestamp: number): string {
	function pad(number: number): string {
		return String(number).padStart(2, "0");
	}
	const now = new Date(timestamp);
	const utcNow = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
	const koreaNow = utcNow + TIME_OFFSET * 60 * 1000;
	const koreaDate = new Date(koreaNow);
	const month = pad(koreaDate.getMonth() + 1);
	const date = pad(koreaDate.getDate());
	const hours = pad(koreaDate.getHours());
	const minutes = pad(koreaDate.getMinutes());
	return `${koreaDate.getFullYear()}.${month}.${date}. ${hours}:${minutes}`;
}

function getColoredText(text: string, color: string): string {
	return `<span style = "color: ${color}">${text}</span>`;
}
