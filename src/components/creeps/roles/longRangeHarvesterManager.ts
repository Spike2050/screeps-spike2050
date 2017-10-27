import * as Config from "../../../config/config";
import {
  CacheRead,
  CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, LONG_RANGE_HARVESTER_ROLE_NAME,
  LongRangeHarvesterRoleType, ResourceReservationType,
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
import {ControllerManager} from "../../structures/controllerManager";
import {MovementManager} from "../../structures/movementManager";
import {RoadManager} from "../../structures/roadManager";
import {HarvestingSetup, SourceManager} from "../../structures/sourceManager";
import {SpawnManager} from "../../structures/spawnManager";
import {StorageManager} from "../../structures/storageManager";
import {ScoutManager} from "./scoutManager";

interface LongRangeHarvesterManagers {
  [roomName: string]: LongRangeHarvesterManager;
}

const longRangeHarvesterManagers: LongRangeHarvesterManagers = {};

const LONG_RANGE_HARVESTER_JOB_TYPE_LOAD = "load";
type LongRangeHarvesterJobTypeLoad = "load";
const LONG_RANGE_HARVESTER_JOB_TYPE_BUILD_ROAD = "buildRoad";
type LongRangeHarvesterJobTypeBuildRoad = "buildRoad";
const LONG_RANGE_HARVESTER_JOB_TYPE_REPAIR_ROAD = "repairRoad";
type LongRangeHarvesterJobTypeRepairRoad = "repairRoad";
const LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD = "unload";
type LongRangeHarvesterJobTypeUnload = "unload";
const LONG_RANGE_HARVESTER_JOB_TYPE_RENEW = "renew";
type LongRangeHarvesterJobTypeRenew = "renew";

interface LongRangeHarvesterLoadJob {
  "type": LongRangeHarvesterJobTypeLoad;
}

interface LongRangeHarvesterBuildRoadJob {
  "type": LongRangeHarvesterJobTypeBuildRoad;
  constructionSiteId: string;
}

interface LongRangeHarvesterRepairRoadJob {
  "type": LongRangeHarvesterJobTypeRepairRoad;
  roadId: string;
}

interface LongRangeHarvesterUnloadJob {
  "type": LongRangeHarvesterJobTypeUnload;
  energySinkId: string;
  energySinkType: ResourceSourceOrSinkType;
}

interface LongRangeHarvesterRenewJob {
  "type": LongRangeHarvesterJobTypeRenew;
  spawnId: string;
}

interface LongRangeHarvesterMemory extends CreepMemory {
  role: LongRangeHarvesterRoleType;
  job: LongRangeHarvesterLoadJob | LongRangeHarvesterBuildRoadJob | LongRangeHarvesterRepairRoadJob | LongRangeHarvesterUnloadJob | LongRangeHarvesterRenewJob | CreepJobNone;
  energySourceId: string;
  oldPos: {
    x: number;
    y: number;
  };
  unloadRoom: string;
}

interface LongRangeHarvesterCreep extends Creep {
  memory: LongRangeHarvesterMemory;
}

interface DistancesUnloadRoom {
  distance?: number;
  unloadRoom?: string;

}

interface DistancesUnloadRooms {
  [sourceId: string]: DistancesUnloadRoom;
}

interface LongRangeHarvesterRoomMemory {
  longRangeHarvesters: {
    generation: number;
    distancesUnloadRooms: DistancesUnloadRooms;
    enemyDisappears: number;
    lastCreepProduced: number;
  };
}

/*
interface LongRangeHarvesterRoom extends Room {
  memory: LongRangeHarvesterRoomMemory;
}
*/

export class LongRangeHarvesterManager {

  public static getManager(roomOrRoomName: Room | string): LongRangeHarvesterManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof longRangeHarvesterManagers[roomName] === "undefined") {
      longRangeHarvesterManagers[roomName] = new LongRangeHarvesterManager(roomName);
    }
    return longRangeHarvesterManagers[roomName];
  }

  public static getResourceSourceOrSinkReservation(creep: LongRangeHarvesterCreep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energySourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    if (resourceType !== RESOURCE_ENERGY || creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || (creep.memory.job.type !== LONG_RANGE_HARVESTER_JOB_TYPE_LOAD && creep.memory.job.type !== LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD)) {
      return 0;
    }
    if (creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_LOAD && (ResourceSourceOrSinkType.Source !== energySourceOrSinkType || !_.isString(creep.memory.energySourceId))) {
      return 0;
    }
    if (creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD && (creep.memory.job.energySinkType !== energySourceOrSinkType || !_.isString(creep.memory.job.energySinkId))) {
      return 0;
    }
    if (creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_LOAD) {
      const memorySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.energySourceId);
      if (memorySource === null || memorySource.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getFreeCarryAmount(creep);
    }
    if (creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD) {
      const memorySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
      if (memorySink === null || memorySink.id !== screepsEnergySourceOrSink.id) {
        return 0;
      }
      return CreepManager.getEnergyInCreep(creep);
    }
    return 0;
  }

  public static holdsRenewReservation(spawn: Spawn, creep: LongRangeHarvesterCreep): boolean {
    if (creep.memory.job === CREEP_JOB_NONE || !_.isObject(creep.memory.job) || creep.memory.job.type !== LONG_RANGE_HARVESTER_JOB_TYPE_RENEW) {
      return false;
    }
    if (spawn.id !== creep.memory.job.spawnId) {
      return false;
    }
    return true;
  }

  private static getHarvestingSetup(roomName: string, sourceId: string, buildEnergy: number): HarvestingSetup | null {
    const longRangeHarvesterRoomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(longRangeHarvesterRoomMemory)) {
      return null;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters)) {
      return null;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms)) {
      return null;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId])) {
      return null;
    }
    if (!_.isNumber(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].distance)) {
      return null;
    }
    if (!_.isString(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].unloadRoom)) {
      return null;
    }
    const sourceEnergyCapacity = SourceManager.getEnergyCapacity(roomName, sourceId);
    const meanDistance = longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].distance as number;
    const sourceSeats = SourceManager.getAnzSourceRoomSeats(roomName, sourceId);
    return SourceManager.getHarvestingSetup(buildEnergy, meanDistance, sourceEnergyCapacity, sourceSeats);
  }

  private static isBestLongRangeHarvester(creep: LongRangeHarvesterCreep): boolean {
    if (creep.hits !== creep.hitsMax) {
      return false;
    }
    const harvestingSetup = LongRangeHarvesterManager.getHarvestingSetup(creep.memory.room, creep.memory.energySourceId, SpawnManager.getMaxBuildEnergy());
    if (harvestingSetup === null) {
      return false;
    }
    return harvestingSetup.anzCarry === CreepManager.anzTypeParts(creep, CARRY) && harvestingSetup.anzWork === CreepManager.anzTypeParts(creep, WORK) && harvestingSetup.anzMove === CreepManager.anzTypeParts(creep, MOVE);
  }

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };
  private energySinkTypes = [ResourceSourceOrSinkType.Storage, ResourceSourceOrSinkType.Container, ResourceSourceOrSinkType.Spawn, ResourceSourceOrSinkType.Extension, ResourceSourceOrSinkType.Tower];

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getLongRangeHarvesters(): LongRangeHarvesterCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === LONG_RANGE_HARVESTER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzLongRangeHarvesters(): number {
    return this.getLongRangeHarvesters().length;
  }

  public run(): void {
    this.refreshMemory();
    {
      this.getLongRangeHarvesters().forEach((creep) => {
        if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
          if (!creep.spawning) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_LOAD) {
          if (CreepManager.getFreeCarryAmount(creep) === 0 || this.hasEnemyPresence()) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_BUILD_ROAD) {
          const constructionSite = Game.getObjectById<ConstructionSite>(creep.memory.job.constructionSiteId);
          if (CreepManager.getEnergyInCreep(creep) === 0 || constructionSite === null || this.hasEnemyPresence()) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_REPAIR_ROAD) {
          const road = Game.getObjectById<StructureRoad>(creep.memory.job.roadId);
          if (CreepManager.getEnergyInCreep(creep) === 0 || road === null || road.hits === road.hitsMax || this.hasEnemyPresence()) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD) {
          const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
          const energySinkType = creep.memory.job.energySinkType;
          if (CreepManager.getEnergyInCreep(creep) === 0 || energySink === null || ResourceSourceOrSink.resourceSourceOrSinkIsFull(energySink, energySinkType, RESOURCE_ENERGY)) {
            this.getNextJob(creep);
          } else if (creep.room.name !== creep.memory.unloadRoom) {
            const constructionSites = ConstructionManager.getManager(creep.room).getConstructionSites(creep.pos, STRUCTURE_ROAD);
            if (constructionSites.length === 0) {
              this.getNextJob(creep);
            } else if (!RoomManager.isMapBorder(creep.pos)) {
              const road = RoadManager.getManager(creep.room).getRoad(creep.pos);
              if (road === null || road.hits / road.hitsMax < Config.ROAD_START_REPAIRING) {
                this.getNextJob(creep);
              }
            }
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_RENEW) {
          const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
          if (spawn == null || creep.ticksToLive / CREEP_LIFE_TIME > Config.CREEP_STOP_RENEW || spawn.spawning !== null || spawn.room.energyAvailable < Config.SPAWN_MIN_RENEW_ENERGY) {
            this.getNextJob(creep);
          }
        }

        if (!creep.spawning && (creep.memory.oldPos.x !== creep.pos.x || creep.memory.oldPos.y !== creep.pos.y)) {
          if (creep.room.name === creep.memory.unloadRoom) {
            MovementManager.usedRoad(creep.pos);
          }
          creep.memory.oldPos.x = creep.pos.x;
          creep.memory.oldPos.y = creep.pos.y;
        }
      });
    }

    _.forEach(this.getLongRangeHarvesters(), (creep) => {
      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_LOAD) {
        if (creep.room.name === creep.memory.room) {
          const energySource = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.energySourceId);
          CreepManager.moveToDrainResource(creep, energySource, ResourceSourceOrSinkType.Source, RESOURCE_ENERGY);
        } else {
          const pos = SourceManager.getManager(creep.memory.room).getSourcePos(creep.memory.energySourceId);
          if (pos !== null) {
            CreepManager.moveToPos(creep, pos);
          }
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_BUILD_ROAD) {
        const constructionSite = Game.getObjectById<ConstructionSite>(creep.memory.job.constructionSiteId);
        CreepManager.moveToConstruct(creep, constructionSite);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_REPAIR_ROAD) {
        const road = Game.getObjectById<StructureRoad>(creep.memory.job.roadId);
        CreepManager.moveToRepair(creep, road);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD) {
        const energySink = Game.getObjectById<ScreepsResourceSourceOrSink>(creep.memory.job.energySinkId);
        const energySinkType = creep.memory.job.energySinkType;
        CreepManager.moveToDropResource(creep, energySink, energySinkType, RESOURCE_ENERGY);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === LONG_RANGE_HARVESTER_JOB_TYPE_RENEW) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        CreepManager.moveToRenew(creep, spawn);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, maxBuildEnergyInNearbySpawns: number): CreepPlan | null {

    const availableEnergy = spawnRoom.energyAvailable;

    const longRangeHarvesterRoomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(longRangeHarvesterRoomMemory)) {
      return null;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters)) {
      return null;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms)) {
      return null;
    }

    const controller = ControllerManager.getManager(this.roomName).getController();
    if (controller !== null && controller.my) {
      return null;
    }

    if (ScoutManager.hasEnemyBaseAndStructures(this.roomName) || this.hasEnemyPresence()) {
      return null;
    }

    if (longRangeHarvesterRoomMemory.longRangeHarvesters.lastCreepProduced === Game.time) {
      return null;
    }

    const sourcesPlans = _.keys(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms).filter((sourceId) => {
      return _.isString(longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].unloadRoom);
    }).map((sourceId) => {
      const unloadRoom = longRangeHarvesterRoomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].unloadRoom;
      return {
        harvestingSetup: LongRangeHarvesterManager.getHarvestingSetup(this.roomName, sourceId, maxBuildEnergyInNearbySpawns),
        sourceId,
        unloadRoom
      };
    }).filter((obj) => {
      const anzHarvestersSource = LongRangeHarvesterManager.getManager(this.roomName).getLongRangeHarvesters().filter((creep) => creep.memory.energySourceId === obj.sourceId).length;
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
    const memory: LongRangeHarvesterMemory = {
      energySourceId: selectedSourcesPlan.sourceId as string,
      job: CREEP_JOB_NONE,
      oldPos: {
        x: 0,
        y: 0
      },
      role: LONG_RANGE_HARVESTER_ROLE_NAME,
      room: this.roomName,
      unloadRoom: selectedSourcesPlan.unloadRoom as string
    };

    return {
      body,
      importance: CreepPlanImportance.Normal,
      memory,
      name: LONG_RANGE_HARVESTER_ROLE_NAME + " " + this.roomName + " " + longRangeHarvesterRoomMemory.longRangeHarvesters.generation
    };
  }

  public creepProduced(): void {
    const longRangeHarvesterRoomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(longRangeHarvesterRoomMemory)) {
      return;
    }
    if (!_.isObject(longRangeHarvesterRoomMemory.longRangeHarvesters)) {
      return;
    }
    longRangeHarvesterRoomMemory.longRangeHarvesters.lastCreepProduced = Game.time;
    if (!_.isNumber(longRangeHarvesterRoomMemory.longRangeHarvesters.generation)) {
      return;
    }
    longRangeHarvesterRoomMemory.longRangeHarvesters.generation++;
  }

  private getNextJob(creep: LongRangeHarvesterCreep): void {

    if (creep.room.name === creep.memory.unloadRoom) {
      if (CreepManager.getEnergyInCreep(creep) === 0) {
        if (this.hasEnemyPresence() || ControllerManager.getManager(this.roomName).controlled()) {
          creep.suicide();
        } else {
          const closestSpawn = SpawnManager.getManager(creep.memory.unloadRoom).getClosestSpawn(creep.pos);
          if (creep.ticksToLive / CREEP_LIFE_TIME < Config.CREEP_NEED_RENEW && LongRangeHarvesterManager.isBestLongRangeHarvester(creep) && closestSpawn !== null &&
            closestSpawn.spawning === null && closestSpawn.room.energyAvailable >= Config.SPAWN_MIN_RENEW_ENERGY) {
            creep.memory.job = {
              spawnId: closestSpawn.id,
              type: LONG_RANGE_HARVESTER_JOB_TYPE_RENEW
            };
          } else {
            creep.memory.job = {
              type: LONG_RANGE_HARVESTER_JOB_TYPE_LOAD
            };
          }
        }
      } else {
        const energySink = RoomManager.getManager(creep.memory.unloadRoom).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getEnergyInCreep(creep),
          this.energySinkTypes, ResourceReservationType.Add);
        if (energySink !== null) {
          creep.memory.job = {
            energySinkId: energySink.resourceSourceOrSink.id,
            energySinkType: energySink.type,
            type: LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD
          };
        } else {
          creep.memory.job = CREEP_JOB_NONE;
        }
      }
    } else {
      if (CreepManager.getEnergyInCreep(creep) === 0) {
        if (this.hasEnemyPresence()) {
          creep.suicide();
        } else {
          creep.memory.job = {
            type: LONG_RANGE_HARVESTER_JOB_TYPE_LOAD
          };
        }
      } else {
        let constructionSites = ConstructionManager.getManager(creep.room).getConstructionSites(creep.pos, STRUCTURE_ROAD);
        if (constructionSites.length > 0) {
          creep.memory.job = {
            constructionSiteId: constructionSites[0].id,
            type: LONG_RANGE_HARVESTER_JOB_TYPE_BUILD_ROAD
          };
        } else {
          const road = RoadManager.getManager(creep.room).getRoad(creep.pos);
          if (road === null && !RoomManager.isMapBorder(creep.pos)) {
            creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
            constructionSites = ConstructionManager.getManager(creep.room).getConstructionSites(creep.pos, STRUCTURE_ROAD);
            if (constructionSites.length > 0) {
              creep.memory.job = {
                constructionSiteId: constructionSites[0].id,
                type: LONG_RANGE_HARVESTER_JOB_TYPE_BUILD_ROAD
              };
            } else {
              creep.memory.job = CREEP_JOB_NONE;
            }
          } else if (road !== null && road.hits / road.hitsMax < Config.ROAD_START_REPAIRING) {
            creep.memory.job = {
              roadId: road.id,
              type: LONG_RANGE_HARVESTER_JOB_TYPE_REPAIR_ROAD
            };
          } else {
            const energySink = RoomManager.getManager(creep.memory.unloadRoom).getAndReserveResourceSourceOrSink(creep, RESOURCE_ENERGY, CreepManager.getEnergyInCreep(creep),
              this.energySinkTypes, ResourceReservationType.Add);
            if (energySink !== null) {
              creep.memory.job = {
                energySinkId: energySink.resourceSourceOrSink.id,
                energySinkType: energySink.type,
                type: LONG_RANGE_HARVESTER_JOB_TYPE_UNLOAD
              };
            } else {
              creep.memory.job = CREEP_JOB_NONE;
            }
          }
        }
      }
    }
  }

  /*
  private getRoom(): LongRangeHarvesterRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }*/

  private hasEnemyPresence() {
    const roomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[this.roomName];
    return roomMemory.longRangeHarvesters.enemyDisappears > Game.time;
  }

  private initializeMemory(): void {
    const roomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(roomMemory.longRangeHarvesters)) {
      roomMemory.longRangeHarvesters = {
        distancesUnloadRooms: {},
        enemyDisappears: 0,
        generation: 0,
        lastCreepProduced: 0
      };
    }
    if (!_.isObject(roomMemory.longRangeHarvesters.distancesUnloadRooms)) {
      roomMemory.longRangeHarvesters.distancesUnloadRooms = {};
    }
    for (const sourceId in roomMemory.longRangeHarvesters.distancesUnloadRooms) {
      if (!_.isNumber(roomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].distance)) {
        delete roomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId];
        break;
      }
      if (!_.isString(roomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId].unloadRoom)) {
        delete roomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId];
        break;
      }
    }
    if (!_.isNumber(roomMemory.longRangeHarvesters.enemyDisappears)) {
      roomMemory.longRangeHarvesters.enemyDisappears = 0;
    }
    if (!_.isNumber(roomMemory.longRangeHarvesters.generation)) {
      roomMemory.longRangeHarvesters.generation = 0;
    }
    if (!_.isNumber(roomMemory.longRangeHarvesters.lastCreepProduced)) {
      roomMemory.longRangeHarvesters.lastCreepProduced = 0;
    }
    const controller = ControllerManager.getManager(this.roomName).getController();
    if (controller !== null && controller.my) {
      roomMemory.longRangeHarvesters.distancesUnloadRooms = {};
    }
    SourceManager.getManager(this.roomName).getSourceRoomPosIds().forEach((sourcePosId) => {
      if (!_.isObject(roomMemory.longRangeHarvesters.distancesUnloadRooms[sourcePosId.id])) {
        roomMemory.longRangeHarvesters.distancesUnloadRooms[sourcePosId.id] = this.recalculateDistancesUnloadRooms(sourcePosId.pos);
      }
    });
  }

  private recalculateDistancesUnloadRooms(sourcePos: RoomPosition): DistancesUnloadRoom {
    const exits = Game.map.describeExits(this.roomName);
    const distStorages = (_.values(exits) as string[]).map((neighborMap) => {
      return StorageManager.getManager(neighborMap).getStorage();
    }).filter((storage) => {
      return storage !== null;
    }).map((storage: StructureStorage) => {
      return {
        distance: PathFinder.search(sourcePos, storage.pos, {swampCost: 1}).cost,
        storage
      };
    }).sort((s1, s2) => s1.distance - s2.distance);
    if (distStorages.length === 0) {
      return {};
    }
    return {
      distance: distStorages[0].distance,
      unloadRoom: distStorages[0].storage.room.name
    };
  }

  private refreshMemory(): void {
    const roomMemory: LongRangeHarvesterRoomMemory = Memory.rooms[this.roomName];
    const enemies = CreepManager.getManager(this.roomName).getEnemyCreep();
    if (enemies.length !== 0) {
      roomMemory.longRangeHarvesters.enemyDisappears = Game.time + _.max(enemies.map((enemy) => enemy.ticksToLive)) + 1;
    }
    if (ControllerManager.getManager(this.roomName).controlled()) {
      roomMemory.longRangeHarvesters.distancesUnloadRooms = {};
    }
    if (Math.floor(Game.time / 1500) * 1500 + 456 === Game.time) {
      for (const sourceId in roomMemory.longRangeHarvesters.distancesUnloadRooms) {
        const sourcePos = SourceManager.getManager(this.roomName).getSourcePos(sourceId);
        if (sourcePos !== null) {
          roomMemory.longRangeHarvesters.distancesUnloadRooms[sourceId] = this.recalculateDistancesUnloadRooms(sourcePos);
        }
      }
    }
  }

}
