/**
 * Screeps Traffic Manager (TypeScript)
 *
 * Manages creep movement to reduce congestion and improve pathing efficiency.
 */

const DIRECTION_DELTA: { [key: number]: { x: number; y: number } } = {
  [TOP]: { x: 0, y: -1 },
  [TOP_RIGHT]: { x: 1, y: -1 },
  [RIGHT]: { x: 1, y: 0 },
  [BOTTOM_RIGHT]: { x: 1, y: 1 },
  [BOTTOM]: { x: 0, y: 1 },
  [BOTTOM_LEFT]: { x: -1, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [TOP_LEFT]: { x: -1, y: -1 },
};

function registerMove(creep: Creep | PowerCreep, target: RoomPosition | DirectionConstant) {
  let targetCoord = typeof target === "number" ? getDirectionTarget(creep.pos, target) : target;
  (creep as any)._intendedPackedCoord = packCoordinates(targetCoord);
}

function setWorkingArea(creep: Creep | PowerCreep, pos: RoomPosition, range: number) {
  (creep as any)._workingPos = pos;
  (creep as any)._workingRange = range;
}

function run(room: Room, costs?: CostMatrix, movementCostThreshold: number = 255) {
  const movementMap = new Map<number, Creep | PowerCreep>();
  const terrain = Game.map.getRoomTerrain(room.name);
  const creepsInRoom: (Creep | PowerCreep)[] = [
    ...room.find(FIND_MY_CREEPS),
    ...room.find(FIND_MY_POWER_CREEPS),
  ];
  creepsInRoom.forEach((creep) => assignCreepToCoordinate(creep, creep.pos, movementMap));
  for (const creep of creepsInRoom) {
    const intendedPackedCoord = getIntendedPackedCoord(creep);
    if (!intendedPackedCoord) {
      continue;
    }
    const matchedPackedCoord = getMatchedPackedCoord(creep);
    if (matchedPackedCoord === intendedPackedCoord) continue;
    const visitedCreeps = new Set<string>();
    if (typeof matchedPackedCoord === 'number') {
      movementMap.delete(matchedPackedCoord);
    }
    deleteMatchedPackedCoord(creep);
    if (depthFirstSearch(creep, 0, terrain, costs, movementCostThreshold, movementMap, visitedCreeps) > 0) continue;
    assignCreepToCoordinate(creep, creep.pos, movementMap);
  }
  creepsInRoom.forEach((creep) => resolveMovement(creep));
}

function depthFirstSearch(
  creep: Creep | PowerCreep,
  score: number = 0,
  terrain: RoomTerrain,
  costs: CostMatrix | undefined,
  movementCostThreshold: number,
  movementMap: Map<number, Creep | PowerCreep>,
  visitedCreeps: Set<string>,
): number {
  visitedCreeps.add(creep.name);
  if (!(creep as any).my) {
    return -Infinity;
  }
  const emptyTiles: { x: number; y: number }[] = [];
  const occupiedTiles: { x: number; y: number }[] = [];
  for (const coord of getPossibleMoves(creep, terrain, costs, movementCostThreshold)) {
    const occupied = movementMap.get(packCoordinates(coord));
    if (occupied) {
      occupiedTiles.push(coord);
    } else {
      emptyTiles.push(coord);
    }
  }
  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    const packedCoord = packCoordinates(coord);
    if (getIntendedPackedCoord(creep) === packedCoord) {
      score++;
    }
    const occupyingCreep = movementMap.get(packedCoord);
    if (!occupyingCreep) {
      if (score > 0) {
        assignCreepToCoordinate(creep, coord, movementMap);
      }
      return score;
    }
    if (!visitedCreeps.has(occupyingCreep.name)) {
      if (getIntendedPackedCoord(occupyingCreep) === packedCoord) {
        score--;
      }
      const result = depthFirstSearch(
        occupyingCreep,
        score,
        terrain,
        costs,
        movementCostThreshold,
        movementMap,
        visitedCreeps,
      );
      if (result > 0) {
        assignCreepToCoordinate(creep, coord, movementMap);
        return result;
      }
    }
  }
  return -Infinity;
}

function resolveMovement(creep: Creep | PowerCreep) {
  const matchedPackedCoord = getMatchedPackedCoord(creep);
  if (typeof matchedPackedCoord === 'number') {
    const matchedPos = unpackCoordinates(matchedPackedCoord);
    if (!creep.pos.isEqualTo(matchedPos.x, matchedPos.y)) {
      creep.move(creep.pos.getDirectionTo(matchedPos.x, matchedPos.y));
    }
  }
}

