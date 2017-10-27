// import {log} from "../../lib/logger/log";

import {CacheRead} from "../../config/types";
import {BuilderManager} from "../creeps/roles/builderManager";

interface ConstructionManagers {
  [roomName: string]: ConstructionManager;
}

const constructionManagers: ConstructionManagers = {};

interface Reservation {
  creepId: string;
  amount: number;
}

interface ConstructionRoom extends Room {
  memory: {
    constructionSites: {
      [index: string]: {
        reservations: Reservation[];
      }
    }
  };
}

export class ConstructionManager {

  public static getManager(roomOrRoomName: Room | string): ConstructionManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof constructionManagers[roomName] === "undefined") {
      constructionManagers[roomName] = new ConstructionManager(roomName);
    }
    return constructionManagers[roomName];
  }

  private roomName: string;
  private cacheConstructionSitesMissingEnergy: CacheRead<number> = {
    cache: 0,
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
  }

  public getConstructionSites(pos: RoomPosition, structureType: string | null = null): ConstructionSite[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    const constructionSites = room.lookForAt<ConstructionSite>(LOOK_CONSTRUCTION_SITES, pos);
    if (structureType === null) {
      return [];
    }
    return constructionSites.filter((c) => c.structureType === structureType);
  }

  public getConstructionSitesMissingEnergy(): number {
    if (this.cacheConstructionSitesMissingEnergy.readTime !== Game.time) {
      const constructionSites = this.getMyConstructionSites();
      if (constructionSites.length === 0) {
        this.cacheConstructionSitesMissingEnergy.cache = 0;
      } else {
        this.cacheConstructionSitesMissingEnergy.cache = _.sum(this.getMyConstructionSites().map((constructionSite) => {
          return constructionSite.progressTotal - constructionSite.progress;
        }));
      }
      this.cacheConstructionSitesMissingEnergy.readTime = Game.time;
    }
    return this.cacheConstructionSitesMissingEnergy.cache;
  }

  public getAndReserveConstructionSite(creep: Creep, energyAmount: number): ConstructionSite | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const constructionSites = this.getMyConstructionSites().filter((constructionSite) => {
      if (!_.isObject(room.memory.constructionSites[constructionSite.id])) {
        return true;
      }
      const energyReservedForConstructionSite = _.sum(room.memory.constructionSites[constructionSite.id].reservations.filter((reservation) => {
        return creep.id !== reservation.creepId;
      }).map((reservation) => {
        return reservation.amount;
      }));
      return constructionSite.progressTotal - constructionSite.progress > energyReservedForConstructionSite;
    }).map((constructionSite) => {
      return {
        constructionSite,
        distance: PathFinder.search(creep.pos, constructionSite.pos, {swampCost: 1}).cost
      };
    }).sort((c1, c2) => {
      if (c1.constructionSite.structureType === STRUCTURE_ROAD && c2.constructionSite.structureType !== STRUCTURE_ROAD) {
        return -1;
      }
      if (c1.constructionSite.structureType !== STRUCTURE_ROAD && c2.constructionSite.structureType === STRUCTURE_ROAD) {
        return 1;
      }
      if (c1.constructionSite.structureType === STRUCTURE_SPAWN && c2.constructionSite.structureType !== STRUCTURE_SPAWN) {
        return -1;
      }
      if (c1.constructionSite.structureType !== STRUCTURE_SPAWN && c2.constructionSite.structureType === STRUCTURE_SPAWN) {
        return 1;
      }
      if (c1.constructionSite.structureType === STRUCTURE_EXTENSION && c2.constructionSite.structureType !== STRUCTURE_EXTENSION) {
        return -1;
      }
      if (c1.constructionSite.structureType !== STRUCTURE_EXTENSION && c2.constructionSite.structureType === STRUCTURE_EXTENSION) {
        return 1;
      }
      if (c1.constructionSite.structureType === STRUCTURE_CONTAINER && c2.constructionSite.structureType !== STRUCTURE_CONTAINER) {
        return -1;
      }
      if (c1.constructionSite.structureType !== STRUCTURE_CONTAINER && c2.constructionSite.structureType === STRUCTURE_CONTAINER) {
        return 1;
      }
      // Then the closest ones
      return c1.distance - c2.distance;
    });
    if (constructionSites.length === 0) {
      return null;
    }
    const foundConstructionSite = constructionSites[0].constructionSite;
    if (!_.isObject(room.memory.constructionSites[foundConstructionSite.id])) {
      room.memory.constructionSites[foundConstructionSite.id] = {
        reservations: []
      };
    }
    room.memory.constructionSites[foundConstructionSite.id].reservations = room.memory.constructionSites[foundConstructionSite.id].reservations.filter((reservation) => {
      return creep.id !== reservation.creepId;
    });
    room.memory.constructionSites[foundConstructionSite.id].reservations.push({
      amount: energyAmount,
      creepId: creep.id
    });
    return foundConstructionSite;
  }

  public anzMyConstructionSites(): number {
    return this.getMyConstructionSites().length;
  }

  public getMyConstructionSites(): ConstructionSite[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
  }

  public hasStorageConstruction(): boolean {
    return _.any(this.getMyConstructionSites(), (constructionSite) => constructionSite.structureType === STRUCTURE_STORAGE);
  }

  private getRoom(): ConstructionRoom | null {
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
    if (!_.isObject(room.memory.constructionSites)) {
      room.memory.constructionSites = {};
    }
    for (const constructionId in room.memory.constructionSites) {
      if (!room.memory.constructionSites.hasOwnProperty(constructionId)) {
        continue;
      }
      if (!_.isArray(room.memory.constructionSites[constructionId].reservations)) {
        delete room.memory.constructionSites[constructionId];
        continue;
      }
      room.memory.constructionSites[constructionId].reservations = room.memory.constructionSites[constructionId].reservations.filter((reservation) => {
        if (!_.isString(reservation.creepId)) {
          return false;
        }
        if (!_.isNumber(reservation.amount)) {
          return false;
        }
        return true;
      });
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Remove Those that don't exist anymore
    for (const constructionId in room.memory.constructionSites) {
      if (!room.memory.constructionSites.hasOwnProperty(constructionId)) {
        continue;
      }
      const constructionSite = Game.getObjectById<ConstructionSite>(constructionId);
      if (constructionSite === null || _.isUndefined(constructionSite.room) || (constructionSite.room as Room).name !== room.name) {
        delete room.memory.constructionSites[constructionId];
      } else {
        room.memory.constructionSites[constructionId].reservations = room.memory.constructionSites[constructionId].reservations.filter((reservation) => {
          const creep = Game.getObjectById<Creep>(reservation.creepId);
          if (creep === null) {
            return false;
          }
          reservation.amount = BuilderManager.getConstructionSiteReservation(creep, constructionSite);
          if (reservation.amount === 0) {
            return false;
          }
          return true;
        });
        if (room.memory.constructionSites[constructionId].reservations.length === 0) {
          delete room.memory.constructionSites[constructionId];
        }
      }
    }
  }

}
