import { TerminalNetworkV2 } from './TerminalNetwork_v2';
import { Colony } from '../Colony';

/**
 * Attempts to obtain a resource for a colony using the terminal network, then falls back to sector logistics if needed.
 * Returns true if either system can fulfill the request.
 */
export function obtainResourceWithFallback(
    requestor: Colony,
    resource: ResourceConstant,
    totalAmount: number,
    sectorLogistics: { canObtainResource: (requestor: Colony, resource: ResourceConstant, totalAmount: number, tolerance?: number) => boolean },
    tolerance?: number
): boolean {
    // Try terminal network first
    const tn = Overmind.terminalNetwork as TerminalNetworkV2;
    if (tn && tn.canObtainResource(requestor, resource, totalAmount)) {
        return true;
    }
    // Fallback to sector logistics
    if (sectorLogistics && typeof sectorLogistics.canObtainResource === 'function') {
        return sectorLogistics.canObtainResource(requestor, resource, totalAmount, tolerance);
    }
    return false;
}
