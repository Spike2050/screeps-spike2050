// import {log} from "../../lib/logger/log";

import {
  CacheRead, ResourceReservation, ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink
} from "../../config/types";
import {CreepManager} from "../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";

interface DroppedResourceManagers {
  [roomName: string]: DroppedResourceManager;
}

const droppedResourceManagers: DroppedResourceManagers = {};

interface DroppedResourceRoomMemory {
  droppedResource: {
    [id: string]: {
      reservations: ResourceReservation[]
    };
  };
}

interface DroppedResourceRoom extends Room {
  memory: DroppedResourceRoomMemory;
}

export class DroppedResourceManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): DroppedResourceManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof droppedResourceManagers[roomName] === "undefined") {
      droppedResourceManagers[roomName] = new DroppedResourceManager(roomName);
    }
    return droppedResourceManagers[roomName];
  }

  private roomName: string;
  private creepManager: CreepManager;
  private cacheDroppedResource: CacheRead<Resource[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.DroppedResource);
    this.roomName = roomName;
    this.creepManager = CreepManager.getManager(this.roomName);
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getDroppedResource();
  }

  protected getResourceReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const droppedResourceRoomMemory: DroppedResourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(droppedResourceRoomMemory.droppedResource)) {
      return [];
    }
    if (!_.isObject(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const droppedResourceRoomMemory: DroppedResourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(droppedResourceRoomMemory.droppedResource)) {
      return;
    }
    if (!_.isObject(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id])) {
      return;
    }
    droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id].reservations = resourceReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsResourceSourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const droppedResourceRoomMemory: DroppedResourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(droppedResourceRoomMemory.droppedResource)) {
      return false;
    }
    if (!_.isObject(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(droppedResourceRoomMemory.droppedResource[screepsResourceSourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private getDroppedResource(): Resource[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    if (this.cacheDroppedResource.readTime !== Game.time) {
      this.cacheDroppedResource.cache = room.find<Resource>(FIND_DROPPED_RESOURCES);
      this.cacheDroppedResource.readTime = Game.time;
    }
    return this.cacheDroppedResource.cache;
  }

  private getRoom(): DroppedResourceRoom | null {
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
    if (!_.isObject(room.memory.droppedResource)) {
      room.memory.droppedResource = {};
    }
    for (const droppedResourceId in room.memory.droppedResource) {
      if (!room.memory.droppedResource.hasOwnProperty(droppedResourceId)) {
        continue;
      }
      if (!_.isObject(room.memory.droppedResource[droppedResourceId])) {
        room.memory.droppedResource[droppedResourceId] = {
          reservations: [],
        };
      }
      room.memory.droppedResource[droppedResourceId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.droppedResource[droppedResourceId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow DroppedResource
    this.getDroppedResource().forEach((droppedResource) => {
      if (!_.isObject(room.memory.droppedResource[droppedResource.id])) {
        room.memory.droppedResource[droppedResource.id] = {
          reservations: [],
        };
      }
    });
    // Update DroppedResource
    for (const droppedResourceId in room.memory.droppedResource) {
      if (!room.memory.droppedResource.hasOwnProperty(droppedResourceId)) {
        continue;
      }
      const droppedResource = Game.getObjectById<Resource>(droppedResourceId);
      if (droppedResource === null || typeof droppedResource.room === "undefined" || droppedResource.room.name !== room.name) {
        delete room.memory.droppedResource[droppedResourceId];
      } else {
        room.memory.droppedResource[droppedResourceId].reservations = this.updateMemoryReservations(droppedResource, room.memory.droppedResource[droppedResourceId].reservations);
      }
    }
  }

}
