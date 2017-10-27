// import {log} from "../../lib/logger/log";

import {ResourceReservation, ResourceSourceOrSinkType, ScreepsResourceSourceOrSink} from "../../config/types";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";
import {ControllerManager} from "./controllerManager";
import {SpawnManager} from "./spawnManager";

interface StorageManagers {
  [roomName: string]: StorageManager;
}

const storageManagers: StorageManagers = {};

interface StorageRoomMemory {
  storage: {
    [id: string]: {
      reservations: ResourceReservation[];
    }
  };
}

interface StorageRoom extends Room {
  memory: StorageRoomMemory;
}

export class StorageManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): StorageManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof storageManagers[roomName] === "undefined") {
      storageManagers[roomName] = new StorageManager(roomName);
    }
    return storageManagers[roomName];
  }

  public static getMeanStorageDistancesInRoom(pos: RoomPosition): number {
    const storage = StorageManager.getManager(pos.roomName).getStorage();
    if (storage === null) {
      return 0;
    }
    return PathFinder.search(pos, storage.pos, {
      swampCost: 1
    }).cost;
  }

  public static getResourceShare(storage: StructureStorage, resourceType: string): number {
    return StorageManager.getResourceStorage(storage, resourceType) / storage.storeCapacity;
  }

  public static getResourceStorage(storage: StructureStorage, resourceType: string): number {
    if (!_.isNumber(storage.store[resourceType])) {
      return 0;
    }
    return storage.store[resourceType] as number;
  }

  private static storedMinimumEnergyCapacity(level: number): number {
    switch (level) {
      case 0:
      case 1:
      case 2:
      case 3:
        return 0;
      case 4:
        return 50000;
      case 5:
        return 100000;
      case 6:
        return 200000;
      case 7:
        return 300000;
      default:
        return 400000;
    }
  }

  private roomName: string;

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Storage);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingStorage();
  }

  public hasStorage(): boolean {
    return this.getStorage() !== null;
  }

  public anzStorage(): number {
    return this.getStorage() !== null ? 1 : 0;
  }

  public energyAvailable(): number {
    const storage = this.getStorage();
    if (storage !== null) {
      return storage.store[RESOURCE_ENERGY] as number;
    }
    return 0;
  }

  public energyCapacity(): number {
    const storage = this.getStorage();
    if (storage !== null) {
      return storage.storeCapacity;
    }
    return 0;
  }

  public storedMinimumEnergyCapacityPerLevel(): number {
    const room = this.getRoom();
    if (room === null) {
      return 0;
    }
    if (!this.hasStorage()) {
      return 0;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null) {
      return 0;
    }
    const storageThisLevel = StorageManager.storedMinimumEnergyCapacity(controller.level);
    const storageNextLevel = StorageManager.storedMinimumEnergyCapacity(controller.level + 1);
    const progressToNextLevel = ControllerManager.getManager(room).getProgressToNextLevel();
    return Math.floor(storageThisLevel + (storageNextLevel - storageThisLevel) * progressToNextLevel);
  }

  public getStorage(): StructureStorage | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    if (typeof room.storage === "undefined") {
      return null;
    }
    return room.storage;
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    const storage = this.getStorage();
    if (storage === null) {
      return [];
    } else {
      return [storage];
    }
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const storageRoomMemory: StorageRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(storageRoomMemory.storage)) {
      return [];
    }
    if (!_.isObject(storageRoomMemory.storage[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(storageRoomMemory.storage[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(storageRoomMemory.storage[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const storageRoomMemory: StorageRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(storageRoomMemory.storage)) {
      return;
    }
    if (!_.isObject(storageRoomMemory.storage[screepsEnergySourceOrSink.id])) {
      return;
    }
    storageRoomMemory.storage[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const storageRoomMemory: StorageRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(storageRoomMemory.storage)) {
      return false;
    }
    if (!_.isObject(storageRoomMemory.storage[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(storageRoomMemory.storage[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(storageRoomMemory.storage[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private buildMissingStorage(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const storage = this.getStorage();
    if (storage !== null) {
      return;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null || !controller.my || controller.level < 4) {
      return;
    }
    const spawns = SpawnManager.getManager(room).getSpawnPos();
    const flags = room.find<Flag>(FIND_FLAGS, {
      filter: (f: Flag) => /^storage/i.test(f.name)
    }).map((f) => {
      return {
        distance: _.sum(spawns, (s) => PathFinder.search(s, f.pos).cost),
        flag: f,
      };
    }).sort((f1, f2) => f1.distance - f2.distance).map((f) => f.flag);
    if (flags.length > 0) {
      const foundFlag = flags[0];
      room.lookForAt<Structure>(LOOK_STRUCTURES, foundFlag.pos).forEach((s) => s.destroy());
      room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, foundFlag.pos).forEach((s) => s.remove());
      const evt = room.createConstructionSite(foundFlag.pos, STRUCTURE_STORAGE);
      if (evt !== OK) {
        console.log("Extension Construction site failed " + evt);
        return;
      }
      foundFlag.remove();
    }
  }

  private getRoom(): StorageRoom | null {
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
    if (!_.isObject(room.memory.storage)) {
      room.memory.storage = {};
    }
    for (const storageId in room.memory.storage) {
      if (!room.memory.storage.hasOwnProperty(storageId)) {
        continue;
      }
      if (!_.isObject(room.memory.storage[storageId])) {
        room.memory.storage[storageId] = {
          reservations: [],
        };
      }
      room.memory.storage[storageId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.storage[storageId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const storageId in room.memory.storage) {
      if (!room.memory.storage.hasOwnProperty(storageId)) {
        continue;
      }
      const storage = Game.getObjectById<StructureStorage>(storageId);
      if (storage === null || storage.room.name !== room.name) {
        delete room.memory.storage[storageId];
      } else {
        room.memory.storage[storageId].reservations = this.updateMemoryReservations(storage, room.memory.storage[storageId].reservations);
      }
    }
  }

}
