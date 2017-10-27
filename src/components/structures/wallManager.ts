// import {log} from "../../lib/logger/log";

import * as Config from "../../config/config";

interface WallManagers {
  [roomName: string]: WallManager;
}

const wallsManagers: WallManagers = {};

export class WallManager {

  public static getManager(roomOrRoomName: Room | string): WallManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof wallsManagers[roomName] === "undefined") {
      wallsManagers[roomName] = new WallManager(roomName);
    }
    return wallsManagers[roomName];
  }

  public static getMinHpWallForLevel(controllerLevel: number, progressToNextLevel: number): number {
    const minHpWallThisLevel = WallManager.getMinHpWall(controllerLevel);
    const minHpWallNextLevel = WallManager.getMinHpWall(controllerLevel + 1);
    return Math.floor(minHpWallThisLevel + (minHpWallNextLevel - minHpWallThisLevel) * progressToNextLevel);
  }

  public static getMaxHpWallForLevel(controllerLevel: number, progressToNextLevel: number): number {
    const maxHpWallThisLevel = WallManager.getMaxHpWall(controllerLevel);
    const maxHpWallNextLevel = WallManager.getMaxHpWall(controllerLevel + 1);
    return Math.floor(maxHpWallThisLevel + (maxHpWallNextLevel - maxHpWallThisLevel) * progressToNextLevel);
  }

  private static getMinHpWall(level: number): number {
    switch (level) {
      case 0:
      case 1: return 0;
      case 2: return Config.WALL_MIN_HP_CL2;
      case 3: return Config.WALL_MIN_HP_CL3;
      case 4: return Config.WALL_MIN_HP_CL4;
      case 5: return Config.WALL_MIN_HP_CL5;
      case 6: return Config.WALL_MIN_HP_CL6;
      case 7: return Config.WALL_MIN_HP_CL7;
      default: return Config.WALL_MIN_HP_CL8;
    }
  }

  private static getMaxHpWall(level: number): number {
    switch (level) {
      case 0:
      case 1: return 0;
      case 2: return Config.WALL_MAX_HP_CL2;
      case 3: return Config.WALL_MAX_HP_CL3;
      case 4: return Config.WALL_MAX_HP_CL4;
      case 5: return Config.WALL_MAX_HP_CL5;
      case 6: return Config.WALL_MAX_HP_CL6;
      case 7: return Config.WALL_MAX_HP_CL7;
      default: return Config.WALL_MAX_HP_CL8;
    }
  }

  private roomName: string;

  private constructor(roomName: string) {
    this.roomName = roomName;
  }

  public run() {
    // Nothing
  }

}
