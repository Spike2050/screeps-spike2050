import * as Config from "../../../config/config";
import {
  CacheRead,
  CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, MINER_ROLE_NAME, MinerRoleType,
  ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../../resources/ResourceSourceOrSink";
import {ControllerManager} from "../../structures/controllerManager";
import {MineralManager, MiningSetup} from "../../structures/mineralManager";
import {MovementManager} from "../../structures/movementManager";
import {SpawnManager} from "../../structures/spawnManager";
import {StorageManager} from "../../structures/storageManager";
import {DefenderManager} from "./defenderManager";

interface MinerManagers {
  [roomName: string]: MinerManager;
}

const minerManagers: MinerManagers = {};

const MINER_JOB_TYPE_LOAD = "load";
type MinerJobTypeLoad = "load";
const MINER_JOB_TYPE_UNLOAD = "unload";
type MinerJobTypeUnload = "unload";
const MINER_JOB_TYPE_RENEW = "renew";
type MinerJobTypeRenew = "renew";

interface MinerLoadJob {
  "type": MinerJobTypeLoad;
}

interface MinerRenewJob {
  "type": MinerJobTypeRenew;
  spawnId: string;
}

interface MinerUnloadJob {
  "type": MinerJobTypeUnload;
}

interface MinerMemory extends CreepMemory {
  role: MinerRoleType;
  job: MinerRenewJob | MinerLoadJob | MinerUnloadJob | CreepJobNone;
  mineralId: string;
  mineralType: string;
  storageId: string;
  oldPos: {
    x: number;
    y: number;
  };
}

interface MinerCreep extends Creep {
  memory: MinerMemory;
}

interface MinerRoomMemory extends Room {
  miner: {
    generation: number;
    lastCreepProduced: number;
    storageDistances: {
      [mineralId: string]: number;
    }
  };
}

interface MinerRoom extends Room {
  memory: MinerRoomMemory;
}

export class MinerManager {

  public static getManager(roomOrRoomName: Room | string): MinerManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (_.isUndefined(minerManagers[roomName])) {
      minerManagers[roomName] = new MinerManager(roomName);
    }
    return minerManagers[roomName];
  }

  public static holdsRenewReservation(spawn: Spawn, creep: MinerCreep): boolean {
    if (creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || creep.memory.job.type !== MINER_JOB_TYPE_RENEW) {
      return false;
    }
    if (spawn.id !== creep.memory.job.spawnId) {
      return false;
    }
    return true;
  }

  public static getResourceSourceOrSinkReservation(creep: MinerCreep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    if (resourceType !== creep.memory.mineralType || creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || (creep.memory.job.type !== MINER_JOB_TYPE_LOAD && creep.memory.job.type !== MINER_JOB_TYPE_UNLOAD)) {
      return 0;
    }
    if (creep.memory.job.type === MINER_JOB_TYPE_LOAD && !_.isString(creep.memory.mineralId)) {
      return 0;
    }
    if (creep.memory.job.type === MINER_JOB_TYPE_UNLOAD && (ResourceSourceOrSinkType.Storage !== resourceSourceOrSinkType || !_.isString(creep.memory.storageId))) {
      return 0;
    }
    if (creep.memory.job.type === MINER_JOB_TYPE_LOAD) {
      const memorySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.mineralId);
      if (memorySource === null || memorySource.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getFreeCarryAmount(creep);
    }
    if (creep.memory.job.type === MINER_JOB_TYPE_UNLOAD) {
      const memorySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.storageId);
      if (memorySink === null || memorySink.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getEnergyInCreep(creep);
    }
    return 0;
  }

  private static isBestMiner(creep: MinerCreep): boolean {
    if (creep.hits !== creep.hitsMax) {
      return false;
    }
    const mineral = Game.getObjectById<Mineral>(creep.memory.mineralId);
    if (mineral === null) {
      return false;
    }
    const miningSetup = MinerManager.getMiningSetup(mineral, SpawnManager.getMaxBuildEnergy());
    if (miningSetup === null) {
      return false;
    }
    return miningSetup.anzCarry === CreepManager.anzTypeParts(creep, CARRY) && miningSetup.anzWork === CreepManager.anzTypeParts(creep, WORK) && miningSetup.anzMove === CreepManager.anzTypeParts(creep, MOVE);
  }

  private static getMiningSetup(mineral: Mineral, buildEnergy: number): MiningSetup | null {
    if (_.isUndefined(mineral.room)) {
      return null;
    }
    const minerRoom = MinerManager.getManager(mineral.room as Room).getRoom();
    if (minerRoom === null) {
      return null;
    }
    const distance = minerRoom.memory.miner.storageDistances[mineral.id];
    return MineralManager.getMiningSetup(buildEnergy, distance);
  }

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getMiners(): MinerCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === MINER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzMiners(): number {
    return this.getMiners().length;
  }

  public run(): void {
    this.refeshMemory();
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.getMiners().forEach((creep) => {
      if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
        if (!creep.spawning) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        if (spawn == null || creep.ticksToLive / CREEP_LIFE_TIME > Config.CREEP_STOP_RENEW || spawn.spawning !== null || creep.room.energyAvailable < Config.SPAWN_MIN_RENEW_ENERGY ||
          StorageManager.getResourceShare(StorageManager.getManager(this.roomName).getStorage() as StructureStorage, creep.memory.mineralType) >= 0.1) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_UNLOAD) {
        const storage = Game.getObjectById<StructureStorage>(creep.memory.storageId);
        if (CreepManager.isEmpty(creep) || storage === null || ResourceSourceOrSink.resourceSourceOrSinkIsFull(storage, ResourceSourceOrSinkType.Storage, creep.memory.mineralType)) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.mineralId);
        if (energySource === null || CreepManager.getFreeCarryAmount(creep) === 0 || ResourceSourceOrSink.resourceSourceOrSinkIsEmpty(energySource, ResourceSourceOrSinkType.Mineral, creep.memory.mineralType)) {
          this.getNextJob(creep);
        }
      }

      if (!creep.spawning && (creep.memory.oldPos.x !== creep.pos.x || creep.memory.oldPos.y !== creep.pos.y)) {
        MovementManager.usedRoad(creep.pos);
        creep.memory.oldPos.x = creep.pos.x;
        creep.memory.oldPos.y = creep.pos.y;
      }

      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        CreepManager.moveToRenew(creep, spawn);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.storageId);
        CreepManager.moveToDropResource(creep, energySink, ResourceSourceOrSinkType.Storage, creep.memory.mineralType);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === MINER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.mineralId);
        CreepManager.moveToDrainResource(creep, energySource, ResourceSourceOrSinkType.Mineral, creep.memory.mineralType);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, maxBuildEnergyInNearbySpawns: number): CreepPlan | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    if (DefenderManager.getManager(room).defenseMode() && DefenderManager.getManager(room).getDefenders().length === 0) {
      return null;
    }
    if (!ControllerManager.getManager(room).controlled()) {
      return null;
    }
    const availableEnergy = spawnRoom.energyAvailable;
    const storage = StorageManager.getManager(room).getStorage();
    if (storage === null) {
      return null;
    }
    if (room.memory.miner.lastCreepProduced === Game.time) {
      return null;
    }

    const mineralPlans = MineralManager.getManager(room).getMinerals().filter((mineral) => {
      if (mineral.mineralAmount === 0) {
        return false;
      }
      if (StorageManager.getResourceShare(storage, mineral.mineralType) >= 0.1) {
        return false;
      }
      const anzMinersSource = MinerManager.getManager(room).getMiners().filter((creep) => creep.memory.mineralId === mineral.id).length;
      if (anzMinersSource >= 1) {
        return false;
      }
      return true;
    }).map((mineral) => {
      return {
        mineral,
        miningSetup: MinerManager.getMiningSetup(mineral, maxBuildEnergyInNearbySpawns)
      };
    }).filter((obj) => {
      if (obj === null || obj.miningSetup === null) {
        return false;
      }
      if (obj.miningSetup.anzCarry * BODYPART_COST[CARRY] + obj.miningSetup.anzMove * BODYPART_COST[MOVE] + obj.miningSetup.anzWork * BODYPART_COST[WORK] > availableEnergy) {
        return false;
      }
      return true;
    });

    if (mineralPlans.length === 0) {
      return null;
    }

    const selectedMineralsPlan = mineralPlans[0];
    if (selectedMineralsPlan.miningSetup === null) {
      return null;
    }

    const body: string[] = [];
    for (let i = 1; i <= selectedMineralsPlan.miningSetup.anzCarry; i++) {
      body.push(CARRY);
    }
    for (let i = 1; i <= selectedMineralsPlan.miningSetup.anzMove; i++) {
      body.push(MOVE);
    }
    for (let i = 1; i <= selectedMineralsPlan.miningSetup.anzWork; i++) {
      body.push(WORK);
    }

    const memory: MinerMemory = {
      job: CREEP_JOB_NONE,
      mineralId: selectedMineralsPlan.mineral.id,
      mineralType: selectedMineralsPlan.mineral.mineralType,
      oldPos: {
        x: 0,
        y: 0
      },
      role: MINER_ROLE_NAME,
      room: room.name,
      storageId: storage.id
    };

    return {
      body,
      importance: CreepPlanImportance.Normal,
      memory,
      name: MINER_ROLE_NAME + " " + room.name + " " + room.memory.miner.generation
    };
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.miner.generation++;
    room.memory.miner.lastCreepProduced = Game.time;
  }

  private getNextJob(creep: MinerCreep) {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const mineral = Game.getObjectById<Mineral>(creep.memory.mineralId);
    if (mineral === null || mineral.mineralAmount === 0) {
      creep.suicide();
    }
    if (CreepManager.isEmpty(creep)) {
      const closestSpawn = SpawnManager.getManager(room).getClosestSpawn(creep.pos);
      if (creep.ticksToLive / CREEP_LIFE_TIME < Config.CREEP_NEED_RENEW &&
        MinerManager.isBestMiner(creep) &&
        closestSpawn !== null &&
        closestSpawn.spawning === null &&
        room.energyAvailable >= Config.SPAWN_MIN_RENEW_ENERGY &&
        StorageManager.getResourceShare(StorageManager.getManager(this.roomName).getStorage() as StructureStorage, creep.memory.mineralType) < 0.1) {
        creep.memory.job = {
          spawnId: closestSpawn.id,
          type: MINER_JOB_TYPE_RENEW
        };
      } else {
        creep.memory.job = {
          type: MINER_JOB_TYPE_LOAD
        };
      }
    } else {
      creep.memory.job = {
        type: MINER_JOB_TYPE_UNLOAD
      };
    }
  }

  private getRoom(): MinerRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private initializeMemory(): void {
    const minerRoomMemory: MinerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(minerRoomMemory.miner)) {
      minerRoomMemory.miner = {
        generation: 0,
        lastCreepProduced: 0,
        storageDistances: {}
      };
    }
    if (!_.isNumber(minerRoomMemory.miner.generation)) {
      minerRoomMemory.miner.generation = 0;
    }
    if (!_.isObject(minerRoomMemory.miner.storageDistances)) {
      minerRoomMemory.miner.storageDistances = {};
    }
    if (!_.isNumber(minerRoomMemory.miner.lastCreepProduced)) {
      minerRoomMemory.miner.lastCreepProduced = 0;
    }
    MineralManager.getManager(this.roomName).getMinerals().forEach((mineral) => {
      if (!_.isNumber(minerRoomMemory.miner.storageDistances[mineral.id])) {
        minerRoomMemory.miner.storageDistances[mineral.id] = this.recalculateDistances(mineral.pos);
      }
    });
  }

  private recalculateDistances(pos: RoomPosition): number {
    return StorageManager.getMeanStorageDistancesInRoom(pos);
  }

  private refeshMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const mineralId in room.memory.miner.storageDistances) {
      if (!room.memory.miner.storageDistances.hasOwnProperty(mineralId)) {
        continue;
      }
      const mineral = Game.getObjectById<Mineral>(mineralId);
      if (mineral === null) {
        continue;
      }
      if (Math.floor(Game.time / 1500) * 1500 + 548 === Game.time) {
        room.memory.miner.storageDistances[mineralId] = this.recalculateDistances(mineral.pos);
      }
    }
  }

}
