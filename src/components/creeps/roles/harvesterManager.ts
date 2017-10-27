import * as Config from "../../../config/config";
import {
  CacheRead,
  CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, HARVESTER_ROLE_NAME, HarvesterRoleType,
  ResourceReservationType,
  ResourceSourceOrSinkType, ScreepsResourceSourceOrSink
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../../resources/ResourceSourceOrSink";
import {
  RoomManager
} from "../../roomManager";
import {ContainerManager} from "../../structures/containerManager";
import {ControllerManager} from "../../structures/controllerManager";
import {ExtensionManager} from "../../structures/extensionManager";
import {MovementManager} from "../../structures/movementManager";
import {HarvestingSetup, SourceManager} from "../../structures/sourceManager";
import {SpawnManager} from "../../structures/spawnManager";
import {StorageManager} from "../../structures/storageManager";
import {TowerManager} from "../../structures/towerManager";
import {DefenderManager} from "./defenderManager";

interface HarvesterManagers {
  [roomName: string]: HarvesterManager;
}

const harvesterManagers: HarvesterManagers = {};

const HARVESTER_JOB_TYPE_LOAD = "load";
type HarvesterJobTypeLoad = "load";
const HARVESTER_JOB_TYPE_UNLOAD = "unload";
type HarvesterJobTypeUnload = "unload";
const HARVESTER_JOB_TYPE_RENEW = "renew";
type HarvesterJobTypeRenew = "renew";

interface HarvesterLoadJob {
  "type": HarvesterJobTypeLoad;
}

interface HarvesterRenewJob {
  "type": HarvesterJobTypeRenew;
  spawnId: string;
}

interface HarvesterUnloadJob {
  "type": HarvesterJobTypeUnload;
  energySinkId: string;
  energySinkType: ResourceSourceOrSinkType;
}

interface HarvesterMemory extends CreepMemory {
  role: HarvesterRoleType;
  job: HarvesterRenewJob | HarvesterLoadJob | HarvesterUnloadJob | CreepJobNone;
  energySourceId: string;
  oldPos: {
    x: number;
    y: number;
  };
}

interface HarvesterCreep extends Creep {
  memory: HarvesterMemory;
}

interface HarvesterRoom extends Room {
  memory: {
    harvesters: {
      generation: number;
      lastCreepProduced: number;
      meanSinkDistances: {
        [sourceId: string]: number;
      }
    }
  };
}

export class HarvesterManager {

  public static getManager(roomOrRoomName: Room | string): HarvesterManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof harvesterManagers[roomName] === "undefined") {
      harvesterManagers[roomName] = new HarvesterManager(roomName);
    }
    return harvesterManagers[roomName];
  }

  public static getResourceSourceOrSinkReservation(creep: HarvesterCreep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energySourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    if (resourceType !== RESOURCE_ENERGY || creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || (creep.memory.job.type !== HARVESTER_JOB_TYPE_LOAD && creep.memory.job.type !== HARVESTER_JOB_TYPE_UNLOAD)) {
      return 0;
    }
    if (creep.memory.job.type === HARVESTER_JOB_TYPE_LOAD && !_.isString(creep.memory.energySourceId)) {
      return 0;
    }
    if (creep.memory.job.type === HARVESTER_JOB_TYPE_UNLOAD && (creep.memory.job.energySinkType !== energySourceOrSinkType || !_.isString(creep.memory.job.energySinkId))) {
      return 0;
    }
    if (creep.memory.job.type === HARVESTER_JOB_TYPE_LOAD) {
      const memorySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.energySourceId);
      if (memorySource === null || memorySource.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getFreeCarryAmount(creep);
    }
    if (creep.memory.job.type === HARVESTER_JOB_TYPE_UNLOAD) {
      const memorySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
      if (memorySink === null || memorySink.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getEnergyInCreep(creep);
    }
    return 0;
  }

  public static holdsRenewReservation(spawn: Spawn, creep: HarvesterCreep): boolean {
    if (creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || creep.memory.job.type !== HARVESTER_JOB_TYPE_RENEW) {
      return false;
    }
    if (spawn.id !== creep.memory.job.spawnId) {
      return false;
    }
    return true;
  }

  private static isBestHarvester(creep: HarvesterCreep): boolean {
    if (creep.hits !== creep.hitsMax) {
      return false;
    }
    const source = Game.getObjectById<Source>(creep.memory.energySourceId);
    if (source === null) {
      return false;
    }
    const harvestingSetup = HarvesterManager.getHarvestingSetup(source, SpawnManager.getMaxBuildEnergy());
    if (harvestingSetup === null) {
      return false;
    }
    return harvestingSetup.anzCarry === CreepManager.anzTypeParts(creep, CARRY) && harvestingSetup.anzWork === CreepManager.anzTypeParts(creep, WORK) && harvestingSetup.anzMove === CreepManager.anzTypeParts(creep, MOVE);
  }

  private static getHarvestingSetup(source: Source, buildEnergy: number): HarvestingSetup | null {
    const harvesterRoom = HarvesterManager.getManager(source.room).getRoom();
    if (harvesterRoom === null) {
      return null;
    }
    const meanDistance = harvesterRoom.memory.harvesters.meanSinkDistances[source.id];
    return SourceManager.getHarvestingSetup(buildEnergy, meanDistance, source.energyCapacity, SourceManager.getAnzSourceSeats(source));
  }

  private energySinkTypes = [ResourceSourceOrSinkType.Container, ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Spawn, ResourceSourceOrSinkType.Extension, ResourceSourceOrSinkType.Tower];

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getHarvesters(): HarvesterCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === HARVESTER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzHarvesters(): number {
    return this.getHarvesters().length;
  }

  public run(): void {
    this.refeshMemory();
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.getHarvesters().forEach((creep) => {
      if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
        if (!creep.spawning) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        if (spawn == null || creep.ticksToLive / CREEP_LIFE_TIME > Config.CREEP_STOP_RENEW || spawn.spawning !== null || creep.room.energyAvailable < Config.SPAWN_MIN_RENEW_ENERGY) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
        const energySinkType = creep.memory.job.energySinkType;
        if (CreepManager.getEnergyInCreep(creep) === 0 || energySink === null || ResourceSourceOrSink.resourceSourceOrSinkIsFull(energySink, energySinkType, RESOURCE_ENERGY)) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.energySourceId);
        if (energySource === null || CreepManager.getFreeCarryAmount(creep) === 0 || ResourceSourceOrSink.resourceSourceOrSinkIsEmpty(energySource, ResourceSourceOrSinkType.Source, RESOURCE_ENERGY)) {
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
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        CreepManager.moveToRenew(creep, spawn);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
        const energySinkType = creep.memory.job.energySinkType;
        CreepManager.moveToDropResource(creep, energySink, energySinkType, RESOURCE_ENERGY);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === HARVESTER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.energySourceId);
        CreepManager.moveToDrainResource(creep, energySource, ResourceSourceOrSinkType.Source, RESOURCE_ENERGY);
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
    const anzEnergyStorages = RoomManager.getManager(room).anzStorageStructures();
    if (anzEnergyStorages === 0) {
      return null;
    }
    if (room.memory.harvesters.lastCreepProduced === Game.time) {
      return null;
    }
    const anzHarvesters = HarvesterManager.getManager(room).getHarvesters().length;

    const sourcesPlans = SourceManager.getManager(room).getSources().map((source) => {
      return {
        harvestingSetup: HarvesterManager.getHarvestingSetup(source, maxBuildEnergyInNearbySpawns),
        source
      };
    }).filter((obj) => {
      const anzHarvestersSource = HarvesterManager.getManager(room).getHarvesters().filter((creep) => creep.memory.energySourceId === obj.source.id).length;
      if (obj === null || obj.harvestingSetup === null) {
        return false;
      }
      return anzHarvestersSource < obj.harvestingSetup.anzHarvesters;
    }).filter((obj) => {
      if (obj === null || obj.harvestingSetup === null) {
        return false;
      }
      return obj.harvestingSetup.anzCarry * BODYPART_COST[CARRY] + obj.harvestingSetup.anzMove * BODYPART_COST[MOVE] + obj.harvestingSetup.anzWork * BODYPART_COST[WORK] <= availableEnergy;
    });

    if (sourcesPlans.length === 0) {
      return null;
    }

    const selectedSourcesPlan = sourcesPlans[0];
    if (selectedSourcesPlan.harvestingSetup === null) {
      return null;
    }

    const body: string[] = [];
    for (let i = 1; i <= selectedSourcesPlan.harvestingSetup.anzCarry; i++) {
      body.push(CARRY);
    }
    for (let i = 1; i <= selectedSourcesPlan.harvestingSetup.anzMove; i++) {
      body.push(MOVE);
    }
    for (let i = 1; i <= selectedSourcesPlan.harvestingSetup.anzWork; i++) {
      body.push(WORK);
    }
    const memory: HarvesterMemory = {
      energySourceId: selectedSourcesPlan.source.id,
      job: CREEP_JOB_NONE,
      oldPos: {
        x: 0,
        y: 0
      },
      role: HARVESTER_ROLE_NAME,
      room: room.name
    };

    return {
      body,
      importance: (anzHarvesters === 0) ? CreepPlanImportance.Important : CreepPlanImportance.Normal,
      memory,
      name: HARVESTER_ROLE_NAME + " " + room.name + " " + room.memory.harvesters.generation
    };
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.harvesters.generation++;
    room.memory.harvesters.lastCreepProduced = Game.time;
  }

  private getNextJob(creep: HarvesterCreep) {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (CreepManager.getEnergyInCreep(creep) === 0) {
      const closestSpawn = SpawnManager.getManager(room).getClosestSpawn(creep.pos);
      if (creep.ticksToLive / CREEP_LIFE_TIME < Config.CREEP_NEED_RENEW && HarvesterManager.isBestHarvester(creep) && closestSpawn !== null && closestSpawn.spawning === null && room.energyAvailable >= Config.SPAWN_MIN_RENEW_ENERGY) {
        creep.memory.job = {
          spawnId: closestSpawn.id,
          type: HARVESTER_JOB_TYPE_RENEW
        };
      } else {
        const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep)
          , [ResourceSourceOrSinkType.Source], ResourceReservationType.Withdraw, {
            filter: (e) => e.resourceSourceOrSink.id === creep.memory.energySourceId,
            sourceOrMineralAmountPerTick: CreepManager.getAmountPerTick(creep)
          });
        if (energySource !== null) {
          creep.memory.job = {
            type: HARVESTER_JOB_TYPE_LOAD
          };
        } else {
          creep.memory.job = CREEP_JOB_NONE;
        }
      }
    } else {
      const energySink = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getEnergyInCreep(creep),
        this.energySinkTypes, ResourceReservationType.Add);
      if (energySink !== null) {
        creep.memory.job = {
          energySinkId: energySink.resourceSourceOrSink.id,
          energySinkType: energySink.type,
          type: HARVESTER_JOB_TYPE_UNLOAD
        };
      } else if (CreepManager.getFreeCarryAmount(creep) > 0) {
        const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep)
          , [ResourceSourceOrSinkType.Source], ResourceReservationType.Withdraw, {
            filter: (e) => e.resourceSourceOrSink.id === creep.memory.energySourceId,
            sourceOrMineralAmountPerTick: CreepManager.getAmountPerTick(creep)
          });
        if (energySource !== null) {
          creep.memory.job = {
            type: HARVESTER_JOB_TYPE_LOAD
          };
        }
      } else {
        creep.memory.job = CREEP_JOB_NONE;
      }
    }
  }

  private getRoom(): HarvesterRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private initializeMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.harvesters)) {
      room.memory.harvesters = {
        generation: 0,
        lastCreepProduced: 0,
        meanSinkDistances: {}
      };
    }
    if (!_.isNumber(room.memory.harvesters.generation)) {
      room.memory.harvesters.generation = 0;
    }
    if (!_.isObject(room.memory.harvesters.meanSinkDistances)) {
      room.memory.harvesters.meanSinkDistances = {};
    }
    if (!_.isNumber(room.memory.harvesters.lastCreepProduced)) {
      room.memory.harvesters.lastCreepProduced = 0;
    }
    SourceManager.getManager(room).getSources().forEach((source: Source) => {
      if (!_.isNumber(room.memory.harvesters.meanSinkDistances[source.id])) {
        room.memory.harvesters.meanSinkDistances[source.id] = this.recalculateDistances(source.pos);
      }
    });
  }

  private recalculateDistances(pos: RoomPosition): number {
    let distance = 0;
    for (const energySinkType of this.energySinkTypes) {
      switch (energySinkType) {
        case ResourceSourceOrSinkType.Storage:
          distance = StorageManager.getMeanStorageDistancesInRoom(pos);
          if (distance !== 0) {
            return distance;
          }
          break;
        case ResourceSourceOrSinkType.Container:
          distance = ContainerManager.getMeanContainerDistancesInRoom(pos);
          if (distance !== 0) {
            return distance;
          }
          break;
        case ResourceSourceOrSinkType.Extension:
          distance = ExtensionManager.getMeanExtensionDistancesInRoom(pos);
          if (distance !== 0) {
            return distance;
          }
          break;
        case ResourceSourceOrSinkType.Spawn:
          distance = SpawnManager.getMeanSpawnDistancesInRoom(pos);
          if (distance !== 0) {
            return distance;
          }
          break;
        case ResourceSourceOrSinkType.Tower:
          distance = TowerManager.getMeanTowerDistancesInRoom(pos);
          if (distance !== 0) {
            return distance;
          }
          break;
      }
    }
    return distance;
  }

  private refeshMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const sourceId in room.memory.harvesters.meanSinkDistances) {
      if (!room.memory.harvesters.meanSinkDistances.hasOwnProperty(sourceId)) {
        continue;
      }
      const source = Game.getObjectById<Source>(sourceId);
      if (source === null) {
        continue;
      }
      if (Math.floor(Game.time / 1500) * 1500 + 43 === Game.time) {
        room.memory.harvesters.meanSinkDistances[sourceId] = this.recalculateDistances(source.pos);
      }
    }
  }

}
