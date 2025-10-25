import {log} from '../console/log';
import {PTR} from '../~settings';

interface AccountResourcesSettings {
	pixelGenerationEnabled: boolean;
	tradePixels: boolean;
	tradeCPUUnlocks: boolean;
	pixel: {
		min: number;
		max: number;
		buyThreshold: number;
		sellThreshold: number;
	};
	cpuUnlock: {
		min: number;
		max: number;
		buyThreshold: number;
		sellThreshold: number;
	};
}

/**
 * Manages account-level resources (pixels and CPU unlocks) including automatic
 * generation, buying, selling, and usage based on configurable thresholds.
 */
export class AccountResources {
	private trader: IIntershardTradeNetwork;

	private readonly defaultSettings: AccountResourcesSettings = {
		pixelGenerationEnabled: true,
		tradePixels: true,
		tradeCPUUnlocks: false,
		pixel: {
			min: 500,           // Minimum pixels to maintain in account
			max: 10000,           // Maximum pixels before selling excess
			buyThreshold: 500,   // Buy pixels when below this amount
			sellThreshold: 10000, // Sell pixels when above this amount
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
		this.initializeMemorySettings();
	}

	/**
	 * Initialize memory settings with defaults if not present
	 */
	private initializeMemorySettings(): void {
		if (!Memory.settings.accountResources) {
			Memory.settings.accountResources = {};
		}
		
		const memSettings = Memory.settings.accountResources;
		
		// Initialize top-level settings
		if (memSettings.pixelGenerationEnabled === undefined) {
			memSettings.pixelGenerationEnabled = this.defaultSettings.pixelGenerationEnabled;
		}
		if (memSettings.tradePixels === undefined) {
			memSettings.tradePixels = this.defaultSettings.tradePixels;
		}
		if (memSettings.tradeCPUUnlocks === undefined) {
			memSettings.tradeCPUUnlocks = this.defaultSettings.tradeCPUUnlocks;
		}
		
		// Initialize pixel settings
		if (!memSettings.pixel) {
			memSettings.pixel = {};
		}
		if (memSettings.pixel.min === undefined) {
			memSettings.pixel.min = this.defaultSettings.pixel.min;
		}
		if (memSettings.pixel.max === undefined) {
			memSettings.pixel.max = this.defaultSettings.pixel.max;
		}
		if (memSettings.pixel.buyThreshold === undefined) {
			memSettings.pixel.buyThreshold = this.defaultSettings.pixel.buyThreshold;
		}
		if (memSettings.pixel.sellThreshold === undefined) {
			memSettings.pixel.sellThreshold = this.defaultSettings.pixel.sellThreshold;
		}
		
		// Initialize CPU unlock settings
		if (!memSettings.cpuUnlock) {
			memSettings.cpuUnlock = {};
		}
		if (memSettings.cpuUnlock.min === undefined) {
			memSettings.cpuUnlock.min = this.defaultSettings.cpuUnlock.min;
		}
		if (memSettings.cpuUnlock.max === undefined) {
			memSettings.cpuUnlock.max = this.defaultSettings.cpuUnlock.max;
		}
		if (memSettings.cpuUnlock.buyThreshold === undefined) {
			memSettings.cpuUnlock.buyThreshold = this.defaultSettings.cpuUnlock.buyThreshold;
		}
		if (memSettings.cpuUnlock.sellThreshold === undefined) {
			memSettings.cpuUnlock.sellThreshold = this.defaultSettings.cpuUnlock.sellThreshold;
		}
	}

	/**
	 * Get current settings from memory with fallback to defaults
	 */
	get settings(): AccountResourcesSettings {
		const memSettings = Memory.settings.accountResources || {};
		return {
			pixelGenerationEnabled: memSettings.pixelGenerationEnabled ?? this.defaultSettings.pixelGenerationEnabled,
			tradePixels: memSettings.tradePixels ?? this.defaultSettings.tradePixels,
			tradeCPUUnlocks: memSettings.tradeCPUUnlocks ?? this.defaultSettings.tradeCPUUnlocks,
			pixel: {
				min: memSettings.pixel?.min ?? this.defaultSettings.pixel.min,
				max: memSettings.pixel?.max ?? this.defaultSettings.pixel.max,
				buyThreshold: memSettings.pixel?.buyThreshold ?? this.defaultSettings.pixel.buyThreshold,
				sellThreshold: memSettings.pixel?.sellThreshold ?? this.defaultSettings.pixel.sellThreshold,
			},
			cpuUnlock: {
				min: memSettings.cpuUnlock?.min ?? this.defaultSettings.cpuUnlock.min,
				max: memSettings.cpuUnlock?.max ?? this.defaultSettings.cpuUnlock.max,
				buyThreshold: memSettings.cpuUnlock?.buyThreshold ?? this.defaultSettings.cpuUnlock.buyThreshold,
				sellThreshold: memSettings.cpuUnlock?.sellThreshold ?? this.defaultSettings.cpuUnlock.sellThreshold,
			},
		};
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
		if (PTR) {
			return NO_ACTION; // Don't trade intershard resources on PTR
		}
		
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
	 * Buys exactly x pixels at the cheapest price available on the market.
	 * This function directly queries market orders and purchases from the cheapest seller.
	 * @param amount - Number of pixels to buy
	 * @returns ScreepsReturnCode - OK if successful, error code otherwise
	 */
	buyPixelsAtCheapestPrice(amount: number): ScreepsReturnCode {
		if (amount <= 0) {
			log.warning(`Invalid pixel amount: ${amount}`);
			return ERR_INVALID_ARGS;
		}

		// Get all sell orders for pixels, sorted by price (lowest first)
		const orders = Game.market.getAllOrders({
			type: ORDER_SELL,
			resourceType: PIXEL
		});

		if (!orders || orders.length === 0) {
			log.warning(`No pixel sell orders available on the market`);
			return ERR_NOT_FOUND;
		}

		// Sort by price ascending (cheapest first)
		const sortedOrders = _.sortBy(orders, (order: Order) => order.price);

		let remainingAmount = amount;
		let totalCost = 0;
		const purchases: Array<{orderId: string, amount: number, price: number}> = [];

		// Calculate which orders to buy from
		for (const order of sortedOrders) {
			if (remainingAmount <= 0) break;

			const buyAmount = Math.min(remainingAmount, order.amount);
			const cost = buyAmount * order.price;

			purchases.push({
				orderId: order.id,
				amount: buyAmount,
				price: order.price
			});

			remainingAmount -= buyAmount;
			totalCost += cost;
		}

		// Check if we can afford it
		if (Game.market.credits < totalCost) {
			log.warning(`Insufficient credits to buy ${amount} pixels. Need: ${totalCost.toFixed(2)}, Have: ${Game.market.credits.toFixed(2)}`);
			return ERR_NOT_ENOUGH_RESOURCES;
		}

		// If not enough pixels are available, proceed to buy all available
		const insufficientSupply = remainingAmount > 0;
		if (insufficientSupply) {
			const available = amount - remainingAmount;
			if (available <= 0) {
				log.warning(`Not enough pixels available on market. No purchasable amount found.`);
				return ERR_NOT_ENOUGH_RESOURCES;
			}
			log.warning(`Not enough pixels available on market. Requested: ${amount}, Available: ${available}. Proceeding to buy available amount.`);
		}

		// Execute the purchases
		const plannedAmount = insufficientSupply ? (amount - remainingAmount) : amount;
		log.info(`Buying ${plannedAmount} pixels for ${totalCost.toFixed(2)} credits from ${purchases.length} order(s)`);
		
		let totalBought = 0;
		for (const purchase of purchases) {
			const result = Game.market.deal(purchase.orderId, purchase.amount);
			
			if (result === OK) {
				totalBought += purchase.amount;
				log.info(`Bought ${purchase.amount} pixels at ${purchase.price} credits/pixel from order ${purchase.orderId}`);
			} else {
				log.warning(`Failed to buy from order ${purchase.orderId}: ${result}`);
				// Continue trying other orders
			}
		}

		if (totalBought === amount) {
			log.info(`Successfully bought ${totalBought} pixels for ${totalCost.toFixed(2)} credits`);
			return OK;
		} else if (totalBought > 0) {
			log.warning(`Partially bought ${totalBought}/${amount} pixels`);
			return ERR_FULL; // Using this to indicate partial success
		} else {
			log.error(`Failed to buy any pixels`);
			return ERR_INVALID_TARGET;
		}
	}

	/**
	 * Attempts to sell pixels to the intershard market
	 */
	sellPixel(amount: number): number {
		if (PTR) {
			return NO_ACTION; // Don't trade intershard resources on PTR
		}
		
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
		if (PTR) {
			return NO_ACTION; // Don't trade intershard resources on PTR
		}
		
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
		if (PTR) {
			return NO_ACTION; // Don't trade intershard resources on PTR
		}
		
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
