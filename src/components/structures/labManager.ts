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

interface LabManagers {
  [roomName: string]: LabManager;
}

const labManagers: LabManagers = {};

interface LabRoomMemory {
  labs: {
    [id: string]: {
      reservations: ResourceReservation[];
    }
  };
}

interface LabRoom extends Room {
  memory: LabRoomMemory;
}

export class LabManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): LabManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof labManagers[roomName] === "undefined") {
      labManagers[roomName] = new LabManager(roomName);
    }
    return labManagers[roomName];
  }

  private roomName: string;
  private cacheLabs: CacheRead<StructureLab[]> = {
    cache: [] as StructureLab[],
    readTime: 0
  };

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Lab);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingLabs();
  }

  public anzLabs(): number {
    return this.getLabs().length;
  }

  public energyAvailable(): number {
    const labs = this.getLabs();
    if (labs.length === 0) {
      return 0;
    }
    return _.sum(labs, (c) => c.energy);
  }

  public energyCapacity(): number {
    const labs = this.getLabs();
    if (labs.length === 0) {
      return 0;
    }
    return _.sum(labs, (s) => s.energyCapacity);
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getLabs();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const labsRoomMemory: LabRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(labsRoomMemory.labs)) {
      return [];
    }
    if (!_.isObject(labsRoomMemory.labs[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(labsRoomMemory.labs[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(labsRoomMemory.labs[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const labsRoomMemory: LabRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(labsRoomMemory.labs)) {
      return;
    }
    if (!_.isObject(labsRoomMemory.labs[screepsEnergySourceOrSink.id])) {
      return;
    }
    labsRoomMemory.labs[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const labsRoomMemory: LabRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(labsRoomMemory.labs)) {
      return false;
    }
    if (!_.isObject(labsRoomMemory.labs[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(labsRoomMemory.labs[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(labsRoomMemory.labs[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private buildMissingLabs(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const maxLabs = RoomManager.getMaxBuildings(STRUCTURE_LAB, ControllerManager.getManager(room).getControllerLevel());
    let anzLabss = this.getLabs().length + ConstructionManager.getManager(room).getMyConstructionSites().filter((c) => {
      return c.structureType === STRUCTURE_LAB;
    }).length;
    if (anzLabss < maxLabs) {
      const spawns = SpawnManager.getManager(room).getSpawnPos();
      const flags = room.find<Flag>(FIND_FLAGS, {
        filter: (f: Flag) => /^lab/i.test(f.name)
      }).map((f) => {
        return {
          distance: _.sum(spawns, (s) => PathFinder.search(s, f.pos).cost),
          flag: f,
        };
      }).sort((f1, f2) => f1.distance - f2.distance).map((f) => f.flag);
      while (flags.length > 0 && anzLabss < maxLabs) {
        const flag = flags.shift();
        if (typeof flag === "undefined") {
          break;
        }
        room.lookForAt<Structure>(LOOK_STRUCTURES, flag.pos).filter((s) => s.structureType !== STRUCTURE_ROAD).forEach((s) => s.destroy());
        room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, flag.pos).forEach((s) => s.remove());
        const evt = room.createConstructionSite(flag.pos, STRUCTURE_LAB);
        if (evt !== OK) {
          console.log("Lab Construction site failed " + evt);
          return;
        }
        flag.remove();
        anzLabss++;
      }
    }
  }

  private getLabs(): StructureLab[] {
    if (this.cacheLabs.readTime !== Game.time) {
      this.cacheLabs.cache = RoomManager.getManager(this.roomName).getMyStructures().filter((s) => s.structureType === STRUCTURE_LAB) as StructureLab[];
      this.cacheLabs.readTime = Game.time;
    }
    return this.cacheLabs.cache;
  }

  private getRoom(): LabRoom | null {
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
    if (!_.isObject(room.memory.labs)) {
      room.memory.labs = {};
    }
    for (const labId in room.memory.labs) {
      if (!room.memory.labs.hasOwnProperty(labId)) {
        continue;
      }
      if (!_.isObject(room.memory.labs[labId])) {
        room.memory.labs[labId] = {
          reservations: [],
        };
      }
      room.memory.labs[labId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.labs[labId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow Lab
    this.getLabs().forEach((lab) => {
      if (!_.isObject(room.memory.labs[lab.id])) {
        room.memory.labs[lab.id] = {
          reservations: [],
        };
      }
    });
    // Update Lab
    for (const labId in room.memory.labs) {
      if (!room.memory.labs.hasOwnProperty(labId)) {
        continue;
      }
      const labs = Game.getObjectById<StructureLab>(labId);
      if (labs === null || labs.room.name !== room.name) {
        delete room.memory.labs[labId];
      } else {
        room.memory.labs[labId].reservations = this.updateMemoryReservations(labs, room.memory.labs[labId].reservations);
      }
    }
  }

}
