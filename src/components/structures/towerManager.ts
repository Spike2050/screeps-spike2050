// import {log} from "../../lib/logger/log";

import {
  CacheRead, ResourceReservation, ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink
} from "../../config/types";
import {CreepManager} from "../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";
import {RoomManager} from "../roomManager";
import {ConstructionManager} from "./constructionManager";
import {ContainerManager} from "./containerManager";
import {ControllerManager} from "./controllerManager";
import {RepairManager} from "./repairManager";
import {SpawnManager} from "./spawnManager";

interface TowerManagers {
  [roomName: string]: TowerManager;
}

const towerManagers: TowerManagers = {};

const TOWER_JOB_NONE = "none";
type TowerJobNone = "none";
const TOWER_JOB_TYPE_REPAIR = "repair";
type TowerJobTypeRepair = "repair";
const TOWER_JOB_TYPE_HEAL = "heal";
type TowerJobTypeHeal = "heal";
const TOWER_JOB_TYPE_ATTACK = "attack";
type TowerJobTypeAttack = "attack";

interface TowerRepairJob {
  type: TowerJobTypeRepair;
  structureId: string;
  maxHp?: number;
}

interface TowerHealJob {
  type: TowerJobTypeHeal;
  creepId: string;
}

interface TowerAttackJob {
  type: TowerJobTypeAttack;
  creepId: string;
}

interface TowerRoomMemory {
  towers: {
    [index: string]: {
      job: TowerRepairJob | TowerHealJob | TowerAttackJob | TowerJobNone;
      reservations: ResourceReservation[];
    }
  };
}

interface TowerRoom extends Room {
  memory: TowerRoomMemory;
}

