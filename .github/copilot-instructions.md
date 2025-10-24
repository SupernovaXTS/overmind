# Overmind - Screeps AI Development Guide

## Project Overview
Overmind is a mature, automated AI for the MMO programming game Screeps. It uses a Zerg/Starcraft-inspired architecture where **Overlords** orchestrate **Zerg** (creeps) within **Colonies** (rooms), coordinated by the **Overseer** via **Directives** (flag-based tasks).

**Core Architecture (Build → Init → Run phases):**
- `Overmind` (main singleton) orchestrates all colonies, refreshed every 20 ticks
- `Sector` aggregates colonies in a 10x10 map sector for inter-colony logistics
- `Colony` manages a single room + outposts (spawning, logistics, room planning)
- `Overlord` controls groups of creeps for specific tasks (mining, upgrading, defense)
- `Directive` wraps flags to dynamically spawn overlords and adapt to events
- `Zerg` wraps creeps with task system and movement logic
- `HiveCluster` groups related structures (CommandCenter, Hatchery, UpgradeSite)
- `Overseer` schedules directives/overlords and responds to threats

## Critical Development Patterns

### Lifecycle Phases (src/main.ts)
All major components follow a 4-phase cycle:
1. **Build** (`shouldBuild=true` or every 20 ticks): Instantiate game objects
2. **Refresh**: Update object references without full rebuild
3. **Init**: Handle spawning requests, register energy requests
4. **Run**: Execute actions (movement, harvesting, building)

Always implement: `refresh()`, `spawnMoarOverlords()`, `init()`, `run()`

### Memory Management
- **Use `Mem.wrap()`** for all memory access to handle defaults: `Mem.wrap(this.colony.memory, 'roomPlanner', getDefaultMemory)`
- Memory keys use compressed constants (e.g., `MEM.TICK`, `MEM.COLONY`) - see `src/declarations/memory.d.ts`
- Run `Mem.clean()` to garbage collect dead creeps/rooms
- Memory caching: `lastMemory` saved/restored for performance (see `Memory.ts`)

### Task System (src/tasks/)
Creeps use a task-based action system with automatic movement:
```typescript
zerg.task = Tasks.harvest(source);  // Moves to source and harvests
zerg.task = Tasks.transfer(target); // Moves and transfers
zerg.task = Tasks.pickup(resource); // Auto-pathfinds and picks up
```
- Tasks auto-complete when done and return to parent task if forked
- Check `zerg.idle` to see if task is null/complete
- Tasks handle movement internally - no need for separate move commands

### Spawning System
Use `this.wishlist(count, setup, options)` in overlord's `init()` to request creeps:
```typescript
init() {
  const setup = Setups.workers.default;
  this.wishlist(3, setup, {
    reassignIdle: true,  // Grab idle creeps with this role
    priority: OverlordPriority.Normal,
    prespawn: 50  // Start spawning 50 ticks before death
  });
}
```
- Creep bodies defined in `src/creepSetups/setups.ts` (use `Setups.*` or `Roles.*`)
- SpawnGroups handle actual spawning; overlords just request via wishlist

### Profiling & Performance
- Add `@profile` decorator to all classes for optional profiling (requires `USE_SCREEPS_PROFILER`)
- Wrap risky code in `this.try()` within Overlords/Directives (see `Overmind.try()`)
- Bucket management halts operation below 500 on shard3
- Use `USE_TRY_CATCH` setting to wrap operations in error handlers

### Type Guards & Prototypes
- Use type guards: `isCreep()`, `isStandardZerg()`, `isOwnedStructure()` (src/declarations/typeGuards.ts)
- Custom prototypes extend game objects: `Creep.boosts`, `Creep.bodypartCounts`, `RoomPosition.print`
- Cached properties use `PERMACACHE` global for permanent caching (e.g., `Creep.bodypartCounts`)
- All prototypes imported in `src/main.ts` - **order matters for compilation!**

