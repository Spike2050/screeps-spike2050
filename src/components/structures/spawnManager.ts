import {log} from "../../lib/logger/log";

// import * as Config from "../../config/config";

import {
  CreepPlan, ResourceReservation, ResourceSourceOrSinkType,
  ScreepsResourceSourceOrSink
} from "../../config/types";
import {CreepManager} from "../creeps/creepManager";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";

interface SpawnRoomMemory {
  spawns: {
    [index: string]: {
      reservations: ResourceReservation[];
      renewReservation: string[];
    }
  };
}

interface SpawnRoom extends Room {
  memory: SpawnRoomMemory;
}

interface SpawnManagers {
  [roomName: string]: SpawnManager;
}

const spawnManagers: SpawnManagers = {};

export class SpawnManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): SpawnManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof spawnManagers[roomName] === "undefined") {
      spawnManagers[roomName] = new SpawnManager(roomName);
    }
    return spawnManagers[roomName];
  }

  public static getAllSpawns(): Spawn[] {
    return _.flatten(_.keys(Memory.rooms).map((roomName) => {
      return SpawnManager.getManager(roomName).getMySpawns();
    }));
  }

  public static getMeanSpawnDistancesInRoom(pos: RoomPosition): number {
    const spawns = SpawnManager.getManager(pos.roomName).getMySpawns().map((spawn) => PathFinder.search(pos, spawn.pos).cost, {swampCost: 1}).sort();
    if (spawns.length === 0) {
      return 0;
    }
    return spawns[Math.floor(spawns.length / 2)];
  }

  public static getMaxBuildEnergy(): number {
    const allSpawns = SpawnManager.getAllSpawns();
    if (allSpawns.length === 0) {
      return 0;
    }
    return _.max(allSpawns.map((spawn) => spawn.room.energyCapacityAvailable));
  }

  public static reserveRenewReservation(creep: Creep, spawn: Spawn): boolean {
    const spawnRoomMemory: SpawnRoomMemory = Memory.rooms[spawn.room.name];
    if (!_.isObject(spawnRoomMemory)) {
      return false;
    }
    if (!_.isObject(spawnRoomMemory.spawns)) {
      return false;
    }
    if (!_.isObject(spawnRoomMemory.spawns[spawn.id])) {
      return false;
    }
    if (!_.isArray(spawnRoomMemory.spawns[spawn.id].renewReservation)) {
      spawnRoomMemory.spawns[spawn.id].renewReservation = [];
    }
    let creepIndex = _.findIndex(spawnRoomMemory.spawns[spawn.id].renewReservation, (creepId) => creepId === creep.id);
    if (!_.isNumber(creepIndex) || creepIndex < 0) {
      spawnRoomMemory.spawns[spawn.id].renewReservation.push(creep.id);
      creepIndex = spawnRoomMemory.spawns[spawn.id].renewReservation.length - 1;
    }
    return creepIndex === 0;
  }

  private static hasRenewReservations(spawn: StructureSpawn): boolean {
    if (!_.isObject(Memory.rooms[spawn.room.name])) {
      return false;
    }
    const spawnRoomMemory: SpawnRoomMemory = Memory.rooms[spawn.room.name];
    if (!_.isObject(spawnRoomMemory.spawns)) {
      return false;
    }
    if (!_.isObject(spawnRoomMemory.spawns[spawn.id])) {
      return false;
    }
    if (!_.isArray(spawnRoomMemory.spawns[spawn.id].renewReservation)) {
      return false;
    }
    return spawnRoomMemory.spawns[spawn.id].renewReservation.length === 0;
  }

  private roomName: string;

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Spawn);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingCreeps();
  }

  public getClosestSpawn(pos: RoomPosition): StructureSpawn | null {
    const spawns = _.sortBy(this.getMySpawns(), (s) => PathFinder.search(pos, s.pos).cost);
    return (spawns.length === 0) ? null : spawns[0];
  }

  public energyAvailable(): number {
    const spawns = this.getMySpawns();
    if (spawns.length === 0) {
      return 0;
    }
    return _.sum(spawns, (c) => c.energy);
  }

  public energyCapacity(): number {
    const spawns = this.getMySpawns();
    if (spawns.length === 0) {
      return 0;
    }
    return _.sum(spawns, (s) => s.energyCapacity);
  }

  public getSpawnPos(): RoomPosition[] {
    return this.getMySpawns().map((s) => s.pos);
  }

  public hasSpawns(): boolean {
    return this.getMySpawns().length !== 0;
  }

  public getMySpawns(): StructureSpawn[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Spawn>(FIND_MY_SPAWNS);
  }

  public hasHostileSpawns(): boolean {
    return this.getHostileSpawns().length !== 0;
  }

  public getHostileSpawns(): StructureSpawn[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Spawn>(FIND_HOSTILE_SPAWNS);
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getMySpawns();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const spawnRoomMemory: SpawnRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(spawnRoomMemory.spawns)) {
      return [];
    }
    if (!_.isObject(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const spawnRoomMemory: SpawnRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(spawnRoomMemory.spawns)) {
      return;
    }
    if (!_.isObject(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id])) {
      return;
    }
    spawnRoomMemory.spawns[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(_screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    return 20;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const spawnRoomMemory: SpawnRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(spawnRoomMemory.spawns)) {
      return false;
    }
    if (!_.isObject(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(spawnRoomMemory.spawns[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private getRoom(): SpawnRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  private buildMissingCreeps(): void {
    const allSpawns = SpawnManager.getAllSpawns();
    if (allSpawns.length === 0) {
      return;
    }

    const maxBuildEnergy = _.max(allSpawns.map((spawn) => spawn.room.energyCapacityAvailable));

    const filteredSpawns = allSpawns.filter((spawn) => {
      if (spawn.spawning !== null) {
        return false;
      }
      return !SpawnManager.hasRenewReservations(spawn);
    }).sort((s1, s2) => {
      return s2.room.energyAvailable - s1.room.energyAvailable;
    });

    if (filteredSpawns.length === 0) {
      return;
    }

    filteredSpawns.forEach((spawn) => {
      const plans = CreepManager.getManager(this.roomName).getNewCreepPlans(spawn.room, maxBuildEnergy).sort(((p1, p2) => p1.importance - p2.importance));

      if (plans.length === 0) {
        return;
      }

      const selectedPlan = plans[0];

      selectedPlan.body = selectedPlan.body.sort((b1, b2) => {
        if (b1 === TOUGH && b2 !== TOUGH) {
          return -1;
        } else if (b1 !== TOUGH && b2 === TOUGH) {
          return 1;
        } else if (b1 === CARRY && b2 !== CARRY) {
          return -1;
        } else if (b1 !== CARRY && b2 === CARRY) {
          return 1;
        } else if (b1 === WORK && b2 !== WORK) {
          return -1;
        } else if (b1 !== WORK && b2 === WORK) {
          return 1;
        } else if (b1 === MOVE && b2 !== MOVE) {
          return -1;
        } else if (b1 !== MOVE && b2 === MOVE) {
          return 1;
        } else if (b1 === CLAIM && b2 !== CLAIM) {
          return -1;
        } else if (b1 !== CLAIM && b2 === CLAIM) {
          return 1;
        } else if (b1 === ATTACK && b2 !== ATTACK) {
          return -1;
        } else if (b1 !== ATTACK && b2 === ATTACK) {
          return 1;
        } else if (b1 === RANGED_ATTACK && b2 !== RANGED_ATTACK) {
          return -1;
        } else if (b1 !== RANGED_ATTACK && b2 === RANGED_ATTACK) {
          return 1;
        } else if (b1 === HEAL && b2 !== HEAL) {
          return -1;
        } else if (b1 !== HEAL && b2 === HEAL) {
          return 1;
        }
        return 0;
      });

      if (this.spawnCreep(spawn, selectedPlan)) {
        CreepManager.getManager(this.roomName).creepProduced(selectedPlan);
      }
    });
  }

  private spawnCreep(spawn: Spawn, plan: CreepPlan): boolean {
    const status = spawn.spawnCreep(plan.body, plan.name, {
      memory: plan.memory
    });
    const outStr = (status === OK) ? "Created new creep" : "Failed(" + status + ") creating creep";
    log.info(outStr + ":" + plan.name + " body: " + plan.body.join(", ") + " memory: " + JSON.stringify(plan.memory));
    return status === OK;
  }

  private initMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.spawns)) {
      room.memory.spawns = {};
    }
    for (const spawnId in room.memory.spawns) {
      if (!room.memory.spawns.hasOwnProperty(spawnId)) {
        continue;
      }
      if (!_.isObject(room.memory.spawns[spawnId])) {
        room.memory.spawns[spawnId] = {
          renewReservation: [],
          reservations: []
        };
      }
      if (!_.isArray(room.memory.spawns[spawnId].renewReservation)) {
        room.memory.spawns[spawnId].renewReservation = [];
      }
      room.memory.spawns[spawnId].renewReservation = room.memory.spawns[spawnId].renewReservation.filter((creepId) => _.isString(creepId));
      if (!_.isArray(room.memory.spawns[spawnId].reservations)) {
        room.memory.spawns[spawnId].reservations = [];
      }
      room.memory.spawns[spawnId].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.spawns[spawnId].reservations);
    }
  }

  private refeshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    // Add unknow Spawns
    this.getMySpawns().forEach((spawn) => {
      if (!_.isObject(room.memory.spawns[spawn.id])) {
        room.memory.spawns[spawn.id] = {
          renewReservation: [],
          reservations: []
        };
      }
    });
    // Update Spawns
    for (const spawnId in room.memory.spawns) {
      if (!room.memory.spawns.hasOwnProperty(spawnId)) {
        continue;
      }
      const spawn = Game.getObjectById<StructureSpawn>(spawnId);
      if (spawn === null || spawn.room.name !== room.name) {
        delete room.memory.spawns[spawnId];
      } else {
        room.memory.spawns[spawnId].reservations = this.updateMemoryReservations(spawn, room.memory.spawns[spawnId].reservations);
        room.memory.spawns[spawnId].renewReservation = room.memory.spawns[spawnId].renewReservation.filter((creepId) => {
          const creep: Creep | null = Game.getObjectById<Creep>(creepId);
          if (creep === null) {
            return false;
          }
          if (!CreepManager.holdsRenewReservation(spawn, creep)) {
            return false;
          }
          return true;
        });
      }
    }
  }

}
