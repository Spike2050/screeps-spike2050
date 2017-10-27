// import {log} from "../../lib/logger/log";

// import * as Config from "../../config/config";

import {SourceManager} from "./sourceManager";

interface ControllerManagers {
  [roomName: string]: ControllerManager;
}

const controllerManagers: ControllerManagers = {};

interface ControllerRoomMemory {
  controller: {
    sourceDistance?: number;
  };
}

interface ControllerRoom extends Room {
  memory: ControllerRoomMemory;
}

export class ControllerManager {

  public static getManager(roomOrRoomName: Room | string): ControllerManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof controllerManagers[roomName] === "undefined") {
      controllerManagers[roomName] = new ControllerManager(roomName);
    }
    return controllerManagers[roomName];
  }

  public static anzControlledRooms(): number {
    return _.sum(_.values(Game.rooms), (room: Room) => {
      const controller = ControllerManager.getManager(room).getController();
      return controller !== null && controller.my ? 1 : 0;
    });
  }

  public static getControllerSourceDistance(controller: StructureController): number | null {
    const controllerRoomMemory: ControllerRoomMemory = Memory.rooms[controller.room.name];
    if (!_.isObject(controllerRoomMemory)) {
      return null;
    }
    if (!_.isObject(controllerRoomMemory.controller)) {
      return null;
    }
    if (!_.isNumber(controllerRoomMemory.controller.sourceDistance)) {
      return null;
    }
    return controllerRoomMemory.controller.sourceDistance;
  }

  private roomName: string;

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getController(): Controller | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    if (typeof room.controller === "undefined") {
      return null;
    }
    return room.controller;
  }

  public getControllerLevel(): number {
    const controller = this.getController();
    if (controller === null) {
      return 0;
    }
    return controller.level;
  }

  public controlled(): boolean {
    const controller = this.getController();
    if (controller === null) {
      return false;
    }
    return controller.my;
  }

  public getProgressToNextLevel() {
    const controller = this.getController();
    if (controller === null || controller.level === 8 || controller.progressTotal === 0) {
      return 0;
    }
    return controller.progress / controller.progressTotal;
  }

  public getRoom(): ControllerRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  public run() {
    // Nothing
  }

  private initializeMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.controller)) {
      room.memory.controller = {};
    }
    if (!_.isNumber(room.memory.controller.sourceDistance)) {
      delete room.memory.controller.sourceDistance;
      const controller = this.getController();
      const sources = SourceManager.getManager(room).getSources();
      if (controller !== null && sources.length > 0) {
        room.memory.controller.sourceDistance = _.min(sources.map((source) => controller.pos.getRangeTo(source.pos)));
      }
    }
  }

}
