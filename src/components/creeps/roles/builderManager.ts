import * as Config from "../../../config/config";
import {
  BUILDER_ROLE_NAME,
  BuilderRoleType, CacheRead, CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, CreepRoles,
  GetAndReserveResourceSourceOrSinkOptions, ResourceReservationType,
  ResourceSourceOrSinkType, ScreepsResourceSourceOrSink
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../../resources/ResourceSourceOrSink";
import {RoomManager} from "../../roomManager";
import {ConstructionManager} from "../../structures/constructionManager";
import {ContainerManager} from "../../structures/containerManager";
import {ControllerManager} from "../../structures/controllerManager";
import {RepairManager} from "../../structures/repairManager";
import {SourceManager} from "../../structures/sourceManager";
import {SpawnManager} from "../../structures/spawnManager";
import {TowerManager} from "../../structures/towerManager";
import {DefenderManager} from "./defenderManager";

interface BuilderManagers {
  [roomName: string]: BuilderManager;
}

const builderManagers: BuilderManagers = {};

const BUILDER_JOB_TYPE_LOAD = "load";
type BuilderJobTypeLoad = "load";
const BUILDER_JOB_TYPE_WAIT = "wait";
type BuilderJobTypeWait = "wait";
const BUILDER_JOB_TYPE_REPAIR = "repair";
type BuilderJobTypeRepair = "repair";
const BUILDER_JOB_TYPE_CONSTRUCT = "construct";
type BuilderJobTypeConstruct = "construct";

interface BuilderLoadJob {
  type: BuilderJobTypeLoad;
  energySourceId: string;
  energySourceType: ResourceSourceOrSinkType;
}

interface BuilderWaitJob {
  type: BuilderJobTypeWait;
  spawnId: string;
}

interface BuilderRepairJob {
  type: BuilderJobTypeRepair;
  structureId: string;
  maxHp?: number;
}

interface BuilderConstructJob {
  type: BuilderJobTypeConstruct;
  constructionSiteId: string;
}

interface BuilderMemory extends CreepMemory {
  role: BuilderRoleType;
  job: BuilderLoadJob | BuilderRepairJob | BuilderConstructJob | BuilderWaitJob | CreepJobNone;
}

interface BuilderCreep extends Creep {
  memory: BuilderMemory;
}

interface BuilderRoom extends Room {
  memory: {
    builders: {
      generation: number;
      lastCreepProduced: number;
    }
  };
}

export class BuilderManager {

  public static getManager(roomOrRoomName: Room | string): BuilderManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof builderManagers[roomName] === "undefined") {
      builderManagers[roomName] = new BuilderManager(roomName);
    }
    return builderManagers[roomName];
  }

  public static getConstructionSiteReservation(creep: Creep, constructionSite: ConstructionSite): number {
    if (CreepManager.getCreepRole(creep) !== CreepRoles.Builder || !_.isObject(creep.memory.job) ||
      creep.memory.job.type !== BUILDER_JOB_TYPE_CONSTRUCT || !_.isString(creep.memory.job.constructionSiteId)) {
      return 0;
    }
    const memoryConstructionSite = Game.getObjectById<ConstructionSite>(creep.memory.job.constructionSiteId);
    if (memoryConstructionSite === null || memoryConstructionSite.id === constructionSite.id) {
      return 0;
    }
    return CreepManager.getEnergyInCreep(creep);
  }

  public static holdsStructureReservation(creep: Creep, structure: Structure): boolean {
    if (CreepManager.getCreepRole(creep) !== CreepRoles.Builder || !_.isObject(creep.memory.job)) {
      return false;
    }
    if (creep.memory.job.type === BUILDER_JOB_TYPE_REPAIR && _.isString(creep.memory.job.structureId)) {
      const memoryStructure = Game.getObjectById<Structure>(creep.memory.job.structureId);
      return memoryStructure !== null && memoryStructure.id === structure.id;
    }
    return false;
  }

  public static getResourceSourceOrSinkReservation(creep: Creep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energySourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    if (resourceType !== RESOURCE_ENERGY || creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || creep.memory.job.type !== BUILDER_JOB_TYPE_LOAD ||
      creep.memory.job.energySourceType !== energySourceOrSinkType || !_.isString(creep.memory.job.energySourceId)) {
      return 0;
    }
    const memorySource = Game.getObjectById<Source>(creep.memory.job.energySourceId);
    if (memorySource === null || memorySource.id !== screepsEnergySourceOrSink.id) {
      return 0;
    }
    return CreepManager.getFreeCarryAmount(creep);
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

  public convertToBuilder(creep: Creep): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    (creep.memory as BuilderMemory) = {
      job: CREEP_JOB_NONE,
      role: BUILDER_ROLE_NAME,
      room: room.name
    };
  }

  public getBuilders(): BuilderCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === BUILDER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzBuilders(): number {
    return this.getBuilders().length;
  }

  public run() {
    this.getBuilders().forEach((creep) => {
      if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
        if (!creep.spawning) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_WAIT) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        if (spawn == null || (Math.abs(spawn.pos.x - creep.pos.x) <= 1 && Math.abs(spawn.pos.y - creep.pos.y) <= 1)) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_REPAIR) {
        const structure = Game.getObjectById<Structure>(creep.memory.job.structureId);
        if (CreepManager.getEnergyInCreep(creep) === 0 || structure === null || structure.hits === structure.hitsMax ||
          (_.isNumber(creep.memory.job.maxHp) && structure.hits >= creep.memory.job.maxHp)) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_CONSTRUCT) {
        const constructionSite = Game.getObjectById<Structure>(creep.memory.job.constructionSiteId);
        if (CreepManager.getEnergyInCreep(creep) === 0 || constructionSite === null) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySourceId);
        const energySourceType = creep.memory.job.energySourceType;
        if (energySource === null || CreepManager.getFreeCarryAmount(creep) === 0 || ResourceSourceOrSink.resourceSourceOrSinkIsEmpty(energySource, energySourceType, RESOURCE_ENERGY)) {
          this.getNextJob(creep);
        }
      }
    });

    this.getBuilders().forEach((creep) => {
      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_WAIT) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        CreepManager.moveTo(creep, spawn);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_REPAIR) {
        const structure = Game.getObjectById<Structure>(creep.memory.job.structureId);
        CreepManager.moveToRepair(creep, structure);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_CONSTRUCT) {
        const constructionSite = Game.getObjectById<ConstructionSite>(creep.memory.job.constructionSiteId);
        CreepManager.moveToConstruct(creep, constructionSite);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === BUILDER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySourceId);
        const energySourceType = creep.memory.job.energySourceType;
        CreepManager.moveToDrainResource(creep, energySource, energySourceType, RESOURCE_ENERGY);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, maxBuildEnergyInNearbySpawns: number): CreepPlan | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    if (!ControllerManager.getManager(room).controlled()) {
      return null;
    }
    if (DefenderManager.getManager(room).defenseMode()) {
      return null;
    }
    const lastCreepProduced = room.memory.builders.lastCreepProduced;
    if (lastCreepProduced === Game.time) {
      return null;
    }
    const availableEnergy = spawnRoom.energyAvailable;

    const bestBuilderAnzWorkerBlocks = Math.min(Config.BUILDER_MAX_WORKER_BLOCKS, Math.floor(maxBuildEnergyInNearbySpawns / Config.WORKER_BASIC_BLOCK_COST));
    const bestBuilderEnergy = bestBuilderAnzWorkerBlocks * Config.WORKER_BASIC_BLOCK_COST;
    if (availableEnergy < bestBuilderEnergy) {
      return null;
    }

    const bestBuilderCarryCapacity = bestBuilderAnzWorkerBlocks * Config.WORKER_BASIC_BLOCK_CARRY_CAPACITY;

    const anzBuilders = this.anzBuilders();

    const anzStorageStructures = RoomManager.getManager(room).anzStorageStructures();
    const anzTowers = TowerManager.getManager(room).anzTowers();

    const storedMinimumFillLevel = RoomManager.getManager(room).storedMinimumFillLevel();

    let missingBuildPower = ConstructionManager.getManager(room).getConstructionSitesMissingEnergy();
    let perfectBuilderAmount;
    if (anzTowers === 0) {
      missingBuildPower += Math.ceil(RepairManager.getManager(room).getUnrepairedHits() / REPAIR_POWER);
      perfectBuilderAmount = Math.ceil((missingBuildPower / bestBuilderCarryCapacity) / Config.BUILDER_MIN_ANZ_JOB_PER_CYCLE_FROM_SOURCE);
      perfectBuilderAmount = Math.min(perfectBuilderAmount, SourceManager.getManager(room).getAnzSource() + 1);
    } else {
      perfectBuilderAmount = Math.ceil((missingBuildPower / bestBuilderCarryCapacity) / Config.BUILDER_MIN_ANZ_JOB_PER_CYCLE_FROM_STORAGE);
      perfectBuilderAmount = Math.min(perfectBuilderAmount, Config.BUILDER_MAX_ANZ);
    }

    if (anzBuilders === 0 && perfectBuilderAmount > 0 ||
      anzBuilders < perfectBuilderAmount && (anzStorageStructures === 0 || storedMinimumFillLevel > 0.5) && lastCreepProduced < Game.time - 100) {

      // Ok ein Builder wird benötigt
      // Der 1. Builder wird gebuildet, egal wieviel Energie vorhanden ist
      // Alle darauffolgenden nur falls das Maximum möglich ist

      let body: string[] = [];
      for (let i = 1; i <= bestBuilderAnzWorkerBlocks; i++) {
        body = body.concat(Config.WORKER_BASIC_BLOCK);
      }
      const memory: BuilderMemory = {
        job: CREEP_JOB_NONE,
        role: BUILDER_ROLE_NAME,
        room: room.name
      };

      return {
        body,
        importance: CreepPlanImportance.Normal,
        memory,
        name: BUILDER_ROLE_NAME + " " + room.name + " " + room.memory.builders.generation
      };
    }

    return null;
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.builders.lastCreepProduced = Game.time;
    room.memory.builders.generation++;
  }

  private getNextJob(creep: BuilderCreep): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (CreepManager.getEnergyInCreep(creep) === 0) {
      const preferedEnergySourceTypes = [ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Container];
      const opt: GetAndReserveResourceSourceOrSinkOptions = {};
      if (ContainerManager.getManager(room).anzContainer() === 0) {
        preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Source);
        opt.sourceOrMineralAmountPerTick = CreepManager.getAmountPerTick(creep);
      }
      const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep), preferedEnergySourceTypes, ResourceReservationType.Withdraw, opt);
      if (energySource !== null) {
        creep.memory.job = {
          energySourceId: energySource.resourceSourceOrSink.id,
          energySourceType: energySource.type,
          type: BUILDER_JOB_TYPE_LOAD
        };
      } else {
        creep.memory.job = CREEP_JOB_NONE;
      }
    } else {
      const rampart = RepairManager.getManager(room).getAndReserveRampart(creep);
      if (rampart !== null) {
        creep.memory.job = {
          structureId: rampart.structure.id,
          type: BUILDER_JOB_TYPE_REPAIR
        };
        if (_.isNumber(rampart.maxHp)) {
          creep.memory.job.maxHp = rampart.maxHp;
        }
      } else {
        const constructionSite = ConstructionManager.getManager(room).getAndReserveConstructionSite(creep, CreepManager.getEnergyInCreep(creep));
        if (constructionSite !== null) {
          creep.memory.job = {
            constructionSiteId: constructionSite.id,
            type: BUILDER_JOB_TYPE_CONSTRUCT
          };
        } else {
          const structure = RepairManager.getManager(room).getAndReserveStructureNoRampart(creep);
          if (structure !== null) {
            creep.memory.job = {
              structureId: structure.structure.id,
              type: BUILDER_JOB_TYPE_REPAIR
            };
            if (_.isNumber(structure.maxHp)) {
              creep.memory.job.maxHp = structure.maxHp;
            }
          } else {
            if (CreepManager.getFreeCarryAmount(creep) > 0) {
              const preferedEnergySourceTypes = [ResourceSourceOrSinkType.DroppedResource, ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Container];
              const opt: GetAndReserveResourceSourceOrSinkOptions = {};
              if (ContainerManager.getManager(room).anzContainer() === 0) {
                preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Source);
                opt.sourceOrMineralAmountPerTick = CreepManager.getAmountPerTick(creep);
              }
              const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep),
                preferedEnergySourceTypes, ResourceReservationType.Withdraw, opt);
              if (energySource !== null) {
                creep.memory.job = {
                  energySourceId: energySource.resourceSourceOrSink.id,
                  energySourceType: energySource.type,
                  type: BUILDER_JOB_TYPE_LOAD
                };
              }
            } else {
              const closestSpawn = SpawnManager.getManager(room).getClosestSpawn(creep.pos);
              if (closestSpawn !== null && (Math.abs(closestSpawn.pos.x - creep.pos.x) > 1 || Math.abs(closestSpawn.pos.y - creep.pos.y) > 1)) {
                creep.memory.job = {
                  spawnId: closestSpawn.id,
                  type: BUILDER_JOB_TYPE_WAIT
                };
              } else {
                creep.memory.job = CREEP_JOB_NONE;
              }
            }
          }
        }
      }
    }
  }

  private getRoom(): BuilderRoom | null {
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
    if (!_.isObject(room.memory.builders)) {
      room.memory.builders = {
        generation: 0,
        lastCreepProduced: Game.time
      };
    }
    if (!_.isNumber(room.memory.builders.generation)) {
      room.memory.builders.generation = 0;
    }
    if (!_.isNumber(room.memory.builders.lastCreepProduced)) {
      room.memory.builders.lastCreepProduced = 0;
    }
    this.getBuilders().forEach((creep) => {
      if (!_.isString(creep.memory.job) && !_.isObject(creep.memory.job)) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
      if (_.isString(creep.memory.job) && creep.memory.job !== CREEP_JOB_NONE) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
      if (creep.memory.job !== CREEP_JOB_NONE && creep.memory.job.type !== BUILDER_JOB_TYPE_CONSTRUCT && creep.memory.job.type !== BUILDER_JOB_TYPE_LOAD &&
        creep.memory.job.type !== BUILDER_JOB_TYPE_REPAIR && creep.memory.job.type !== BUILDER_JOB_TYPE_WAIT) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
    });
  }

}
