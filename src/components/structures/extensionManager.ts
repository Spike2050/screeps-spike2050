// import {log} from "../../lib/logger/log";

import {
  CacheRead, ResourceReservation, ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink
} from "../../config/types";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";
import {RoomManager} from "../roomManager";
import {ConstructionManager} from "./constructionManager";
import {ControllerManager} from "./controllerManager";
import {SpawnManager} from "./spawnManager";

interface ExtensionManagers {
  [roomName: string]: ExtensionManager;
}

const extensionManagers: ExtensionManagers = {};

interface ExtensionRoomMemory {
  extensions: {
    [index: string]: {
      reservations: ResourceReservation[];
    }
  };
}

interface ExtensionRoom extends Room {
  memory: ExtensionRoomMemory;
}

export class ExtensionManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): ExtensionManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof extensionManagers[roomName] === "undefined") {
      extensionManagers[roomName] = new ExtensionManager(roomName);
    }
    return extensionManagers[roomName];
  }

  public static getMeanExtensionDistancesInRoom(pos: RoomPosition): number {
    const extensions = ExtensionManager.getManager(pos.roomName).getMyExtensions().map((extension) => PathFinder.search(pos, extension.pos, {swampCost: 1}).cost).sort();
    if (extensions.length === 0) {
      return 0;
    }
    return extensions[Math.floor(extensions.length / 2)];
  }

  private roomName: string;
  private controllerManager: ControllerManager;
  private constructionManager: ConstructionManager;
  private spawnManager: SpawnManager;
  private cacheMyExtensions: CacheRead<StructureExtension[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Extension);
    this.roomName = roomName;
    this.controllerManager = ControllerManager.getManager(this.roomName);
    this.constructionManager = ConstructionManager.getManager(this.roomName);
    this.spawnManager = SpawnManager.getManager(this.roomName);
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingExtensions();
  }

  public energyAvailable(): number {
    const extensions = this.getMyExtensions();
    if (extensions.length === 0) {
      return 0;
    }
    return _.sum(extensions, (c) => c.energy);
  }

  public energyCapacity(): number {
    const extensions = this.getMyExtensions();
    if (extensions.length === 0) {
      return 0;
    }
    return _.sum(extensions, (s) => s.energyCapacity);
  }

  public anzExtensions(): number {
    return this.getMyExtensions().length;
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getMyExtensions();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const extensionRoomMemory: ExtensionRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(extensionRoomMemory.extensions)) {
      return [];
    }
    if (!_.isObject(extensionRoomMemory.extensions[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(extensionRoomMemory.extensions[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(extensionRoomMemory.extensions[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const extensionRoomMemory: ExtensionRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(extensionRoomMemory.extensions)) {
      return;
    }
    if (!_.isObject(extensionRoomMemory.extensions[screepsResourceSourceOrSink.id])) {
      return;
    }
    extensionRoomMemory.extensions[screepsResourceSourceOrSink.id].reservations = resourceReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const extensionRoomMemory: ExtensionRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(extensionRoomMemory.extensions)) {
      return false;
    }
    if (!_.isObject(extensionRoomMemory.extensions[screepsResourceSourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(extensionRoomMemory.extensions[screepsResourceSourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(extensionRoomMemory.extensions[screepsResourceSourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private buildMissingExtensions(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!this.controllerManager.controlled()) {
      return;
    }
    const maxExtensions = RoomManager.getMaxBuildings(STRUCTURE_EXTENSION, this.controllerManager.getControllerLevel());
    let anzExtensions = this.getMyExtensions().length + this.constructionManager.getMyConstructionSites().filter((c) => {
      return c.structureType === STRUCTURE_EXTENSION;
    }).length;
    if (anzExtensions < maxExtensions) {
      const spawns = this.spawnManager.getSpawnPos();
      const flags = room.find<Flag>(FIND_FLAGS, {
        filter: (f: Flag) => /^extension/i.test(f.name)
      }).map((f) => {
        return {
          distance: _.sum(spawns, (s) => PathFinder.search(s, f.pos).cost),
          flag: f,
        };
      }).sort((f1, f2) => f1.distance - f2.distance).map((f) => f.flag);
      while (flags.length > 0 && anzExtensions < maxExtensions) {
        const flag = flags.shift();
        if (typeof flag === "undefined") {
          break;
        }
        room.lookForAt<Structure>(LOOK_STRUCTURES, flag.pos).forEach((s) => s.destroy());
        room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, flag.pos).forEach((s) => s.remove());
        const evt = room.createConstructionSite(flag.pos, STRUCTURE_EXTENSION);
        if (evt !== OK) {
          console.log("Extension Construction site failed " + evt);
          return;
        }
        flag.remove();
        anzExtensions++;
      }
    }
  }

  private getRoom(): ExtensionRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private getMyExtensions(): StructureExtension[] {
    if (this.cacheMyExtensions.readTime !== Game.time) {
      this.cacheMyExtensions.cache = RoomManager.getManager(this.roomName).getMyStructures().filter((s) => s.structureType === STRUCTURE_EXTENSION) as StructureExtension[];
      this.cacheMyExtensions.readTime = Game.time;
    }
    return this.cacheMyExtensions.cache;
  }

  private initMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.extensions)) {
      room.memory.extensions = {};
    }
    for (const extensionId in room.memory.extensions) {
      if (!room.memory.extensions.hasOwnProperty(extensionId)) {
        continue;
      }
      if (!_.isObject(room.memory.extensions[extensionId])) {
        room.memory.extensions[extensionId] = {
          reservations: [],
        };
      }
      room.memory.extensions[extensionId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.extensions[extensionId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow Containers
    this.getMyExtensions().forEach((extension) => {
      if (!_.isObject(room.memory.extensions[extension.id])) {
        room.memory.extensions[extension.id] = {
          reservations: [],
        };
      }
    });
    // Update Containers
    for (const extensionId in room.memory.extensions) {
      if (!room.memory.extensions.hasOwnProperty(extensionId)) {
        continue;
      }
      const extension = Game.getObjectById<StructureExtension>(extensionId);
      if (extension === null || extension.room.name !== room.name) {
        delete room.memory.extensions[extensionId];
      } else {
        room.memory.extensions[extensionId].reservations = this.updateMemoryReservations(extension, room.memory.extensions[extensionId].reservations);
      }
    }
  }

}
