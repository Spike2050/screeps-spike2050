import * as Config from "../../config/config";
import {RoomManager} from "../roomManager";
import {ControllerManager} from "./controllerManager";
import {RoadManager} from "./roadManager";

// import { log } from "../lib/logger/log";

interface MovementManagers {
  [roomName: string]: MovementManager;
}

const movementManagers: MovementManagers = {};

interface Usage {
  startTick: number;
  used: number;
}

interface RoadRoomXYMemory {
  [y: string]: Usage[];
}

interface RoadRoomXMemory {
  [x: string]: RoadRoomXYMemory;
}

interface RoadRoomMemory {
  movement: RoadRoomXMemory;
}

interface RoadRoom extends Room {
  memory: RoadRoomMemory;
}

export class MovementManager {

  public static getManager(roomOrRoomName: Room | string): MovementManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof movementManagers[roomName] === "undefined") {
      movementManagers[roomName] = new MovementManager(roomName);
    }
    return movementManagers[roomName];
  }

  public static usedRoad(pos: RoomPosition): void {
    const room = MovementManager.getManager(pos.roomName).getRoom();
    if (room === null) {
      return;
    }
    if (RoomManager.isMapBorder(pos)) {
      return;
    }
    if (!ControllerManager.getManager(pos.roomName).controlled()) {
      return;
    }
    if (!_.isObject(room.memory.movement[pos.x])) {
      room.memory.movement[pos.x] = {};
    }
    if (!_.isArray(room.memory.movement[pos.x][pos.y])) {
      room.memory.movement[pos.x][pos.y] = [];
    }
    const arr = room.memory.movement[pos.x][pos.y];
    const currentTick = Game.time;
    const currentStartTick = Math.floor(currentTick / Config.ROAD_HISTORY_CHUNK_SIZE) * Config.ROAD_HISTORY_CHUNK_SIZE;
    if (arr.length === 0 || arr[arr.length - 1].startTick !== currentStartTick) {
      arr.push({startTick: currentStartTick, used: 1});
    } else {
      arr[arr.length - 1].used++;
    }
    if (MovementManager.getManager(pos.roomName).getMovement(pos.x, pos.y) >= Config.ROAD_MIN_USAGE) {
      RoadManager.createRoad(pos);
    }
  }

  private roomName: string;

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initMemory();
  }

  public run(): void {
    this.refreshMemory();
  }

  public getMovement(x: number, y: number): number {
    const room = this.getRoom();
    if (room === null) {
      return 0;
    }
    if (RoomManager.isMapBorder(x, y)) {
      return 0;
    }
    if (!_.isObject(room.memory.movement[x])) {
      return 0;
    }
    if (!_.isArray(room.memory.movement[x][y])) {
      return 0;
    }
    return _.sum(room.memory.movement[x][y], (usage) => usage.used);
  }

  private getRoom(): RoadRoom | null {
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
    if (!_.isObject(room.memory.movement)) {
      room.memory.movement = {};
    }
  }

  private refreshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const currentTick = Game.time;
    const currentStartTick = Math.floor(currentTick / Config.ROAD_HISTORY_CHUNK_SIZE) * Config.ROAD_HISTORY_CHUNK_SIZE;
    if (currentTick !== currentStartTick) {
      return;
    }
    const oldestTick = currentTick - Config.ROAD_TICK_LIFE_TIME;
    _.forOwn(room.memory.movement, (arr) => {
      _.forOwn(arr, (usages) => {
        while (usages.length > 0 && usages[0].startTick < oldestTick) {
          usages.shift();
        }
      });
    });
  }

}
