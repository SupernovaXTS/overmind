import {Colony} from '../Colony';
import {LogisticsRequest} from './LogisticsNetwork';

interface MergedRequest {
	colony: Colony;
	storage: StructureStorage | undefined;
	resourceRequests: { [resourceType: string]: number };
	totalRequests: number;
}

export class SectorLogistics {

	colony: Colony;

	constructor(colony: Colony) {
		this.colony = colony;
	}

	refresh(): void {
		// TODO: Implement refresh logic
	}

	init(): void {
		// TODO: Implement initialization logic
	}

	run(): void {
		// TODO: Implement run logic
	}

	/**
	 * Gets all unfulfilled requests from the colony's logistics network and merges them
	 * into a single request coming from the colony's storage
	 */
	getUnfulfilledRequests(): MergedRequest {
		const mergedRequest: MergedRequest = {
			colony          : this.colony,
			storage         : this.colony.storage,
			resourceRequests: {},
			totalRequests   : 0
		};

		if (!this.colony.logisticsNetwork || !this.colony.logisticsNetwork.requests) {
			return mergedRequest;
		}

		// Iterate through all logistics requests
		for (const request of this.colony.logisticsNetwork.requests) {
			// Only consider input requests (positive amounts) that are unfulfilled
			if (request.amount > 0) {
				const resourceType = request.resourceType;
				
				// Skip 'all' resource type requests as they can't be meaningfully merged
				if (resourceType === 'all') {
					continue;
				}

				// Calculate the effective unfulfilled amount considering targeting transporters
				const predictedAmount = this.getEffectiveRequestAmount(request);
				
				if (predictedAmount > 0) {
					// Merge into the resource requests
					if (!mergedRequest.resourceRequests[resourceType]) {
						mergedRequest.resourceRequests[resourceType] = 0;
					}
					mergedRequest.resourceRequests[resourceType] += predictedAmount;
					mergedRequest.totalRequests++;
				}
			}
		}

		return mergedRequest;
	}

	/**
	 * Helper method to get the effective amount of a request, accounting for
	 * transporters already targeting it
	 */
	private getEffectiveRequestAmount(request: LogisticsRequest): number {
		// Start with the base request amount
		let effectiveAmount = request.amount;

		// If there are transporters targeting this request, reduce the effective amount
		if (request.target.targetedBy && request.target.targetedBy.length > 0) {
			// Sum up the carry capacity of targeting transporters
			let incomingAmount = 0;
			for (const transporterName of request.target.targetedBy) {
				const transporter = Game.creeps[transporterName];
				if (transporter && request.resourceType !== 'all') {
					incomingAmount += transporter.store[request.resourceType as ResourceConstant] || 0;
				}
			}
			effectiveAmount = Math.max(0, effectiveAmount - incomingAmount);
		}

		return effectiveAmount;
	}

}
