import * as Config from "../../../config/config";
import {WORKER_BASIC_BLOCK} from "../../../config/config";
import {
  CacheRead,
  CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, GetAndReserveResourceSourceOrSinkOptions,
  ResourceReservationType,
  ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink,
  UPGRADER_ROLE_NAME,
  UpgraderRoleType
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
import {ControllerManager} from "../../structures/controllerManager";
import {ExtensionManager} from "../../structures/extensionManager";
import {MovementManager} from "../../structures/movementManager";
import {SpawnManager} from "../../structures/spawnManager";
import {DefenderManager} from "./defenderManager";

interface UpgraderManagers {
  [roomName: string]: UpgraderManager;
}

const upgraderManagers: UpgraderManagers = {};

const UPGRADER_JOB_TYPE_LOAD = "load";
type UpgraderJobTypeLoad = "load";
const UPGRADER_JOB_TYPE_UNLOAD = "unload";
type UpgraderJobTypeUnload = "unload";
const UPGRADER_JOB_TYPE_UPGRADE = "upgrade";
type UpgraderJobTypeUpgrade = "upgrade";
const UPGRADER_JOB_TYPE_RENEW = "renew";
type UpgraderJobTypeRenew = "renew";

interface UpgraderJobLoad {
  "type": UpgraderJobTypeLoad;
  energySourceId: string;
  energySourceType: ResourceSourceOrSinkType;
}

interface UpgraderJobUnload {
  "type": UpgraderJobTypeUnload;
  energySinkId: string;
  energySinkType: ResourceSourceOrSinkType;
}

interface UpgraderJobUpgrade {
  "type": UpgraderJobTypeUpgrade;
  controllerId: string;
}

interface UpgraderJobRenew {
  "type": UpgraderJobTypeRenew;
  spawnId: string;
}

interface LastSinks {
  id: string;
  type: ResourceSourceOrSinkType;
  time: number;
}

interface UpgraderMemory extends CreepMemory {
  role: UpgraderRoleType;
  job: UpgraderJobLoad | UpgraderJobUnload | UpgraderJobUpgrade | UpgraderJobRenew | CreepJobNone;
  lastSinks: LastSinks[];
  oldPos: {
    x: number;
    y: number;
  };
}

interface UpgraderCreep extends Creep {
  memory: UpgraderMemory;
}

interface UpgraderRoom extends Room {
  memory: {
    upgraders: {
      generation: number;
      lastCreepProduced: number;
    }
  };
}

export class UpgraderManager {

  public static getManager(roomOrRoomName: Room | string): UpgraderManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof upgraderManagers[roomName] === "undefined") {
      upgraderManagers[roomName] = new UpgraderManager(roomName);
    }
    return upgraderManagers[roomName];
  }

  public static getEnergySourceOrSinkReservation(creep: UpgraderCreep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energySourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    if (resourceType !== RESOURCE_ENERGY || creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || (creep.memory.job.type !== UPGRADER_JOB_TYPE_LOAD && creep.memory.job.type !== UPGRADER_JOB_TYPE_UNLOAD)) {
      return 0;
    }
    if (creep.memory.job.type === UPGRADER_JOB_TYPE_LOAD && (creep.memory.job.energySourceType !== energySourceOrSinkType || !_.isString(creep.memory.job.energySourceId))) {
      return 0;
    }
    if (creep.memory.job.type === UPGRADER_JOB_TYPE_UNLOAD && (creep.memory.job.energySinkType !== energySourceOrSinkType || !_.isString(creep.memory.job.energySinkId))) {
      return 0;
    }
    if (creep.memory.job.type === UPGRADER_JOB_TYPE_LOAD) {
      const memorySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySourceId);
      if (memorySource === null || memorySource.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return creep.carryCapacity - CreepManager.getEnergyInCreep(creep);
    }
    if (creep.memory.job.type === UPGRADER_JOB_TYPE_UNLOAD) {
      const memorySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
      if (memorySink === null || memorySink.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getEnergyInCreep(creep);
    }
    return 0;
  }

  public static holdsRenewReservation(spawn: Spawn, creep: UpgraderCreep): boolean {
    if (creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || creep.memory.job.type !== UPGRADER_JOB_TYPE_RENEW) {
      return false;
    }
    if (spawn.id !== creep.memory.job.spawnId) {
      return false;
    }
    return true;
  }

  private static isLeadUpgrader(creep: UpgraderCreep): boolean {
    const upgraders = UpgraderManager.getManager(creep.memory.room).getUpgraders().sort((u1, u2) => {
      const u1Cost = CreepManager.calculateBodyCosts(u1);
      const u2Cost = CreepManager.calculateBodyCosts(u2);
      if (u1Cost !== u2Cost) {
        return u2Cost - u1Cost;
      }
      if (u1.id < u2.id) {
        return -1;
      }
      if (u1.id > u2.id) {
        return 1;
      }
      return 0;
    });
    return upgraders.length !== 0 && creep.id === upgraders[0].id;
  }

  private static addSinkServiced(creep: UpgraderCreep, screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType) {
    creep.memory.lastSinks.push({id: screepsResourceSourceOrSink.id, time: Game.time, type: resourceSourceOrSinkType});
  }

  private static servicedSinks(creep: UpgraderCreep) {
    creep.memory.lastSinks = creep.memory.lastSinks.filter((lastSink) => lastSink.type === ResourceSourceOrSinkType.Tower && lastSink.time >= Game.time - 20 ||
      lastSink.type !== ResourceSourceOrSinkType.Tower && lastSink.time >= Game.time - 10);
    return creep.memory.lastSinks;
  }

  private static sinkWasServiced(creep: UpgraderCreep, sinkId: string) {
    return _.some(UpgraderManager.servicedSinks(creep), (servicedSink) => servicedSink.id === sinkId);
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

  public getUpgraders(): UpgraderCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === UPGRADER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzUpgraders(): number {
    return this.getUpgraders().length;
  }

  public run(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.getUpgraders().forEach((upgrader) => {
      if (_.isUndefined(upgrader.memory.job) || upgrader.memory.job === CREEP_JOB_NONE) {
        if (!upgrader.spawning) {
          this.getNextJob(upgrader);
        }
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(upgrader.memory.job.energySourceId);
        const energySourceType = upgrader.memory.job.energySourceType;
        if (energySource === null || CreepManager.getFreeCarryAmount(upgrader) === 0 || ResourceSourceOrSink.resourceSourceOrSinkIsEmpty(energySource, energySourceType, RESOURCE_ENERGY)) {
          this.getNextJob(upgrader);
        }
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(upgrader.memory.job.energySinkId);
        const energySinkType = upgrader.memory.job.energySinkType;
        if (energySink === null || UpgraderManager.sinkWasServiced(upgrader, energySink.id) || ResourceSourceOrSink.resourceSourceOrSinkIsFull(energySink, energySinkType, RESOURCE_ENERGY)) {
          this.getNextJob(upgrader);
        }
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_UPGRADE) {
        if (CreepManager.getEnergyInCreep(upgrader) === 0) {
          this.getNextJob(upgrader);
        }
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(upgrader.memory.job.spawnId);
        if (spawn == null || upgrader.ticksToLive / CREEP_LIFE_TIME > Config.CREEP_STOP_RENEW || spawn.spawning !== null || upgrader.room.energyAvailable < Config.SPAWN_MIN_RENEW_ENERGY) {
          this.getNextJob(upgrader);
        }
      }

      if (!upgrader.spawning && (upgrader.memory.oldPos.x !== upgrader.pos.x || upgrader.memory.oldPos.y !== upgrader.pos.y)) {
        MovementManager.usedRoad(upgrader.pos);
        upgrader.memory.oldPos.x = upgrader.pos.x;
        upgrader.memory.oldPos.y = upgrader.pos.y;
      }

      if (upgrader.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_LOAD) {
        const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(upgrader.memory.job.energySourceId);
        const energySourceType = upgrader.memory.job.energySourceType;
        CreepManager.moveToDrainResource(upgrader, energySource, energySourceType, RESOURCE_ENERGY);
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(upgrader.memory.job.energySinkId);
        const energySinkType = upgrader.memory.job.energySinkType;
        if (energySink !== null && energySink.pos.getRangeTo(upgrader.pos) === 1) {
          UpgraderManager.addSinkServiced(upgrader, energySink, energySinkType);
        }
        CreepManager.moveToDropResource(upgrader, energySink, energySinkType, RESOURCE_ENERGY);
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_UPGRADE) {
        const controller = Game.getObjectById<StructureController>(upgrader.memory.job.controllerId);
        CreepManager.moveToUpgradeController(upgrader, controller);
      } else if (_.isObject(upgrader.memory.job) && upgrader.memory.job.type === UPGRADER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(upgrader.memory.job.spawnId);
        CreepManager.moveToRenew(upgrader, spawn);
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
    const availableEnergy = spawnRoom.energyAvailable;
    if (DefenderManager.getManager(room).defenseMode()) {
      return null;
    }
    if (room.memory.upgraders.lastCreepProduced === Game.time) {
      return null;
    }
    if (availableEnergy < Config.WORKER_BASIC_BLOCK_COST) {
      return null;
    }
    const lastCreepProduced = room.memory.upgraders.lastCreepProduced;
    if (lastCreepProduced === Game.time) {
      return null;
    }
    const anzUpgraders = this.getUpgraders().length;

    const bestUpgraderEnergyInAllRooms = Math.min(Math.floor(maxBuildEnergyInNearbySpawns / Config.WORKER_BASIC_BLOCK_COST), Config.UPGRADER_MAX_WORKER_BLOCKS) * Config.WORKER_BASIC_BLOCK_COST;

    const hasMaxUpgrader = _.some(this.getUpgraders(), (creep) => {
      return CreepManager.calculateBodyCosts(creep) === bestUpgraderEnergyInAllRooms;
    });

    const bestUpgraderEnergyinThisRoom = Math.min(Math.floor(room.energyCapacityAvailable / Config.WORKER_BASIC_BLOCK_COST) * Config.WORKER_BASIC_BLOCK_COST, bestUpgraderEnergyInAllRooms);

    const bestUpgraderEnergyinSpawnRoomRightNow = Math.min(Math.floor(spawnRoom.energyAvailable / Config.WORKER_BASIC_BLOCK_COST) * Config.WORKER_BASIC_BLOCK_COST, bestUpgraderEnergyInAllRooms);

    const storedMinimumFillLevel = RoomManager.getManager(room).storedMinimumFillLevel();
    const anzStorageStructures = RoomManager.getManager(room).anzStorageStructures();
    const anzExtension = ExtensionManager.getManager(room).anzExtensions();

    const controller = ControllerManager.getManager(room).getController() as StructureController;

    if (!hasMaxUpgrader && bestUpgraderEnergyinThisRoom < bestUpgraderEnergyInAllRooms && bestUpgraderEnergyinSpawnRoomRightNow === bestUpgraderEnergyInAllRooms ||
      anzUpgraders === 0 && controller.ticksToDowngrade < 3000 && bestUpgraderEnergyinSpawnRoomRightNow > 0 ||
      anzUpgraders === 0 && controller.level < 2 && bestUpgraderEnergyinSpawnRoomRightNow === bestUpgraderEnergyInAllRooms ||
      anzUpgraders === 0 && anzExtension > 0 && bestUpgraderEnergyinSpawnRoomRightNow === bestUpgraderEnergyInAllRooms ||
      anzUpgraders < Config.UPGRADER_MAX && anzStorageStructures > 0 && lastCreepProduced < Game.time - 200 && storedMinimumFillLevel > 0.75 && room.name === spawnRoom.name && bestUpgraderEnergyinSpawnRoomRightNow === bestUpgraderEnergyinThisRoom) {

      let body: string[] = [];
      while (CreepManager.calculateBodyPlanCosts(body) < bestUpgraderEnergyinSpawnRoomRightNow) {
        body = body.concat(WORKER_BASIC_BLOCK);
      }
      const memory: UpgraderMemory = {
        job: CREEP_JOB_NONE,
        lastSinks: [],
        oldPos: {
          x: 0,
          y: 0
        },
        role: UPGRADER_ROLE_NAME,
        room: room.name
      };

      return {
        body,
        importance: (anzUpgraders === 0) ? CreepPlanImportance.Important : CreepPlanImportance.Insignificant,
        memory,
        name: UPGRADER_ROLE_NAME + " " + room.name + " " + room.memory.upgraders.generation
      };
    }

    return null;
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.upgraders.lastCreepProduced = Game.time;
    room.memory.upgraders.generation++;
  }

  private getNextJob(creep: UpgraderCreep): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null || !controller.my) {
      return;
    }
    if (CreepManager.getEnergyInCreep(creep) === 0) {
      const closestSpawn = SpawnManager.getManager(room).getClosestSpawn(creep.pos);
      if (creep.ticksToLive / CREEP_LIFE_TIME < Config.CREEP_NEED_RENEW && UpgraderManager.isLeadUpgrader(creep) && creep.hits === creep.hitsMax && closestSpawn !== null &&
        closestSpawn.spawning === null && room.energyAvailable >= Config.SPAWN_MIN_RENEW_ENERGY) {
        creep.memory.job = {
          spawnId: closestSpawn.id,
          type: UPGRADER_JOB_TYPE_RENEW
        };
      } else {
        const preferedEnergySourceTypes = [ResourceSourceOrSinkType.DroppedResource, ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Container];
        const opt: GetAndReserveResourceSourceOrSinkOptions = {};
        if (controller.ticksToDowngrade < 3000 || controller.level < 2) {
          preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Tower);
          preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Source);
          opt.sourceOrMineralAmountPerTick = CreepManager.getAmountPerTick(creep);
        }
        const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep), preferedEnergySourceTypes, ResourceReservationType.Withdraw, opt);
        if (energySource !== null) {
          creep.memory.job = {
            energySourceId: energySource.resourceSourceOrSink.id,
            energySourceType: energySource.type,
            type: UPGRADER_JOB_TYPE_LOAD
          };
        } else {
          creep.memory.job = CREEP_JOB_NONE;
        }
      }
    } else if (controller.ticksToDowngrade < 3000) {
      creep.memory.job = {
        controllerId: controller.id,
        type: UPGRADER_JOB_TYPE_UPGRADE
      };
    } else {
      const preferedEnergySinkTypes = [ResourceSourceOrSinkType.Tower, ResourceSourceOrSinkType.Spawn, ResourceSourceOrSinkType.Extension, ResourceSourceOrSinkType.Lab];
      const energySink = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep), preferedEnergySinkTypes, ResourceReservationType.Add, {
        filter: (sink) => !UpgraderManager.sinkWasServiced(creep, sink.resourceSourceOrSink.id)
      });
      if (energySink !== null) {
        creep.memory.job = {
          energySinkId: energySink.resourceSourceOrSink.id,
          energySinkType: energySink.type,
          type: UPGRADER_JOB_TYPE_UNLOAD
        };
      } else {
        if (CreepManager.getFreeCarryAmount(creep) > 0) {
          const preferedEnergySourceTypes = [ResourceSourceOrSinkType.DroppedResource, ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Container];
          const opt: GetAndReserveResourceSourceOrSinkOptions = {};
          if (controller.ticksToDowngrade < 3000) {
            preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Tower);
            preferedEnergySourceTypes.push(ResourceSourceOrSinkType.Source);
            opt.sourceOrMineralAmountPerTick = CreepManager.getAmountPerTick(creep);
          }
          const energySource = RoomManager.getManager(room).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getFreeCarryAmount(creep), preferedEnergySourceTypes, ResourceReservationType.Withdraw, opt);
          if (energySource !== null) {
            creep.memory.job = {
              energySourceId: energySource.resourceSourceOrSink.id,
              energySourceType: energySource.type,
              type: UPGRADER_JOB_TYPE_LOAD
            };
          } else {
            const storedMinimumFillLevel = RoomManager.getManager(room).storedMinimumFillLevel();
            if (storedMinimumFillLevel > 0.75 || !UpgraderManager.isLeadUpgrader(creep) || controller.level < 2) {
              creep.memory.job = {
                controllerId: controller.id,
                type: UPGRADER_JOB_TYPE_UPGRADE
              };
            } else {
              creep.memory.job = CREEP_JOB_NONE;
            }
          }
        } else {
          const storedMinimumFillLevel = RoomManager.getManager(room).storedMinimumFillLevel();
          if (storedMinimumFillLevel > 0.75 || !UpgraderManager.isLeadUpgrader(creep) || controller.level < 2) {
            creep.memory.job = {
              controllerId: controller.id,
              type: UPGRADER_JOB_TYPE_UPGRADE
            };
          } else {
            creep.memory.job = CREEP_JOB_NONE;
          }
        }
      }
    }
  }

  private getRoom(): UpgraderRoom | null {
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
    if (!_.isObject(room.memory.upgraders)) {
      room.memory.upgraders = {
        generation: 0,
        lastCreepProduced: 0
      };
    }
    if (!_.isNumber(room.memory.upgraders.generation)) {
      room.memory.upgraders.generation = 0;
    }
    if (!_.isNumber(room.memory.upgraders.lastCreepProduced)) {
      room.memory.upgraders.lastCreepProduced = 0;
    }
    this.getUpgraders().forEach((creep) => {
      if (!_.isString(creep.memory.job) && !_.isObject(creep.memory.job)) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
      if (_.isString(creep.memory.job) && creep.memory.job !== CREEP_JOB_NONE) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
      if (creep.memory.job !== CREEP_JOB_NONE && creep.memory.job.type !== UPGRADER_JOB_TYPE_LOAD && creep.memory.job.type !== UPGRADER_JOB_TYPE_UNLOAD &&
        creep.memory.job.type !== UPGRADER_JOB_TYPE_UPGRADE && creep.memory.job.type !== UPGRADER_JOB_TYPE_RENEW) {
        creep.memory.job = CREEP_JOB_NONE;
        return;
      }
      if (!_.isArray(creep.memory.lastSinks)) {
        creep.memory.lastSinks = [];
      }
    });
  }

}
