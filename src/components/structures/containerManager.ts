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

interface ContainerManagers {
  [roomName: string]: ContainerManager;
}

const containerManagers: ContainerManagers = {};

interface ContainerRoomMemory {
  container: {
    [id: string]: {
      reservations: ResourceReservation[];
    }
  };
}

interface ContainerRoom extends Room {
  memory: ContainerRoomMemory;
}

export class ContainerManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): ContainerManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof containerManagers[roomName] === "undefined") {
      containerManagers[roomName] = new ContainerManager(roomName);
    }
    return containerManagers[roomName];
  }

  public static getMeanContainerDistancesInRoom(pos: RoomPosition): number {
    const containers = ContainerManager.getManager(pos.roomName).getContainer().map((container) => {
      return PathFinder.search(pos, container.pos, {swampCost: 1}).cost;
    }).sort();
    if (containers.length === 0) {
      return 0;
    }
    return containers[Math.floor(containers.length / 2)];
  }

  private roomName: string;
  private cacheContainers: CacheRead<StructureContainer[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Container);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingContainers();
  }

  public anzContainer(): number {
    return this.getContainer().length;
  }

  public energyAvailable(): number {
    const container = this.getContainer();
    if (container.length === 0) {
      return 0;
    }
    return _.sum(container, (c) => c.store[RESOURCE_ENERGY]);
  }

  public energyCapacity(): number {
    const container = this.getContainer();
    if (container.length === 0) {
      return 0;
    }
    return _.sum(container, (s) => s.storeCapacity);
  }

  public storedMinimumEnergyCapacity(): number {
    return this.energyCapacity();
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getContainer();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const containerRoomMemory: ContainerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(containerRoomMemory.container)) {
      return [];
    }
    if (!_.isObject(containerRoomMemory.container[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(containerRoomMemory.container[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(containerRoomMemory.container[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const containerRoomMemory: ContainerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(containerRoomMemory.container)) {
      return;
    }
    if (!_.isObject(containerRoomMemory.container[screepsEnergySourceOrSink.id])) {
      return;
    }
    containerRoomMemory.container[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const containerRoomMemory: ContainerRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(containerRoomMemory.container)) {
      return false;
    }
    if (!_.isObject(containerRoomMemory.container[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(containerRoomMemory.container[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(containerRoomMemory.container[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private buildMissingContainers(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const maxContainers = RoomManager.getMaxBuildings(STRUCTURE_CONTAINER, ControllerManager.getManager(room).getControllerLevel());
    let anzContainers = this.getContainer().length + ConstructionManager.getManager(room).getMyConstructionSites().filter((c) => {
      return c.structureType === STRUCTURE_CONTAINER;
    }).length;
    if (anzContainers < maxContainers) {
      const spawns = SpawnManager.getManager(room).getSpawnPos();
      const flags = room.find<Flag>(FIND_FLAGS, {
        filter: (f: Flag) => /^container/i.test(f.name)
      }).map((f) => {
        return {
          distance: _.sum(spawns, (s) => PathFinder.search(s, f.pos).cost),
          flag: f,
        };
      }).sort((f1, f2) => f1.distance - f2.distance).map((f) => f.flag);
      while (flags.length > 0 && anzContainers < maxContainers) {
        const flag = flags.shift();
        if (typeof flag === "undefined") {
          break;
        }
        room.lookForAt<Structure>(LOOK_STRUCTURES, flag.pos).filter((s) => s.structureType !== STRUCTURE_ROAD).forEach((s) => s.destroy());
        room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, flag.pos).forEach((s) => s.remove());
        const evt = room.createConstructionSite(flag.pos, STRUCTURE_CONTAINER);
        if (evt !== OK) {
          console.log("Extension Construction site failed " + evt);
          return;
        }
        flag.remove();
        anzContainers++;
      }
    }
  }

  private getContainer(): StructureContainer[] {
    if (this.cacheContainers.readTime !== Game.time) {
      this.cacheContainers.cache = RoomManager.getManager(this.roomName).getStructures().filter((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[];
      this.cacheContainers.readTime = Game.time;
    }
    return this.cacheContainers.cache as StructureContainer[];
  }

  private getRoom(): ContainerRoom | null {
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
    if (!_.isObject(room.memory.container)) {
      room.memory.container = {};
    }
    for (const containerId in room.memory.container) {
      if (!room.memory.container.hasOwnProperty(containerId)) {
        continue;
      }
      if (!_.isObject(room.memory.container[containerId])) {
        room.memory.container[containerId] = {
          reservations: [],
        };
      }
      room.memory.container[containerId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.container[containerId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow Containers
    this.getContainer().forEach((container) => {
      if (!_.isObject(room.memory.container[container.id])) {
        room.memory.container[container.id] = {
          reservations: [],
        };
      }
    });
    // Update Containers
    for (const containerId in room.memory.container) {
      if (!room.memory.container.hasOwnProperty(containerId)) {
        continue;
      }
      const container = Game.getObjectById<StructureContainer>(containerId);
      if (container === null || container.room.name !== room.name) {
        delete room.memory.container[containerId];
      } else {
        room.memory.container[containerId].reservations = this.updateMemoryReservations(container, room.memory.container[containerId].reservations);
      }
    }
  }

}
