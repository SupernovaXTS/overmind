import {log} from '../console/log';

/**
 * Manages account-level resources (pixels and CPU unlocks) including automatic
 * generation, buying, selling, and usage based on configurable thresholds.
 */
export class AccountResources {
	private trader: IIntershardTradeNetwork;

	settings = {
		pixelGenerationEnabled: true,
		tradePixels: true,
		tradeCPUUnlocks: false,
		pixel: {
			min: 590,           // Minimum pixels to maintain in account
			max: 500,           // Maximum pixels before selling excess
			buyThreshold: 50,   // Buy pixels when below this amount
			sellThreshold: 500, // Sell pixels when above this amount
		},
		cpuUnlock: {
			min: 14,            // Minimum CPU unlocks to keep (reserve for emergencies)
			max: 28,            // Maximum CPU unlocks before selling excess
			buyThreshold: 5,    // Buy CPU unlocks when below this amount
			sellThreshold: 15,  // Sell CPU unlocks when above this amount
		},
	};

	constructor(trader: IIntershardTradeNetwork) {
		this.trader = trader;
	}

	/**
	 * Generates a pixel if bucket is full and conditions are met
	 */
	generatePixel(): boolean {
		if (!this.settings.pixelGenerationEnabled) {
			return false;
		}
		if (Game.cpu.bucket === 10000 && Game.shard.name !== 'shard3' && Game.cpu.generatePixel) {
			const result = Game.cpu.generatePixel();
			if (result === OK) {
				log.info('Generating pixel...');
				return true;
			}
		}
		return false;
	}

	/**
	 * Attempts to buy pixels from the intershard market
	 */
	buyPixel(amount: number): number {
		if (!this.settings.tradePixels) {
			return NO_ACTION;
		}

		const currentPixels = Game.resources[PIXEL] || 0;
		if (currentPixels >= this.settings.pixel.buyThreshold) {
			return NO_ACTION;
		}

		const amountToBuy = Math.min(amount, this.settings.pixel.max - currentPixels);
		if (amountToBuy <= 0) {
			return NO_ACTION;
		}

		log.info(`Attempting to buy ${amountToBuy} pixels. Current: ${currentPixels}`);
		const result = this.trader.buy(PIXEL, amountToBuy, {preferDirect: true});

		if (result === OK) {
			log.info(`Successfully initiated pixel purchase: ${amountToBuy}`);
		} else if (result !== NO_ACTION) {
			log.warning(`Failed to buy pixels. Error: ${result}`);
		}

		return result;
	}

	/**
	 * Attempts to sell pixels to the intershard market
	 */
	sellPixel(amount: number): number {
		if (!this.settings.tradePixels) {
			return NO_ACTION;
		}

		const currentPixels = Game.resources[PIXEL] || 0;
		if (currentPixels <= this.settings.pixel.sellThreshold) {
			return NO_ACTION;
		}

		const amountToSell = Math.min(amount, currentPixels - this.settings.pixel.min);
		if (amountToSell <= 0) {
			return NO_ACTION;
		}

		log.info(`Attempting to sell ${amountToSell} pixels. Current: ${currentPixels}`);
		const result = this.trader.sell(PIXEL, amountToSell, {preferDirect: true});

		if (result === OK) {
			log.info(`Successfully initiated pixel sale: ${amountToSell}`);
		} else if (result !== NO_ACTION) {
			log.warning(`Failed to sell pixels. Error: ${result}`);
		}

		return result;
	}

	/**
	 * Handles automatic pixel generation and trading
	 */
	handlePixel(): void {
		// Generate pixel if possible
		this.generatePixel();

		if (!this.settings.tradePixels) {
			return;
		}

		const currentPixels = Game.resources[PIXEL] || 0;

		// Auto-buy if below threshold
		if (currentPixels < this.settings.pixel.buyThreshold) {
			const deficit = this.settings.pixel.max - currentPixels;
			this.buyPixel(deficit);
		}
		// Auto-sell if above threshold
		else if (currentPixels > this.settings.pixel.sellThreshold) {
			const excess = currentPixels - this.settings.pixel.min;
			this.sellPixel(excess);
		}
	}