export class TowerManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): TowerManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof towerManagers[roomName] === "undefined") {
      towerManagers[roomName] = new TowerManager(roomName);
    }
    return towerManagers[roomName];
  }

  public static holdsStructureReservation(tower: StructureTower, structure: Structure): boolean {
    if (!_.isObject((tower.room as TowerRoom).memory.towers[tower.id])) {
      return false;
    }
    const towerMemory = (tower.room as TowerRoom).memory.towers[tower.id];
    if (towerMemory.job === TOWER_JOB_NONE || !_.isObject(towerMemory.job)) {
      return false;
    }
    if (towerMemory.job.type === TOWER_JOB_TYPE_REPAIR && _.isString(towerMemory.job.structureId)) {
      const memoryStructure = Game.getObjectById<Structure>(towerMemory.job.structureId);
      return memoryStructure !== null && memoryStructure.id === structure.id;
    }
    return false;
  }

  public static getMeanTowerDistancesInRoom(pos: RoomPosition): number {
    const towers = TowerManager.getManager(pos.roomName).getMyTowers().map((tower) => PathFinder.search(pos, tower.pos, {swampCost: 1}).cost).sort();
    if (towers.length === 0) {
      return 0;
    }
    return towers[Math.floor(towers.length / 2)];
  }

  private roomName: string;
  private cacheTowers: CacheRead<StructureTower[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Tower);
    this.roomName = roomName;
    this.initMemory();
  }

  public run(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.refeshMemory();
    this.buildMissingTowers();
    {
      _.forEach(this.getMyTowers(), (tower) => {
        const towerMemory = (tower.room as TowerRoom).memory.towers[tower.id];

        // Emergency Cutoff if enemies are here
        if (!_.isUndefined(towerMemory.job) && towerMemory.job !== TOWER_JOB_NONE && towerMemory.job.type === TOWER_JOB_TYPE_REPAIR &&
          CreepManager.getManager(room).getEnemyCreep().length > 0) {
          this.getNextJob(tower);
        } else if (_.isUndefined(towerMemory.job) || towerMemory.job === TOWER_JOB_NONE) {
          this.getNextJob(tower);
        } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_REPAIR) {
          const structure = Game.getObjectById<Structure>(towerMemory.job.structureId);
          if (tower.energy < TOWER_ENERGY_COST || structure === null || structure.hits === structure.hitsMax ||
            (_.isNumber(towerMemory.job.maxHp) && structure.hits >= towerMemory.job.maxHp)) {
            this.getNextJob(tower);
          }
        } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_HEAL) {
          const creep = Game.getObjectById<Creep>(towerMemory.job.creepId);
          if (tower.energy < TOWER_ENERGY_COST || creep === null || creep.hits === creep.hitsMax) {
            this.getNextJob(tower);
          }
        } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_ATTACK) {
          const creep = Game.getObjectById<Creep>(towerMemory.job.creepId);
          if (tower.energy < TOWER_ENERGY_COST || creep === null || creep.hits === 0 || creep.room.name === tower.room.name) {
            this.getNextJob(tower);
          }
        }
      });
    }

    _.forEach(this.getMyTowers(), (tower) => {
      const towerMemory = (tower.room as TowerRoom).memory.towers[tower.id];
      if (towerMemory.job === TOWER_JOB_NONE) {
        // Nothing
      } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_REPAIR) {
        const structure = Game.getObjectById<Structure>(towerMemory.job.structureId);
        this.repair(tower, structure);
      } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_HEAL) {
        const creep = Game.getObjectById<Creep>(towerMemory.job.creepId);
        this.heal(tower, creep);
      } else if (_.isObject(towerMemory.job) && towerMemory.job.type === TOWER_JOB_TYPE_ATTACK) {
        const creep = Game.getObjectById<Creep>(towerMemory.job.creepId);
        this.attack(tower, creep);
      }
    });
  }

  public energyAvailable(): number {
    return _.sum(this.getMyTowers(), (c) => c.energy);
  }

  public energyCapacity(): number {
    return _.sum(this.getMyTowers(), (s) => s.energyCapacity);
  }

  public anzTowers(): number {
    return this.getMyTowers().length;
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getMyTowers();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const towerRoomMemory: TowerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(towerRoomMemory.towers)) {
      return [];
    }
    if (!_.isObject(towerRoomMemory.towers[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(towerRoomMemory.towers[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(towerRoomMemory.towers[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const towerRoomMemory: TowerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(towerRoomMemory.towers)) {
      return;
    }
    if (!_.isObject(towerRoomMemory.towers[screepsEnergySourceOrSink.id])) {
      return;
    }
    towerRoomMemory.towers[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const towerRoomMemory: TowerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(towerRoomMemory.towers)) {
      return false;
    }
    if (!_.isObject(towerRoomMemory.towers[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(towerRoomMemory.towers[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(towerRoomMemory.towers[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private getNextJob(tower: StructureTower): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const towerMemory = (tower.room as TowerRoom).memory.towers[tower.id];
    if (tower.energy < TOWER_ENERGY_COST) {
      towerMemory.job = TOWER_JOB_NONE;
    } else {
      const enemyCreeps = CreepManager.getManager(room).getEnemyCreep().map((creep) => {
        return {
          anzHeal: _.sum(creep.body, (s) => (s.type === HEAL) ? 1 : 0),
          creep
        };
      }).sort((c1, c2) => c2.anzHeal - c1.anzHeal).map((c) => c.creep);
      if (enemyCreeps.length > 0) {
        towerMemory.job = {
          creepId: enemyCreeps[0].id,
          type: TOWER_JOB_TYPE_ATTACK
        };
      } else {
        const damagedCreeps = CreepManager.getManager(room).getDamagedCreep();
        if (damagedCreeps.length > 0) {
          towerMemory.job = {
            creepId: damagedCreeps[0].id,
            type: TOWER_JOB_TYPE_HEAL
          };
        } else {
          if (ContainerManager.getManager(room).energyAvailable() < 200) {
            towerMemory.job = TOWER_JOB_NONE;
          } else {
            const rampart = RepairManager.getManager(room).getAndReserveRampart(tower);
            if (rampart !== null) {
              towerMemory.job = {
                structureId: rampart.structure.id,
                type: TOWER_JOB_TYPE_REPAIR
              };
              if (_.isNumber(rampart.maxHp)) {
                towerMemory.job.maxHp = rampart.maxHp;
              }
            } else {
              const structure = RepairManager.getManager(room).getAndReserveStructureNoRampart(tower);
              if (structure !== null) {
                towerMemory.job = {
                  structureId: structure.structure.id,
                  type: TOWER_JOB_TYPE_REPAIR
                };
                if (_.isNumber(structure.maxHp)) {
                  towerMemory.job.maxHp = structure.maxHp;
                }
              } else {
                towerMemory.job = TOWER_JOB_NONE;
              }
            }
          }
        }
      }
    }
  }

  private buildMissingTowers(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const controllerLevel = ControllerManager.getManager(room).getControllerLevel();
    const maxTowers = RoomManager.getMaxBuildings(STRUCTURE_TOWER, controllerLevel);
    let anzTowers = this.getMyTowers().length + ConstructionManager.getManager(room).getMyConstructionSites().filter((c) => {
      return c.structureType === STRUCTURE_TOWER;
    }).length;
    if (anzTowers < maxTowers) {
      const spawns = SpawnManager.getManager(room).getSpawnPos();
      const flags = room.find<Flag>(FIND_FLAGS, {
        filter: (f: Flag) => /^tower/i.test(f.name)
      }).map((f) => {
        return {
          distance: _.sum(spawns, (s) => PathFinder.search(s, f.pos).cost),
          flag: f,
        };
      }).sort((f1, f2) => f1.distance - f2.distance).map((f) => f.flag);
      while (flags.length > 0 && anzTowers < maxTowers) {
        const flag = flags.shift();
        if (typeof flag === "undefined") {
          break;
        }
        room.lookForAt<Structure>(LOOK_STRUCTURES, flag.pos).forEach((s) => s.destroy());
        room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, flag.pos).forEach((s) => s.remove());
        const evt = room.createConstructionSite(flag.pos, STRUCTURE_TOWER);
        if (evt !== OK) {
          console.log("Tower Construction site failed " + evt);
          return;
        }
        flag.remove();
        anzTowers++;
      }
    }
  }

  private getRoom(): TowerRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private getMyTowers(): StructureTower[] {
    if (this.cacheTowers.readTime !== Game.time) {
      this.cacheTowers.cache = RoomManager.getManager(this.roomName).getMyStructures().filter((s) => s.structureType === STRUCTURE_TOWER) as StructureTower[];
      this.cacheTowers.readTime = Game.time;
    }
    return this.cacheTowers.cache;
  }

  private initMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.towers)) {
      room.memory.towers = {};
    }
    for (const towerId in room.memory.towers) {
      if (!room.memory.towers.hasOwnProperty(towerId)) {
        continue;
      }
      if (!_.isObject(room.memory.towers[towerId])) {
        room.memory.towers[towerId] = {
          job: TOWER_JOB_NONE,
          reservations: []
        };
      }
      const towerMemory = room.memory.towers[towerId];
      if (!_.isString(towerMemory.job) && !_.isObject(towerMemory.job)) {
        towerMemory.job = TOWER_JOB_NONE;
      } else if (_.isString(towerMemory.job) && towerMemory.job !== TOWER_JOB_NONE) {
        towerMemory.job = TOWER_JOB_NONE;
      } else if (towerMemory.job !== TOWER_JOB_NONE && towerMemory.job.type !== TOWER_JOB_TYPE_REPAIR && towerMemory.job.type !== TOWER_JOB_TYPE_HEAL && towerMemory.job.type !== TOWER_JOB_TYPE_ATTACK) {
        towerMemory.job = TOWER_JOB_NONE;
      }
      towerMemory.reservations = ResourceSourceOrSink.filterBrokenResourceReservations(towerMemory.reservations);
    }
  }

  private repair(tower: StructureTower, target: Structure | null): void {
    if (target === null) {
      return;
    }
    tower.repair(target);
  }

  private heal(tower: StructureTower, target: Creep | null): void {
    if (target === null) {
      return;
    }
    tower.heal(target);
  }

  private attack(tower: StructureTower, target: Creep | null): void {
    if (target === null) {
      return;
    }
    tower.attack(target);
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow Containers
    this.getMyTowers().forEach((tower) => {
      if (!_.isObject(room.memory.towers[tower.id])) {
        room.memory.towers[tower.id] = {
          job: TOWER_JOB_NONE,
          reservations: []
        };
      }
    });
    // Update Containers
    for (const towerId in room.memory.towers) {
      if (!room.memory.towers.hasOwnProperty(towerId)) {
        continue;
      }
      const tower = Game.getObjectById<StructureTower>(towerId);
      if (tower === null || tower.room.name !== room.name) {
        delete room.memory.towers[towerId];
      } else {
        room.memory.towers[towerId].reservations = this.updateMemoryReservations(tower, room.memory.towers[towerId].reservations);
      }
    }
  }

}