function getPossibleMoves(
  creep: Creep | PowerCreep,
  terrain: RoomTerrain,
  costs: CostMatrix | undefined,
  movementCostThreshold: number,
): { x: number; y: number }[] {
  if ((creep as any)._possibleMoves) {
    return (creep as any)._possibleMoves;
  }
  const possibleMoves: { x: number; y: number }[] = [];
  if (!canMove(creep)) {
    (creep as any)._possibleMoves = possibleMoves;
    return possibleMoves;
  }
  const intendedPackedCoord = getIntendedPackedCoord(creep);
  if (intendedPackedCoord) {
    possibleMoves.push(unpackCoordinates(intendedPackedCoord));
    (creep as any)._possibleMoves = possibleMoves;
    return possibleMoves;
  }
  const outOfWorkingArea: { x: number; y: number }[] = [];
  for (const delta of Object.values(DIRECTION_DELTA).sort(() => Math.random() - 0.5)) {
    const coord = { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y };
    if (!isValidMove(coord, terrain, costs, movementCostThreshold)) continue;
    const workingArea = getWorkingArea(creep);
    if (workingArea && workingArea.pos.getRangeTo(coord.x, coord.y) > workingArea.range) {
      outOfWorkingArea.push(coord);
      continue;
    }
    possibleMoves.push(coord);
  }
  if (outOfWorkingArea.length > 0) {
    possibleMoves.push(...outOfWorkingArea);
  }
  (creep as any)._possibleMoves = possibleMoves;
  return possibleMoves;
}

function canMove(creep: Creep | PowerCreep): boolean {
  if ((creep as any)._canMove !== undefined) {
    return (creep as any)._canMove;
  }
  if (creep instanceof PowerCreep) {
    return ((creep as any)._canMove = true);
  }
  if (creep.fatigue > 0) {
    return ((creep as any)._canMove = false);
  }
  return ((creep as any)._canMove = creep.body.some((part) => part.type === MOVE));
}

function isValidMove(
  coord: { x: number; y: number },
  terrain: RoomTerrain,
  costs: CostMatrix | undefined,
  movementCostThreshold: number,
): boolean {
  if (terrain.get(coord.x, coord.y) === TERRAIN_MASK_WALL) {
    return false;
  }
  if (coord.x === 0 || coord.x === 49 || coord.y === 0 || coord.y === 49) {
    return false;
  }
  if (costs && costs.get(coord.x, coord.y) >= movementCostThreshold) {
    return false;
  }
  return true;
}

function assignCreepToCoordinate(
  creep: Creep | PowerCreep,
  coord: { x: number; y: number },
  movementMap: Map<number, Creep | PowerCreep>,
) {
  const packedCoord = packCoordinates(coord);
  (creep as any)._matchedPackedCoord = packedCoord;
  movementMap.set(packedCoord, creep);
}

function getDirectionTarget(pos: RoomPosition, direction: DirectionConstant): { x: number; y: number } {
  const delta = DIRECTION_DELTA[direction];
  const targetCoord = {
    x: Math.max(0, Math.min(49, pos.x + delta.x)),
    y: Math.max(0, Math.min(49, pos.y + delta.y)),
  };
  return targetCoord;
}

function getWorkingArea(creep: Creep | PowerCreep): { pos: RoomPosition; range: number } | null {
  if (!(creep as any)._workingPos) {
    return null;
  }
  return { pos: (creep as any)._workingPos, range: (creep as any)._workingRange || 0 };
}

function getIntendedPackedCoord(creep: Creep | PowerCreep): number | undefined {
  return (creep as any)._intendedPackedCoord;
}

function getMatchedPackedCoord(creep: Creep | PowerCreep): number | undefined {
  return (creep as any)._matchedPackedCoord;
}

function deleteMatchedPackedCoord(creep: Creep | PowerCreep) {
  delete (creep as any)._matchedPackedCoord;
}

function packCoordinates(coord: { x: number; y: number }): number {
  return 50 * coord.y + coord.x;
}

function unpackCoordinates(packedCoord: number): { x: number; y: number } {
  const x = packedCoord % 50;
  const y = (packedCoord - x) / 50;
  return { x, y };
}

const trafficManager = {
  registerMove,
  setWorkingArea,
  run,
};

export default trafficManager;