	/**
	 * Attempts to buy CPU unlocks from the intershard market
	 */
	buyCPUUnlock(amount: number): number {
		if (!this.settings.tradeCPUUnlocks) {
			return NO_ACTION;
		}

		const currentUnlocks = Game.resources[CPU_UNLOCK] || 0;
		if (currentUnlocks >= this.settings.cpuUnlock.buyThreshold) {
			return NO_ACTION;
		}

		const amountToBuy = Math.min(amount, this.settings.cpuUnlock.max - currentUnlocks);
		if (amountToBuy <= 0) {
			return NO_ACTION;
		}

		log.info(`Attempting to buy ${amountToBuy} CPU unlocks. Current: ${currentUnlocks}`);
		const result = this.trader.buy(CPU_UNLOCK, amountToBuy, {preferDirect: true});

		if (result === OK) {
			log.info(`Successfully initiated CPU unlock purchase: ${amountToBuy}`);
		} else if (result !== NO_ACTION) {
			log.warning(`Failed to buy CPU unlocks. Error: ${result}`);
		}

		return result;
	}

	/**
	 * Attempts to sell CPU unlocks to the intershard market
	 */
	sellCPUUnlock(amount: number): number {
		if (!this.settings.tradeCPUUnlocks) {
			return NO_ACTION;
		}

		const currentUnlocks = Game.resources[CPU_UNLOCK] || 0;
		if (currentUnlocks <= this.settings.cpuUnlock.sellThreshold) {
			return NO_ACTION;
		}

		const amountToSell = Math.min(amount, currentUnlocks - this.settings.cpuUnlock.min);
		if (amountToSell <= 0) {
			return NO_ACTION;
		}

		log.info(`Attempting to sell ${amountToSell} CPU unlocks. Current: ${currentUnlocks}`);
		const result = this.trader.sell(CPU_UNLOCK, amountToSell, {preferDirect: true});

		if (result === OK) {
			log.info(`Successfully initiated CPU unlock sale: ${amountToSell}`);
		} else if (result !== NO_ACTION) {
			log.warning(`Failed to sell CPU unlocks. Error: ${result}`);
		}

		return result;
	}

	/**
	 * Uses a CPU unlock to increase CPU limit for 24 hours
	 */
	useCPUUnlock(count: number = 1): boolean {
		const currentUnlocks = Game.resources[CPU_UNLOCK] || 0;

		if (currentUnlocks < count) {
			log.warning(`Insufficient CPU unlocks. Have: ${currentUnlocks}, Need: ${count}`);
			return false;
		}

		const result = Game.cpu.unlock();
		if (result === OK) {
			log.info(`CPU unlock used successfully. Remaining: ${currentUnlocks - 1}`);
			return true;
		} else {
			log.warning(`Failed to use CPU unlock. Error code: ${result}`);
			return false;
		}
	}

	/**
	 * Handles automatic CPU unlock trading and usage
	 */
	handleCPUUnlock(): void {
		const currentUnlocks = Game.resources[CPU_UNLOCK] || 0;

		// Auto-buy if below threshold and trading is enabled
		if (this.settings.tradeCPUUnlocks && currentUnlocks < this.settings.cpuUnlock.buyThreshold) {
			const deficit = this.settings.cpuUnlock.max - currentUnlocks;
			this.buyCPUUnlock(deficit);
		}
		// Auto-sell if above threshold and trading is enabled
		else if (this.settings.tradeCPUUnlocks && currentUnlocks > this.settings.cpuUnlock.sellThreshold) {
			const excess = currentUnlocks - this.settings.cpuUnlock.min;
			this.sellCPUUnlock(excess);
		}

		// Auto-use CPU unlock if bucket is consistently high and we need more CPU
		if (Game.cpu.bucket >= 9500 && Game.cpu.limit < 500) {
			const avgCPU = Memory.stats?.persistent?.avgCPU || 0;
			if (avgCPU > Game.cpu.limit * 0.95 && currentUnlocks > this.settings.cpuUnlock.min + 2) {
				log.info(`CPU usage high (${avgCPU}/${Game.cpu.limit}), using CPU unlock...`);
				this.useCPUUnlock();
			}
		}
	}

	/**
	 * Main method that runs the entire account resources management system.
	 * Handles both pixel and CPU unlock management in a single call.
	 */
	main(): void {
		this.handlePixel();
		this.handleCPUUnlock();
	}

}