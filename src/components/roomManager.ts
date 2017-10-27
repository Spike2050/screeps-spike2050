import * as Config from "../config/config";

// import { log } from "../lib/logger/log";

import {
  GetAndReserveResourceSourceOrSinkOptions, ResourceReservationType, ResourceSourceOrSinkProvider,
  ResourceSourceOrSinkType, SearchResourceSourceOrSink
} from "../config/types";
import {CreepManager} from "./creeps/creepManager";
import {ConstructionManager} from "./structures/constructionManager";
import {ContainerManager} from "./structures/containerManager";
import {ControllerManager} from "./structures/controllerManager";
import {DroppedResourceManager} from "./structures/droppedResourceManager";
import {ExtensionManager} from "./structures/extensionManager";
import {LabManager} from "./structures/labManager";
import {MineralManager} from "./structures/mineralManager";
import {MovementManager} from "./structures/movementManager";
import {RampartManager} from "./structures/rampartManager";
import {RepairManager} from "./structures/repairManager";
import {RoadManager} from "./structures/roadManager";
import {SourceManager} from "./structures/sourceManager";
import {SpawnManager} from "./structures/spawnManager";
import {StorageManager} from "./structures/storageManager";
import {TowerManager} from "./structures/towerManager";
import {WallManager} from "./structures/wallManager";

interface RoomManagers {
  [roomName: string]: RoomManager;
}

const roomManagers: RoomManagers = {};

export class RoomManager implements ResourceSourceOrSinkProvider {

