// import {log} from "../../lib/logger/log";

import * as Config from "../../config/config";

import {CacheRead, StructureMaxRepair} from "../../config/types";
import {CreepManager} from "../creeps/creepManager";
import {RoomManager} from "../roomManager";
import {ControllerManager} from "./controllerManager";
import {MovementManager} from "./movementManager";
import {RampartManager} from "./rampartManager";
import {TowerManager} from "./towerManager";
import {WallManager} from "./wallManager";

interface RepairManagers {
  [roomName: string]: RepairManager;
}

const repairManagers: RepairManagers = {};

const REPAIR_RESERVATION_TYPE_TOWER = "tower";
type RepairReservationTypeTower = "tower";
const REPAIR_RESERVATION_TYPE_CREEP = "creep";
type RepairReservationTypeCreep = "creep";

interface RepairRoom extends Room {
  memory: {
    repairs: {
      [index: string]: {
        id: string,
        type: RepairReservationTypeTower | RepairReservationTypeCreep
      }
    }
  };
}

export class RepairManager {

  public static getManager(roomOrRoomName: Room | string): RepairManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof repairManagers[roomName] === "undefined") {
      repairManagers[roomName] = new RepairManager(roomName);
    }
    return repairManagers[roomName];
  }

  private roomName: string;
  private cacheUnrepairedStructures: CacheRead<StructureMaxRepair[]> = {
    cache: [],
    readTime: 0
  };
  private cacheUnrepairedStructuresNoRamparts: CacheRead<StructureMaxRepair[]> = {
    cache: [],
    readTime: 0
  };
  private cacheUnrepairedRamparts: CacheRead<StructureMaxRepair[]> = {
    cache: [],
    readTime: 0
  };
  private cacheUnrepairedHits: CacheRead<number> = {
    cache: 0,
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
  }

  public getAndReserveStructureNoRampart(creepOrTower: Creep | StructureTower): StructureMaxRepair | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const structuresMaxRepair = this.getUnrepairedStructuresNoRamparts().filter((structureMaxRepair) => {
      return (!_.isObject(room.memory.repairs[structureMaxRepair.structure.id]));
    }).map((structureMaxRepair) => {
      return {
        distance: PathFinder.search(creepOrTower.pos, structureMaxRepair.structure.pos).cost,
        structureMaxRepair
      };
    }).sort((s1, s2) => {
      if (s1.structureMaxRepair.structure.structureType !== STRUCTURE_WALL && s2.structureMaxRepair.structure.structureType === STRUCTURE_WALL) {
        return -1;
      }
      if (s1.structureMaxRepair.structure.structureType === STRUCTURE_WALL && s2.structureMaxRepair.structure.structureType !== STRUCTURE_WALL) {
        return 1;
      }
      if (s1.structureMaxRepair.structure.hits - s2.structureMaxRepair.structure.hits !== 0) {
        return s1.structureMaxRepair.structure.hits - s2.structureMaxRepair.structure.hits;
      }
      return s1.distance - s2.distance;
    });
    if (structuresMaxRepair.length === 0) {
      return null;
    }
    const foundStructureMaxRepair = structuresMaxRepair[0].structureMaxRepair;
    room.memory.repairs[foundStructureMaxRepair.structure.id] = {
      id: creepOrTower.id,
      type: (creepOrTower as StructureTower).structureType === STRUCTURE_TOWER ? REPAIR_RESERVATION_TYPE_TOWER : REPAIR_RESERVATION_TYPE_CREEP
    };
    return foundStructureMaxRepair;
  }

  public getAndReserveRampart(creepOrTower: Creep | StructureTower): StructureMaxRepair | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const rampartsMaxRepair = this.getUnrepairedRamparts().filter((structureMaxRepair) => {
      return (!_.isObject(room.memory.repairs[structureMaxRepair.structure.id]));
    }).map((structureMaxRepair) => {
      return {
        distance: PathFinder.search(creepOrTower.pos, structureMaxRepair.structure.pos).cost,
        structureMaxRepair
      };
    }).sort((s1, s2) => {
      if (s1.structureMaxRepair.structure.hits - s2.structureMaxRepair.structure.hits !== 0) {
        return s1.structureMaxRepair.structure.hits - s2.structureMaxRepair.structure.hits;
      }
      return s1.distance - s2.distance;
    });
    if (rampartsMaxRepair.length === 0) {
      return null;
    }
    const foundStructureMaxRepair = rampartsMaxRepair[0].structureMaxRepair;
    room.memory.repairs[foundStructureMaxRepair.structure.id] = {
      id: creepOrTower.id,
      type: (creepOrTower as StructureTower).structureType === STRUCTURE_TOWER ? REPAIR_RESERVATION_TYPE_TOWER : REPAIR_RESERVATION_TYPE_CREEP
    };
    return foundStructureMaxRepair;
  }

  public getUnrepairedHits(): number {
    if (this.cacheUnrepairedHits.readTime !== Game.time) {
      const unrepairedStructures = this.getUnrepairedStructures();
      if (unrepairedStructures.length === 0) {
        this.cacheUnrepairedHits.cache = 0;
      } else {
        this.cacheUnrepairedHits.cache = _.sum(unrepairedStructures.map((structureMaxRepair) => {
          if (_.isNumber(structureMaxRepair.maxHp)) {
            return structureMaxRepair.maxHp - structureMaxRepair.structure.hits;
          }
          return structureMaxRepair.structure.hitsMax - structureMaxRepair.structure.hits;
        }));
      }
      this.cacheUnrepairedHits.readTime = Game.time;
    }
    return this.cacheUnrepairedHits.cache;
  }

  public anzUnrepairedStructures(): number {
    return this.getUnrepairedStructures().length;
  }

  private getUnrepairedStructures(): StructureMaxRepair[] {
    if (this.cacheUnrepairedStructures.readTime !== Game.time) {
      const room = this.getRoom();
      if (room === null) {
        this.cacheUnrepairedStructures.cache = [];
      } else {
        const controllerLevel = _.memoize(() => ControllerManager.getManager(room).getControllerLevel());
        const progressToNextLevel = _.memoize(() => ControllerManager.getManager(room).getProgressToNextLevel());
        const minHpRampart = _.memoize(() => RampartManager.getMinHpRampartForLevel(controllerLevel(), progressToNextLevel()));
        const maxHpRampart = _.memoize(() => RampartManager.getMaxHpRampartForLevel(controllerLevel(), progressToNextLevel()));
        const minHpWall = _.memoize(() => WallManager.getMinHpWallForLevel(controllerLevel(), progressToNextLevel()));
        const maxHpWall = _.memoize(() => WallManager.getMaxHpWallForLevel(controllerLevel(), progressToNextLevel()));
        this.cacheUnrepairedStructures.cache = RoomManager.getManager(room).getStructures().filter((structure) => {
          if (_.isBoolean((structure as OwnedStructure).my) && !(structure as OwnedStructure).my) {
            return false;
          }
          if (structure.structureType === STRUCTURE_RAMPART) {
            return structure.hits <= minHpRampart();
          }
          if (structure.structureType === STRUCTURE_WALL) {
            return structure.hits <= minHpWall();
          }
          if (structure.structureType === STRUCTURE_ROAD) {
            return structure.hits / structure.hitsMax < Config.STRUCTURE_START_REPAIRING && MovementManager.getManager(room).getMovement(structure.pos.x, structure.pos.y) >= Config.ROAD_MIN_USAGE;
          }
          return structure.hits / structure.hitsMax < Config.STRUCTURE_START_REPAIRING;
        }).map((structure) => {
          const retObj: StructureMaxRepair = {
            structure
          };
          if (structure.structureType === STRUCTURE_RAMPART) {
            retObj.maxHp = maxHpRampart();
          } else if (structure.structureType === STRUCTURE_WALL) {
            retObj.maxHp = maxHpWall();
          }
          return retObj;
        });
      }
      this.cacheUnrepairedStructures.readTime = Game.time;
    }
    return this.cacheUnrepairedStructures.cache;
  }

  private getUnrepairedStructuresNoRamparts(): StructureMaxRepair[] {
    if (this.cacheUnrepairedStructuresNoRamparts.readTime !== Game.time) {
      this.cacheUnrepairedStructuresNoRamparts.cache = this.getUnrepairedStructures().filter((structureMaxRepair) => {
        return structureMaxRepair.structure.structureType !== STRUCTURE_RAMPART;
      });
      this.cacheUnrepairedStructuresNoRamparts.readTime = Game.time;
    }
    return this.cacheUnrepairedStructuresNoRamparts.cache;
  }

  private getUnrepairedRamparts(): StructureMaxRepair[] {
    if (this.cacheUnrepairedRamparts.readTime !== Game.time) {
      this.cacheUnrepairedRamparts.cache = this.getUnrepairedStructures().filter((structureMaxRepair) => {
        return structureMaxRepair.structure.structureType === STRUCTURE_RAMPART;
      });
      this.cacheUnrepairedRamparts.readTime = Game.time;
    }
    return this.cacheUnrepairedRamparts.cache;
  }

  private getRoom(): RepairRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private initMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.repairs)) {
      room.memory.repairs = {};
    }
    for (const structureId in room.memory.repairs) {
      if (!room.memory.repairs.hasOwnProperty(structureId)) {
        continue;
      }
      if (room.memory.repairs[structureId].type !== REPAIR_RESERVATION_TYPE_CREEP && room.memory.repairs[structureId].type !== REPAIR_RESERVATION_TYPE_CREEP) {
        delete room.memory.repairs[structureId];
        continue;
      }
      if (!_.isString(room.memory.repairs[structureId].id)) {
        delete room.memory.repairs[structureId];
        continue;
      }
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const structureId in room.memory.repairs) {
      // First Remove Those that don't exist anymore
      if (!room.memory.repairs.hasOwnProperty(structureId)) {
        continue;
      }
      const structure = Game.getObjectById<Structure>(structureId);
      if (structure === null || structure.room.name !== room.name) {
        delete room.memory.repairs[structureId];
      } else {
        if (room.memory.repairs[structureId].type === REPAIR_RESERVATION_TYPE_CREEP) {
          const creep = Game.getObjectById<Creep>(room.memory.repairs[structureId].id);
          if (creep === null || !CreepManager.holdsStructureReservation(creep, structure)) {
            delete room.memory.repairs[structureId];
          }
        } else {
          const tower = Game.getObjectById<StructureTower>(room.memory.repairs[structureId].id);
          if (tower === null || !TowerManager.holdsStructureReservation(tower, structure)) {
            delete room.memory.repairs[structureId];
          }
        }
      }
    }
  }

}