### Overlord Creation Pattern
```typescript
@profile
export class MyOverlord extends Overlord {
  myZerg: Zerg[];
  
  constructor(directive: Directive, priority = OverlordPriority.default) {
    super(directive, 'myTask', priority);
    this.myZerg = this.zerg(Roles.worker); // Auto-assigns creeps
  }
  
  refresh() {
    super.refresh();
    this.myZerg = this.zerg(Roles.worker);
  }
  
  init() {
    const setup = Setups.workers.default;
    this.wishlist(3, setup, {reassignIdle: true});
  }
  
  private handleZerg(zerg: Zerg) {
    if (zerg.idle) {
      zerg.task = Tasks.upgrade(this.room.controller!);
    }
  }
  
  run() {
    this.autoRun(this.myZerg, zerg => this.handleZerg(zerg));
  }
}
```

### Directive Creation Pattern
Directives wrap flags and spawn overlords:
```typescript
@profile
export class DirectiveMyTask extends Directive {
  static directiveName = 'myTask';
  static color = COLOR_YELLOW;
  static secondaryColor = COLOR_BLUE;

  overlords: {
    myOverlord: MyOverlord;
  };

  constructor(flag: Flag) {
    super(flag);
  }

  spawnMoarOverlords() {
    this.overlords.myOverlord = new MyOverlord(this);
  }

  init() { }
  run() { }
}
```
Register in `src/directives/initializer.ts` with color code mapping.

### Directive Flag Colors
Directives map to specific flag color combinations (see `src/directives/initializer.ts`):
- **Purple/Purple** = Outpost (DirectiveOutpost)
- **Purple/Grey** = Colonize (DirectiveColonize)
- **Yellow/Yellow** = Harvest (DirectiveHarvest)
- **Yellow/Cyan** = Extract mineral (DirectiveExtract)
- **Blue/Blue** = Guard (DirectiveGuard)
- **Red/Red** = Swarm destroy (DirectiveSwarmDestroy)
- **Orange/Orange** = Bootstrap (DirectiveBootstrap)

Create with: `DirectiveHarvest.create(pos, {options})`

### Logistics System
Three-tier logistics system:
1. **SectorLogistics** (inter-colony): Manages resource sharing between colonies in a 10x10 sector
   - Colonies publish unfulfilled requests to central memory pool
   - `SectorTransportOverlord` coordinates transporters to fulfill cross-colony requests
   - Only colonies with storage participate in sector logistics
   - Uses `Cartographer.getSectorKey()` to determine sector membership (e.g., "E1N3")

2. **LogisticsNetwork** (colony-wide): Energy distribution via transporters within a colony
   - `requestEnergy(target, priority)` - request energy delivery
   - `requestOutput(target, resourceType)` - request resource pickup
   - Uses Gale-Shapley matching algorithm for transporter assignments

3. **TransportRequestGroup** (local): Short-range building supply/withdraw
   - `requestSupply(target, priority, amount)` - fill this target
   - `requestWithdraw(target, priority, amount)` - empty this target
   - Used by queens/fillers for spawn/extension filling

### Sector System
A `Sector` represents a 10x10 map region containing multiple colonies:
- Created during Overmind build phase by grouping colonies with `Cartographer.getSectorKey()`
- Chooses an "anchor" colony (highest RCL, ties broken by name) as representative
- Owns `SectorLogisticsOverlord` which manages `sectorTransport` creeps
- Colonies publish resource needs to central pool; overlord fulfills cross-colony requests
- Access via `colony.sector` or `Overmind.sectors['E1N3']`

### Room Planning
- Bunker layouts use coordinate-based systems (src/roomPlanner/layouts/bunker.ts)
- `RoomPlanner.active` must be true to build structures
- Uses `getPosFromBunkerCoord()` to convert layout coords to RoomPositions
- Run `setRoomPlanner('W1N1', true)` in console to activate planning for a room
- Layouts stored in `assets/basePlanner/` for different base configurations