  public static getManager(roomOrRoomName: Room | string): RoomManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof roomManagers[roomName] === "undefined") {
      roomManagers[roomName] = new RoomManager(roomName);
    }
    return roomManagers[roomName];
  }

  public static isMapBorder(posOrX: RoomPosition | number, y: number = 0): boolean {
    if (_.isObject(posOrX)) {
      const pos: RoomPosition = posOrX as RoomPosition;
      return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;
    } else {
      const x: number = posOrX as number;
      return x === 0 || x === 49 || y === 0 || y === 49;
    }
  }

  public static hasBeenVisited(roomName: string): boolean {
    return typeof Memory.rooms[roomName] !== "undefined";
  }

  public static getNeighboringRooms(startRoom: string, level: number = 0): string[][] {
    const _startRooms: string[][] = [[startRoom]];
    if (level <= 0) {
      return _startRooms;
    }
    for (let currentLevel = 1; currentLevel <= level; currentLevel++) {
      const searchRooms: string[] = _startRooms[currentLevel - 1];
      const excludeRooms: string[] = (currentLevel > 1) ? _startRooms[currentLevel - 2] : [];
      const newNeighbors = _.reduce(searchRooms, (total, searchRoom) => {
        const neighbors: string[] = _.values(Game.map.describeExits(searchRoom));
        const notAlreadyVisitedNeighbors = neighbors.filter((neighbor) => !_.any(excludeRooms, (testNeighbor) => testNeighbor === neighbor));
        return total.concat(notAlreadyVisitedNeighbors);
      }, [] as string[]);
      _startRooms[currentLevel] = _.uniq(newNeighbors);
    }
    return _startRooms;
  }

  public static getMaxBuildings(buildingType: string, controllerLevel: number) {
    if (_.isUndefined(CONTROLLER_STRUCTURES[buildingType])) {
      return 0;
    }
    if (_.isUndefined(CONTROLLER_STRUCTURES[buildingType][controllerLevel])) {
      return 0;
    }
    return CONTROLLER_STRUCTURES[buildingType][controllerLevel];
  }

  private roomName: string;
  private constructionManager: ConstructionManager;
  private containerManager: ContainerManager;
  private controllerManager: ControllerManager;
  private droppedEnergyManager: DroppedResourceManager;
  private extensionManager: ExtensionManager;
  private labManager: LabManager;
  private movementManager: MovementManager;
  private roadManager: RoadManager;
  private sourceManager: SourceManager;
  private mineralManager: MineralManager;
  private spawnManager: SpawnManager;
  private storageManager: StorageManager;
  private rampartManager: RampartManager;
  private repairManager: RepairManager;
  private wallManager: WallManager;
  private towerManager: TowerManager;
  private creepManager: CreepManager;

  constructor(roomName: string) {
    this.roomName = roomName;
    this.movementManager = MovementManager.getManager(this.roomName);
    this.roadManager = RoadManager.getManager(this.roomName);
    this.spawnManager = SpawnManager.getManager(this.roomName);
    this.extensionManager = ExtensionManager.getManager(this.roomName);
    this.containerManager = ContainerManager.getManager(this.roomName);
    this.storageManager = StorageManager.getManager(this.roomName);
    this.labManager = LabManager.getManager(this.roomName);
    this.controllerManager = ControllerManager.getManager(this.roomName);
    this.sourceManager = SourceManager.getManager(this.roomName);
    this.mineralManager = MineralManager.getManager(this.roomName);
    this.constructionManager = ConstructionManager.getManager(this.roomName);
    this.rampartManager = RampartManager.getManager(this.roomName);
    this.wallManager = WallManager.getManager(this.roomName);
    this.repairManager = RepairManager.getManager(this.roomName);
    this.droppedEnergyManager = DroppedResourceManager.getManager(this.roomName);
    this.towerManager = TowerManager.getManager(this.roomName);
    this.creepManager = CreepManager.getManager(this.roomName);
  }

  public getRoom(): Room | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  public run() {
    this.movementManager.run();
    this.roadManager.run();
    this.spawnManager.run();
    this.extensionManager.run();
    this.containerManager.run(); // ok
    this.storageManager.run();
    this.labManager.run();
    this.controllerManager.run();
    this.mineralManager.run();
    this.sourceManager.run();
    this.constructionManager.run();
    this.rampartManager.run();
    this.wallManager.run();
    this.repairManager.run();
    this.droppedEnergyManager.run();
    this.towerManager.run();
  }

  public getAndReserveResourceSourceOrSink(creep: Creep, resourceType: string, amount: number, filterAndOrder: ResourceSourceOrSinkType[], energyReservationType: ResourceReservationType,
                                           opts: GetAndReserveResourceSourceOrSinkOptions = {}): SearchResourceSourceOrSink | null {

    const accomodateAmount = (_.isBoolean(opts.accomodateAmount)) ? opts.accomodateAmount : false;
    const sourceAmountPerTick = (_.isNumber(opts.sourceOrMineralAmountPerTick)) ? opts.sourceOrMineralAmountPerTick : amount;
    const includeEmptyOrFull = (_.isBoolean(opts.includeEmptyOrFull)) ? opts.includeEmptyOrFull : false;
    const noReservation = (_.isBoolean(opts.includeEmptyOrFull)) ? opts.includeEmptyOrFull : false;
    const filter = (_.isFunction(opts.filter)) ? opts.filter : null;

    let energySourcesOrSinks: SearchResourceSourceOrSink[] = [];

    filterAndOrder.forEach((e) => {
      switch (e) {
        case ResourceSourceOrSinkType.Source:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.sourceManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Container:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.containerManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.DroppedResource:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.droppedEnergyManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Storage:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.storageManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Lab:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.labManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Spawn:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.spawnManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Extension:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.extensionManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
        case ResourceSourceOrSinkType.Tower:
          energySourcesOrSinks = energySourcesOrSinks.concat(this.towerManager.getResourceSourcesOrSinks(creep, energyReservationType, resourceType));
          break;
      }
      return [];
    });
    if (_.isFunction(filter)) {
      energySourcesOrSinks = energySourcesOrSinks.filter(filter);
    }
    const enemyCreep = this.creepManager.getEnemyCreep();
    if (enemyCreep.length > 0) {
      energySourcesOrSinks = energySourcesOrSinks.filter((energySourceOrSink) => {
        return _.all(enemyCreep, (enemy) => energySourceOrSink.resourceSourceOrSink.pos.getRangeTo(enemy.pos) > Config.RANGED_ATTACK_DISTANCE);
      });
    }
    if (!includeEmptyOrFull) {
      energySourcesOrSinks = energySourcesOrSinks.filter((energySourceOrSink) => {
        return energyReservationType === ResourceReservationType.Withdraw && energySourceOrSink.calcAmount > 0 || energyReservationType === ResourceReservationType.Add && energySourceOrSink.calcAmount < energySourceOrSink.capacity;
      });
    }
    if (accomodateAmount) {
      energySourcesOrSinks = energySourcesOrSinks.filter((e) => amount <= e.calcAmount);
    }
    energySourcesOrSinks = energySourcesOrSinks.sort((e1, e2) => {
      const e1index = _.findIndex(filterAndOrder, (f) => f === e1.type);
      const e2index = _.findIndex(filterAndOrder, (f) => f === e2.type);
      if (e1index !== e2index) {
        return e1index - e2index;
      }
      if (energyReservationType === ResourceReservationType.Withdraw) {
        if (e1.calcAmount >= amount && e2.calcAmount < amount) {
          return -1;
        }
        if (e1.calcAmount < amount && e2.calcAmount > amount) {
          return 1;
        }
      } else {
        if (e1.capacity - amount >= e1.calcAmount && e2.capacity - amount < e2.calcAmount) {
          return -1;
        }
        if (e1.capacity - amount < e1.calcAmount && e2.capacity - amount >= e2.calcAmount) {
          return 1;
        }
      }
      return e1.distance - e2.distance;
    });
    if (energySourcesOrSinks.length === 0) {
      return null;
    }
    const foundEnergySourceOrSink = energySourcesOrSinks[0];
    if (!noReservation) {
      switch (foundEnergySourceOrSink.type) {
        case ResourceSourceOrSinkType.Source:
          this.sourceManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, sourceAmountPerTick, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Container:
          this.containerManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.DroppedResource:
          this.droppedEnergyManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Storage:
          this.storageManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Lab:
          this.labManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Spawn:
          this.spawnManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Extension:
          this.extensionManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
        case ResourceSourceOrSinkType.Tower:
          this.towerManager.reserveResourceSourceOrSink(creep, foundEnergySourceOrSink, amount, amount, energyReservationType, resourceType);
          break;
      }
    }
    return foundEnergySourceOrSink;
  }

  public storedMinimumFillLevel(): number {
    const storedMinimumEnergyCapacity = this.storedMinimumEnergyCapacity();
    if (storedMinimumEnergyCapacity === 0) {
      return 0;
    }
    return this.storedEnergyAvailable() / storedMinimumEnergyCapacity;
  }

  public storedEnergyAvailable(): number {
    return this.containerManager.energyAvailable() + this.storageManager.energyAvailable();
  }

  public anzStorageStructures(): number {
    return this.containerManager.anzContainer() + (this.storageManager.hasStorage() ? 1 : 0);
  }

  public storedEnergyCapacity(): number {
    return this.containerManager.energyCapacity() + this.storageManager.energyCapacity();
  }

  public storedMinimumEnergyCapacity(): number {
    return this.containerManager.storedMinimumEnergyCapacity() + this.storageManager.storedMinimumEnergyCapacityPerLevel();
  }

  public energyCapacityAvailable(): number {
    return this.spawnManager.energyCapacity() + this.extensionManager.energyCapacity() +
      this.containerManager.energyCapacity() + this.storageManager.energyCapacity();
  }

  public energyAvailable(): number {
    return this.spawnManager.energyAvailable() + this.extensionManager.energyAvailable() +
      this.containerManager.energyAvailable() + this.storageManager.energyAvailable();
  }

  public getHostileStructures(): Structure[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Structure>(FIND_HOSTILE_STRUCTURES);
  }

  public hasHostileStructures(): boolean {
    return this.getHostileStructures().length !== 0;
  }

  public getStructures(): Structure[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Structure>(FIND_STRUCTURES);
  }

  public getMyStructures(): Structure[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Structure>(FIND_MY_STRUCTURES);
  }

  public getStructuresAt(pos: RoomPosition, structureType: string | null = null): Structure[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    const structures = room.lookForAt<Structure>(LOOK_STRUCTURES, pos);
    if (structureType === null) {
      return structures;
    }
    return structures.filter((s) => s.structureType === structureType);
  }

}
