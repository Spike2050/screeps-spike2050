import * as Config from "../../../config/config";
import {
  CacheRead, CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, SCOUT_ROLE_NAME,
  ScoutRoleType
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {ControllerManager} from "../../structures/controllerManager";
import {DefenderManager} from "./defenderManager";

interface ScoutManagers {
  [roomName: string]: ScoutManager;
}

const scoutManagers: ScoutManagers = {};

const SCOUT_JOB_TYPE_SCOUT = "scout";
type ScoutJobTypeScout = "scout";

interface ScoutScoutJob {
  "type": ScoutJobTypeScout;
  room: string;
}

interface ScoutMemory extends CreepMemory {
  role: ScoutRoleType;
  job: ScoutScoutJob | CreepJobNone;
}

interface ScoutCreep extends Creep {
  memory: ScoutMemory;
}

interface ScoutRoomMemory {
  scouts: {
    generation: number;
    scouted: number;
    enemyBasesAndStructures: number;
    lastCreepProduced: number;
  };
}

interface ScoutRoom extends Room {
  memory: ScoutRoomMemory;
}

export class ScoutManager {

  public static getManager(roomOrRoomName: Room | string): ScoutManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof scoutManagers[roomName] === "undefined") {
      scoutManagers[roomName] = new ScoutManager(roomName);
    }
    return scoutManagers[roomName];
  }

  public static hasEnemyBaseAndStructures(roomName: string): boolean {
    const scoutRoomMemory: ScoutRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(scoutRoomMemory)) {
      return false;
    }
    if (!_.isObject(scoutRoomMemory.scouts)) {
      return false;
    }
    if (!_.isNumber(scoutRoomMemory.scouts.enemyBasesAndStructures)) {
      return false;
    }
    return scoutRoomMemory.scouts.enemyBasesAndStructures !== 0;
  }

  private static hasBeenScouted(roomName: string): boolean {
    const scoutRoomMemory: ScoutRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(scoutRoomMemory)) {
      return false;
    }
    if (!_.isObject(scoutRoomMemory.scouts)) {
      return false;
    }
    if (!_.isNumber(scoutRoomMemory.scouts.scouted)) {
      return false;
    }
    return scoutRoomMemory.scouts.scouted !== 0;
  }

  private static unscoutedRoomNames(centerRoom: ScoutRoom): string[] {
    return (_.values(Game.map.describeExits(centerRoom.name)) as string[]).filter((scoutRoomname) => {
      return !ScoutManager.hasBeenScouted(scoutRoomname);
    });
  }

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getScouts(): ScoutCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === SCOUT_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzScouts(): number {
    return this.getScouts().length;
  }

  public run(): void {
    this.refeshMemory();
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.getScouts().forEach((creep) => {
      if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
        if (!creep.spawning) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === SCOUT_JOB_TYPE_SCOUT) {
        if (creep.room.name === creep.memory.job.room && creep.pos.x > 0 && creep.pos.x < 49 && creep.pos.y > 0 && creep.pos.y < 49) {
          this.getNextJob(creep);
        }
      }

      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === SCOUT_JOB_TYPE_SCOUT) {
        const pos = new RoomPosition(25, 25, creep.memory.job.room);
        CreepManager.moveToPos(creep, pos);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, _maxBuildEnergyInNearbySpawns: number): CreepPlan | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    if (DefenderManager.getManager(room).defenseMode()) {
      return null;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null || !controller.my) {
      return null;
    }
    const availableEnergy = spawnRoom.energyAvailable;
    if (availableEnergy < Config.SCOUT_MIN_COST) {
      return null;
    }
    if (room.memory.scouts.lastCreepProduced === Game.time) {
      return null;
    }

    const anzScouts = ScoutManager.getManager(room).getScouts().length;
    if (anzScouts > 0) {
      return null;
    }

    if (spawnRoom.name !== room.name) {
      return null;
    }

    const unscoutedRooms = ScoutManager.unscoutedRoomNames(room);
    if (unscoutedRooms.length === 0) {
      return null;
    }

    const body: string[] = [MOVE];
    const memory: ScoutMemory = {
      job: CREEP_JOB_NONE,
      role: SCOUT_ROLE_NAME,
      room: room.name
    };

    return {
      body,
      importance: CreepPlanImportance.Insignificant,
      memory,
      name: SCOUT_ROLE_NAME + " " + room.name + " " + room.memory.scouts.generation
    };
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.scouts.generation++;
    room.memory.scouts.lastCreepProduced = Game.time;
  }

  private getNextJob(creep: ScoutCreep) {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const unscoutedRooms = ScoutManager.unscoutedRoomNames(room).sort();
    if (unscoutedRooms.length === 0) {
      creep.suicide();
    }
    creep.memory.job = {
      room: unscoutedRooms[0],
      type: SCOUT_JOB_TYPE_SCOUT
    };
  }

  private getRoom(): ScoutRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private initializeMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.scouts)) {
      room.memory.scouts = {
        enemyBasesAndStructures: 0,
        generation: 0,
        lastCreepProduced: 0,
        scouted: 0
      };
    }
    if (!_.isNumber(room.memory.scouts.enemyBasesAndStructures)) {
      room.memory.scouts.enemyBasesAndStructures = 0;
    }
    if (!_.isNumber(room.memory.scouts.generation)) {
      room.memory.scouts.generation = 0;
    }
    if (!_.isNumber(room.memory.scouts.scouted)) {
      room.memory.scouts.scouted = 0;
    }
    if (!_.isNumber(room.memory.scouts.lastCreepProduced)) {
      room.memory.scouts.lastCreepProduced = 0;
    }
  }

  private refeshMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.scouts.enemyBasesAndStructures = room.find(FIND_HOSTILE_STRUCTURES).length + room.find(FIND_HOSTILE_SPAWNS).length;
    room.memory.scouts.scouted = Game.time;
  }

}
