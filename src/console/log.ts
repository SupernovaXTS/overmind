import { Logger, LOG_LEVELS, LogEntry } from './screeps-logger';

export enum LogLevel {
	FATAL = LOG_LEVELS.FATAL,
	ERROR = LOG_LEVELS.ERROR,
	WARNING = LOG_LEVELS.WARN,
	ALERT = LOG_LEVELS.WARN, // ALERT mapped to WARN for compatibility
	INFO = LOG_LEVELS.INFO,
	DEBUG = LOG_LEVELS.DEBUG,
}

/**
 * Default debug level for log output
 */
export const LOG_LEVEL: number = LogLevel.INFO;

/**
 * Prepend log output with current tick number.
 */
export const LOG_PRINT_TICK: boolean = true;
export type LogMessage = string | object | (() => string);


const overmindFormat = (name: string, entry: LogEntry) => {
  return `(${entry.tick}) [${name}] [${entry.level}]: ${entry.message}`;
};

export const log = new Logger('OM', {
  level: LOG_LEVELS.NOTIFY,
  limit: 100,
  format: overmindFormat
});


export function debug(
  thing: { name: string; memory: any; pos: RoomPosition },
  ...args: any[]
) {
  if (thing.memory && thing.memory.debug) {
    log.debug(`${thing.name} @ ${thing.pos.print}: `, { roomName: thing.pos.roomName });
  }
}
/*
		// } catch (err) {
		console.log("Source mapping deprecated.");
		// }
	}

	get level(): LogLevel {
		return Memory.settings.log.level ?? LOG_LEVEL;
	}

	setLogLevel(value: LogLevel) {
		let changeValue = true;
		switch (value) {
			case LogLevel.ERROR:
				console.log(
					`Logging level set to ${value}. Displaying: ERROR.`
				);
				break;
			case LogLevel.WARNING:
				console.log(
					`Logging level set to ${value}. Displaying: ERROR, WARNING.`
				);
				break;
			case LogLevel.ALERT:
				console.log(
					`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT.`
				);
				break;
			case LogLevel.INFO:
				console.log(
					`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT, INFO.`
				);
				break;
			case LogLevel.DEBUG:
				console.log(
					`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT, INFO, DEBUG.`
				);
				break;
			default:
				console.log(
					`Invalid input: ${value}. Loging level can be set to integers between ` +
						LogLevel.ERROR +
						" and " +
						LogLevel.DEBUG +
						", inclusive."
				);
				changeValue = false;
				break;
		}
		if (changeValue) {
			Memory.settings.log.level = value;
		}
	}

	get showSource(): boolean {
		return Memory.settings.log.showSource ?? LOG_PRINT_LINES;
	}

	set showSource(value: boolean) {
		Memory.settings.log.showSource = value;
	}

	get showTick(): boolean {
		return Memory.settings.log.showTick ?? LOG_PRINT_TICK;
	}

	set showTick(value: boolean) {
		Memory.settings.log.showTick = value;
	}

	private _maxFileString: number = 0;

	trace(error: Error): Log {
		if (this.level >= LogLevel.ERROR && error.stack) {
			console.log(this.resolveStack(error.stack));
		}

		return this;
	}

	throw(e: Error) {
		console.log.apply(
			this,
			this.buildArguments(LogLevel.FATAL).concat([
				color(e.toString(), fatalColor),
			])
		);
	}

	private _log(level: LogLevel, args: LogMessage[]) {
		// console.log(`_log: ${typeof args}`);
		// args = _.flatten(args);
		for (let i = 0; i < args.length; i++) {
			// console.log(`_log: ${typeof args[i]} ${Array.isArray(args[i])}`);
			const argFunc = args[i];
			if (_.isFunction(argFunc)) {
				// console.log(`_log: argFunc: ${argFunc}`);
				const arg = <string | object>argFunc();
				args.splice(i, 1, arg);
			}
		}
		console.log.apply(
			this,
			this.buildArguments(level).concat([].slice.call(args))
		);
	}

	error(...args: LogMessage[]): undefined {
		if (this.level >= LogLevel.ERROR) {
			this._log(LogLevel.ERROR, args);
		}
		return undefined;
	}

	warning(...args: LogMessage[]): undefined {
		if (this.level >= LogLevel.WARNING) {
			this._log(LogLevel.WARNING, args);
		}
		return undefined;
	}

	alert(...args: LogMessage[]): undefined {
		if (this.level >= LogLevel.ALERT) {
			this._log(LogLevel.ALERT, args);
		}
		return undefined;
	}

	notify(message: string): undefined {
		this.alert(message);
		Game.notify(message);
		return undefined;
	}

	info(...args: LogMessage[]): undefined {
		if (this.level >= LogLevel.INFO) {
			this._log(LogLevel.INFO, args);
		}
		return undefined;
	}

	debug(...args: LogMessage[]) {
		if (this.level >= LogLevel.DEBUG) {
			this._log(LogLevel.DEBUG, args);
		}
	}

	debugCreep(
		creep: { name: string; memory: any; pos: RoomPosition },
		...args: LogMessage[]
	) {
		if (creep.memory && creep.memory.debug) {
			this.info(`${creep.name}@${creep.pos.print}: `, ...args);
		}
	}

	printObject(obj: any) {
		this._log(LogLevel.DEBUG, [JSON.stringify(obj)]);
	}

	getFileLine(upStack = 4): string {
		const stack = new Error("").stack;

		if (stack) {
			const lines = stack.split("\n");

			if (lines.length > upStack) {
				const originalLines = _.drop(lines, upStack).map(resolve);
				const hoverText = _.map(originalLines, "final").join("&#10;");
				return this.adjustFileLine(
					originalLines[0].final,
					tooltip(makeVSCLink(originalLines[0]), hoverText)
				);
			}
		}
		return "";
	}

	private buildArguments(level: LogLevel): string[] {
		const out: string[] = [];
		switch (level) {
			case LogLevel.ERROR:
				out.push(color("ERROR  ", "red"));
				break;
			case LogLevel.WARNING:
				out.push(color("WARNING", "orange"));
				break;
			case LogLevel.ALERT:
				out.push(color("ALERT  ", "yellow"));
				break;
			case LogLevel.INFO:
				out.push(color("INFO   ", "green"));
				break;
			case LogLevel.DEBUG:
				out.push(color("DEBUG  ", "gray"));
				break;
			case LogLevel.FATAL:
				out.push(color("FATAL  ", fatalColor));
				break;
			default:
				break;
		}
		if (this.showTick) {
			out.push(time());
		}
		if (this.showSource && level <= LogLevel.ERROR) {
			out.push(this.getFileLine());
		}
		return out;
	}

	private resolveStack(stack: string): string {
		if (!Log.sourceMap) {
			return stack;
		}

		return _.map(stack.split("\n").map(resolve), "final").join("\n");
	}

	private adjustFileLine(visibleText: string, line: string): string {
		const newPad = Math.max(visibleText.length, this._maxFileString);
		this._maxFileString = Math.min(newPad, LOG_MAX_PAD);

		return `|${_.padRight(
			line,
			line.length + this._maxFileString - visibleText.length,
			" "
		)}|`;
	}
}

if (LOG_LOAD_SOURCE_MAP) {
	Log.loadSourceMap();
}
*/