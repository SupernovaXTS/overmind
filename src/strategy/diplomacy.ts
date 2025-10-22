


export class Diplomacy {

}
export enum UserLevel {
    Enemy = 0,
    Neutral = 1,
    Friendly = 2,
    Ally = 3,
    TrustedAlly = 4,
}

export class User {
    private user: string;
    private level: UserLevel;
    private lastInteraction: number;
    constructor(user: string, level: UserLevel) {
        this.user = user;
        this.level = level;
        this.lastInteraction = 0;
    }
    public getUser(): string {
        return this.user;
    }
    public getLevel(): UserLevel {
        return this.level;
    }
    public setLevel(level: UserLevel): void {
        this.level = level;
    }
    public updateLastInteraction(tick: number): void {
        this.lastInteraction = tick;
    }
    public getLastInteraction(): number {
        return this.lastInteraction;
    }
    public isEnemy (): boolean {
        return this.level === UserLevel.Enemy;
    }
    public isNeutral (): boolean {
        return this.level >= UserLevel.Neutral;
    }
    public isFriendly (): boolean {
        return this.level >= UserLevel.Friendly;
    }
    public isAlly (): boolean {
        return this.level >= UserLevel.Ally;
    }
    public isTrustedAlly (): boolean {
        return this.level >= UserLevel.TrustedAlly;
    }
    public checkLevel(level: UserLevel): boolean {
        return this.level >= level;
    }
    public setTrustLevel(level: UserLevel): void {
        this.level = level;
    }
}

export class Contract implements ContractMemory {
    public user: string;
    public id: number;
    public uid: number;
    public code: number;
    public price: number;
    public ticks: number;
    public ticksToExpiry: number = 0;
    public dealId: string = "";
    constructor(
        user: string, id: number, 
        uid: number, code: number, 
        price: number, ticks: number, 
        ticksToExpiry: number, dealId: string) {
        this.user = user;
        this.id = id;
        this.uid = uid;
        this.code = code;
        this.price = price;
        this.ticks = ticks;
        this.ticksToExpiry = ticksToExpiry;
        this.dealId = dealId;
    }
    getUser(): string {
        return this.user;
    }
    getId(): number {
        return this.id;
    }
    getUid(): number {
        return this.uid;
    }
    getCode(): number {
        return this.code;
    }
    getPrice(): number {
        return this.price;
    }
    getTicks(): number {
        return this.ticks;
    }
    getTicksToExpiry(): number {
        return this.ticksToExpiry;
    }
}
export class Contracts implements ContractsMemory {
    checkMemory: boolean = false;
    lastCheck: number = 0;
    lastContractUid: number = 0;
    contracts: { [uid: number]: ContractMemory } = {};
    constructor() {
        this.checkMemory = false;
    }
    public getContract(uid: number): ContractMemory | null {
        if (this.contracts[uid]) {
            return this.contracts[uid];
        }
        return null;
    }
    public setContract(contract: ContractMemory): void {
        this.contracts[contract.uid] = contract;
    }
    public shouldRun(): boolean {
        return this.checkMemory;
    }
}
export interface ContractsMemory {
    checkMemory: boolean;
    lastCheck: number;
    lastContractUid: number;
    contracts: { [uid: number]: ContractMemory };
}
export interface ContractMemory {
    user: string;
    id: number;
    uid: number;
    code: number;
    price: number;
    ticks: number;
    ticksToExpiry: number;
    dealId: string;
}
export interface DiplomacyMemory {

}
export enum ContractCode {
    Request = 100,
    Accept = 200,
    Fulfill = 300,
    Cancel = 0,
}