### Colony Stages
Colonies progress through stages based on RCL:
- **Larva** (stage 0): No storage, early economy
- **Pupa** (stage 1): Has storage, RCL < 8
- **Adult** (stage 2): RCL 8, mature colony

Access via `colony.stage` - used to conditionally enable features.

### DEFCON System
Colony defense levels (see `Colony.ts`):
- **DEFCON 0**: Safe - no threats
- **DEFCON 1**: NPC invasion
- **DEFCON 2**: Boosted NPC invasion or player invasion
- **DEFCON 3**: Large player invasion

Overseer automatically places defense directives based on room intel.

## Build & Deploy

**Requirements:** Node 20+, pnpm 9.6+ (or npm)

### Grunt (Primary Build & Deploy Method)
```powershell
npm install                     # Install dependencies
grunt                           # Clean, build with rollup, and deploy via screeps
grunt --branch=main             # Deploy to specific branch
grunt --ptr=true                # Deploy to PTR server
```
- Configuration via `.screeps.json` (email, token, branch, ptr)
- Default task runs: clean → rollup → screeps (deploy)
- Uses rollup with TypeScript compilation pipeline
- See `gruntfile.js` for task configuration

### NPM Scripts (Alternative)
Rollup-based scripts available as alternative to Grunt:
```powershell
pnpm install                    # Install dependencies
npm run compile                 # Build only (outputs to dist/main.js)
npm run push-main               # Build and deploy to public server
npm run push-pserver            # Build and deploy to private server
npm run push-seasonal           # Deploy to seasonal server
```

### GitHub Actions (CI/CD)
Automatic deployment on push to master via `.github/workflows/npm-grunt.yml`:
- Triggers on push/PR to master branch
- Uses Node 20.x
- Deploys via Grunt using repository secrets:
  - `SCREEPS_EMAIL` (variable)
  - `SCREEPS_TOKEN` (secret)
  - `SCREEPS_BRANCH` (variable, defaults to 'default')
  - `SCREEPS_PTR` (variable for PTR server)

**Configuration:** Create `.screeps.json` from `.screeps.example.json` with server credentials.

**Important:** Use local `rollup` (not global) - checksums validate bundle integrity.

**TypeScript config:** `tsconfig.json` targets ES2018, uses `esnext` modules, strict mode enabled.

## Common Debugging Patterns

**Enable per-object debugging:** Set `memory.debug = true` on any Colony/Overlord/Directive
```javascript
// In console
Overmind.colonies['W1N1'].memory.debug = true
Game.flags['harvest_W1N1'].memory.debug = true
```

**Console globals** (src/console/globals.ts):
- `help()` - show all available commands
- `setMode('automatic')` - change autonomy level (manual/semiautomatic/automatic)
- `setSignature('text')` - set controller signature
- `suspendColony('W1N1')` - pause a colony
- `removeAllFlags()` - clear all flags
- `removeErrantFlags()` - remove flags with invalid directive colors
- `listActiveReactions()` - show active labs reactions
- `setLogLevel('debug')` - adjust logging verbosity

**Accessing objects:**
- Use `deref(id)` to get any game object by ID, name, or flag name
- Use `Overmind.colonies['W1N1']` to access specific colony
- Use `Overmind.directives` to list all active directives
- Use `Overmind.zerg['creepName']` to access wrapped creeps

**Stats:** Integrated Grafana dashboard via screepspl.us (see README for setup)

## Common Patterns & Idioms

**Finding closest by range then path:**
```typescript
const target = pos.findClosestByRangeThenPath(targets);
```

**Using `this.debug()` in overlords:**
```typescript
this.debug(`Mining from ${source.pos.print}`);
```

