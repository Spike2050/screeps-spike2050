// import {log} from "../../lib/logger/log";

import * as Config from "../../config/config";
import {CacheRead} from "../../config/types";
import {RoomManager} from "../roomManager";

interface RampartsManagers {
  [roomName: string]: RampartManager;
}

const rampartManagers: RampartsManagers = {};

export class RampartManager {

  public static getManager(roomOrRoomName: Room | string): RampartManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof rampartManagers[roomName] === "undefined") {
      rampartManagers[roomName] = new RampartManager(roomName);
    }
    return rampartManagers[roomName];
  }

  public static getMinHpRampartForLevel(controllerLevel: number, progressToNextLevel: number): number {
    const minHpRampartThisLevel = RampartManager.getMinHpRampart(controllerLevel);
    const minHpRampartNextLevel = RampartManager.getMinHpRampart(controllerLevel + 1);
    return Math.floor(minHpRampartThisLevel + (minHpRampartNextLevel - minHpRampartThisLevel) * progressToNextLevel);
  }

  public static getMaxHpRampartForLevel(controllerLevel: number, progressToNextLevel: number): number {
    const maxHpRampartThisLevel = RampartManager.getMaxHpRampart(controllerLevel);
    const maxHpRampartNextLevel = RampartManager.getMaxHpRampart(controllerLevel + 1);
    return Math.floor(maxHpRampartThisLevel + (maxHpRampartNextLevel - maxHpRampartThisLevel) * progressToNextLevel);
  }

  private static getMinHpRampart(level: number): number {
    switch (level) {
      case 0:
      case 1: return 0;
      case 2: return Config.RAMPART_MIN_HP_CL2;
      case 3: return Config.RAMPART_MIN_HP_CL3;
      case 4: return Config.RAMPART_MIN_HP_CL4;
      case 5: return Config.RAMPART_MIN_HP_CL5;
      case 6: return Config.RAMPART_MIN_HP_CL6;
      case 7: return Config.RAMPART_MIN_HP_CL7;
      default: return Config.RAMPART_MIN_HP_CL8;
    }
  }

  private static getMaxHpRampart(level: number): number {
    switch (level) {
      case 0:
      case 1: return 0;
      case 2: return Config.RAMPART_MAX_HP_CL2;
      case 3: return Config.RAMPART_MAX_HP_CL3;
      case 4: return Config.RAMPART_MAX_HP_CL4;
      case 5: return Config.RAMPART_MAX_HP_CL5;
      case 6: return Config.RAMPART_MAX_HP_CL6;
      case 7: return Config.RAMPART_MAX_HP_CL7;
      default: return Config.RAMPART_MAX_HP_CL8;
    }
  }

  private roomName: string;
  private cacheRamparts: CacheRead<StructureRampart[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
  }

  public run() {
    // Nothing
  }

  public getMyRamparts(): StructureRampart[] {
    if (this.cacheRamparts.readTime !== Game.time) {
      this.cacheRamparts.cache = RoomManager.getManager(this.roomName).getMyStructures().filter((structure) => structure.structureType === STRUCTURE_RAMPART) as StructureRampart[];
      this.cacheRamparts.readTime = Game.time;
    }
    return this.cacheRamparts.cache as StructureRampart[];
  }

}
