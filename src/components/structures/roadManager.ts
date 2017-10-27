import * as Config from "../../config/config";

// import { log } from "../lib/logger/log";

interface RoadManagers {
  [roomName: string]: RoadManager;
}

const roadManagers: RoadManagers = {};

export class RoadManager {

  public static getManager(roomOrRoomName: Room | string): RoadManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof roadManagers[roomName] === "undefined") {
      roadManagers[roomName] = new RoadManager(roomName);
    }
    return roadManagers[roomName];
  }

  public static createRoad(pos: RoomPosition): void {
    const room = RoadManager.getManager(pos.roomName).getRoom();
    if (room === null) {
      return;
    }
    const hasNoBuildingsExceptRampartsandContainers = room.lookForAt<Structure>(LOOK_STRUCTURES, pos).filter((s) => s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART).length === 0;
    if (hasNoBuildingsExceptRampartsandContainers) {
      const hasNoConstructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos).length === 0;
      if (hasNoConstructionSites) {
        const evt = room.createConstructionSite(pos, STRUCTURE_ROAD);
        if (evt !== OK) {
          console.log("Road Construction site failed " + evt + " x " + pos.x + " y " + pos.y + " room " + room.name);
        }
      }
    }
  }

  private roomName: string;

  private constructor(roomName: string) {
    this.roomName = roomName;
  }

  public run(): void {
    this.deleteBrokenRoads();
  }

  public getRoad(pos: RoomPosition): StructureRoad | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const roads = room.lookForAt<StructureRoad>(LOOK_STRUCTURES, pos).filter((s) => s.structureType === STRUCTURE_ROAD);
    return (roads.length === 0) ? null : roads[0];
  }

  private deleteBrokenRoads() {
    if (Math.floor(Game.time / 400) * 400 + 76 === Game.time) {
      this.getBrokenRoads().filter((r) => r.hits / r.hitsMax <= Config.ROAD_HEALTH_DELETE).forEach((r) => r.destroy());
    }
  }

  private getBrokenRoads(): StructureRoad[] {
    return this.getRoads().filter((r) => {
      return r.hits / r.hitsMax < Config.ROAD_START_REPAIRING;
    });
  }

  private getRoom(): Room | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private getRoads(): StructureRoad[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<StructureRoad>(FIND_STRUCTURES, {
      filter: (s: Structure) => s.structureType === STRUCTURE_ROAD
    });
  }

}