**Check if creep needs boosting:**
```typescript
if (zerg.needsBoosts(boostResources)) {
  zerg.task = Tasks.getBoosted(lab, boostResource);
}
```

**Prototype extensions:**
```typescript
creep.boosts // array of active boost types
creep.bodypartCounts // {work: 10, carry: 5, move: 15}
pos.print // formatted string for logging: "[W1N1:25,25]"
pos.isEdge // true if on room edge
```

## Key Files Reference

### Core Architecture
- **src/main.ts** - Entry point, global reset, main loop
- **src/Overmind.ts** - Main singleton coordinating all colonies and sectors
- **src/sector/Sector.ts** - 10x10 map sector aggregating colonies for resource sharing
- **src/Colony.ts** - Single colony manager (stage: Larva/Pupa/Adult based on RCL)
- **src/Overseer.ts** - Scheduler placing directives in response to threats

### Component Systems
- **src/overlords/Overlord.ts** - Base class for creep orchestration
- **src/directives/Directive.ts** - Base class for flag-based task system
- **src/zerg/Zerg.ts** - Creep wrapper with task system
- **src/hiveClusters/_HiveCluster.ts** - Base class for structure groupings

### Logistics & Economy
- **src/logistics/SectorLogistics.ts** - Inter-colony resource sharing via central pool
- **src/logistics/LogisticsNetwork.ts** - Colony-wide request/offer matching for haulers
- **src/logistics/TransportRequestGroup.ts** - Local short-range supply/withdraw
- **src/logistics/SpawnGroup.ts** - Manages spawning across hatcheries
- **src/overlords/logistics/sectorTransport.ts** - Cross-colony transport overlord
- **src/roomPlanner/RoomPlanner.ts** - Automated base layout

### Tasks & Creep Setup
- **src/tasks/Task.ts** - Base task class
- **src/tasks/Tasks.ts** - Task factory (Tasks.harvest, Tasks.build, etc.)
- **src/creepSetups/setups.ts** - All creep body configurations

### Configuration & State
- **src/~settings.ts** - Global configuration (profiling, allies, operation mode)
- **src/memory/Memory.ts** - Memory management utilities
- **src/declarations/memory.d.ts** - Memory structure definitions
- **src/declarations/typeGuards.ts** - Type checking utilities

### Template Files
- **src/overlords/~template/templateOverlord.ts** - Overlord boilerplate
- **src/overlords/~template/emptyOverlord.ts** - Minimal overlord example

## Project-Specific Conventions

- **No public server harassment:** Respect novice/respawn zones
- **Zerg naming:** All creeps = Zerg, power creeps = PowerZerg
- **HiveCluster naming:** `<type>@<colonyName>` (e.g., `hatchery@W1N1`)
- **Avoid `lodash` where possible:** Use native JS (map, filter) except for `_.groupBy`, `_.countBy`
- **RoomPosition shorthand:** Use `.print` property for logging: `pos.print`
- **Ref pattern:** All game objects have `.ref` (id or name) for persistent references
- **Priority constants:** Use `OverlordPriority.*` from `priorities/priorities_overlords.ts`
- **Build priorities:** Use constants from `priorities/priorities_structures.ts`

## Testing & Validation

- **No formal test suite** - testing done on live server or private server
- Use `sandbox()` function in `utilities/sandbox.ts` for experimental code
- Enable profiling with `USE_SCREEPS_PROFILER = true` in `~settings.ts`
- Monitor bucket usage - critical for CPU management

## Common Gotchas

1. **Prototype order matters** - prototypes imported in specific order in `main.ts`
2. **Rollup version** - must use local rollup for checksums
3. **Global refresh** - Overmind object deleted/rebuilt every 20 ticks or on shouldBuild
4. **Memory parsing** - `Mem.load()` restores parsed memory from previous tick
5. **Task persistence** - tasks stored in creep memory, survive tick boundaries
6. **Flag colors** - invalid color combinations produce console warnings unless suppressed
