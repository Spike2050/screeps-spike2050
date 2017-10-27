// import {log} from "../../lib/logger/log";

import {
  ResourceReservation, ResourceSourceOrSinkType, RoomPosId, ScreepsResourceSourceOrSink,
  XYPosition
} from "../../config/types";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";

interface SourceManagers {
  [roomName: string]: SourceManager;
}

const sourceManagers: SourceManagers = {};

export interface HarvestingSetup {
  anzHarvesters: number;
  anzCarry: number;
  anzWork: number;
  anzMove: number;
  energyProfit: number;
}

interface MemoryHarvestingSetup extends HarvestingSetup {
  lastRequested: number;
}

interface SourceMemory {
  reservations: ResourceReservation[];
  energyCapacity: number;
  seats: XYPosition[];
  pos: XYPosition;
}

interface SourceRoomMemory {
  sources: {
    [index: string]: SourceMemory
  };
}

interface SourceRoom extends Room {
  memory: SourceRoomMemory;
}

interface HarvestingMemory extends Memory {
  harvestingSetups: {
    [buildEnergy: number]: {
      [distance: number]: {
        [amountInSource: number]: {
          [anzPlaetze: number]: MemoryHarvestingSetup;
        };
      }
    }
  };
}

export class SourceManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): SourceManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof sourceManagers[roomName] === "undefined") {
      sourceManagers[roomName] = new SourceManager(roomName);
    }
    return sourceManagers[roomName];
  }

  public static getHarvestingSetup(buildEnergy: number, distance: number, amountInSource: number, anzPlaetze: number): HarvestingSetup {
    const harvestingMemory: HarvestingMemory = Memory as HarvestingMemory;
    if (!_.isObject(harvestingMemory.harvestingSetups)) {
      harvestingMemory.harvestingSetups = {};
    }
    if (!_.isObject(harvestingMemory.harvestingSetups[buildEnergy])) {
      harvestingMemory.harvestingSetups[buildEnergy] = {};
    }
    if (!_.isObject(harvestingMemory.harvestingSetups[buildEnergy][distance])) {
      harvestingMemory.harvestingSetups[buildEnergy][distance] = {};
    }
    if (!_.isObject(harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource])) {
      harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource] = {};
    }
    if (!_.isObject(harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource][anzPlaetze])) {
      const harvestingSetup = SourceManager.calculateHarvestingSetup(buildEnergy, distance, amountInSource, anzPlaetze);
      const memoryHarvestingSetup: MemoryHarvestingSetup = harvestingSetup as MemoryHarvestingSetup;
      harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource][anzPlaetze] = memoryHarvestingSetup;
    }
    harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource][anzPlaetze].lastRequested = Game.time;
    return harvestingMemory.harvestingSetups[buildEnergy][distance][amountInSource][anzPlaetze];
  }

  public static getAnzSourceSeats(source: Source): number {
    return SourceManager.getAnzSourceRoomSeats(source.room.name, source.id);
  }

  public static getAnzSourceRoomSeats(roomName: string, sourceId: string): number {
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(sourceRoomMemory)) {
      return 0;
    }
    if (!_.isObject(sourceRoomMemory.sources)) {
      return 0;
    }
    if (!_.isObject(sourceRoomMemory.sources[sourceId])) {
      return 0;
    }
    if (!_.isArray(sourceRoomMemory.sources[sourceId].seats)) {
      return 0;
    }
    return sourceRoomMemory.sources[sourceId].seats.length;
  }

  public static getClosestSourceSeat(source: Source, startPos: RoomPosition): RoomPosition | null {
    const sourceSeats = SourceManager.getSourceSeats(source).map((seat) => {
      const pos = new RoomPosition(seat.x, seat.y, source.room.name);
      return {
        distance: pos.getRangeTo(startPos),
        pos: new RoomPosition(seat.x, seat.y, source.room.name)
      };
    });
    if (sourceSeats.length === 0) {
      return null;
    }
    return (_.min(sourceSeats, (seat) => seat.distance)).pos;
  }

  public static getSourceSeats(source: Source): XYPosition[] {
    return SourceManager.getSourceRoomSeats(source.room.name, source.id);
  }

  public static getSourceRoomSeats(roomName: string, sourceId: string): XYPosition[] {
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(sourceRoomMemory)) {
      return [];
    }
    if (!_.isObject(sourceRoomMemory.sources)) {
      return [];
    }
    if (!_.isObject(sourceRoomMemory.sources[sourceId])) {
      return [];
    }
    if (!_.isArray(sourceRoomMemory.sources[sourceId].seats)) {
      return [];
    }
    return sourceRoomMemory.sources[sourceId].seats;
  }

  public static getEnergyCapacity(roomName: string, sourceId: string): number {
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(sourceRoomMemory)) {
      return 0;
    }
    if (!_.isObject(sourceRoomMemory.sources)) {
      return 0;
    }
    if (!_.isObject(sourceRoomMemory.sources[sourceId])) {
      return 0;
    }
    if (!_.isNumber(sourceRoomMemory.sources[sourceId].energyCapacity)) {
      return 0;
    }
    return sourceRoomMemory.sources[sourceId].energyCapacity;
  }

  public static calculateHarvestingSetup(buildEnergy: number, distance: number, amountInSource: number, anzPlaetze: number): HarvestingSetup {
    const bestHarvestingSetup: HarvestingSetup = {
      anzCarry: 0,
      anzHarvesters: 0,
      anzMove: 0,
      anzWork: 0,
      energyProfit: 0
    };
    const anzRegenPerLifeTime = Math.floor(CREEP_LIFE_TIME / ENERGY_REGEN_TIME);
    const notWorkTime = 2 + 2 * distance;
    let maxEnergyReached = false;
    for (let anzHarvesters = 1; anzHarvesters <= anzPlaetze + 1; anzHarvesters++) {
      outer: for (let anzWorkParts = 1; anzWorkParts <= Math.floor(buildEnergy / BODYPART_COST[WORK]); anzWorkParts++) {
        const workCost = anzWorkParts * BODYPART_COST[WORK];
        for (let anzCarryParts = anzWorkParts; anzCarryParts <= Math.floor(buildEnergy / BODYPART_COST[CARRY]); anzCarryParts++) {
          const carryCost = anzCarryParts * BODYPART_COST[CARRY];
          const anzMoveParts = Math.ceil((anzWorkParts + anzCarryParts) / 2);
          const moveCost = anzMoveParts * BODYPART_COST[MOVE];
          const creepCost = workCost + carryCost + moveCost;
          if (creepCost > buildEnergy) {
            continue outer;
          }
          const anzBodyParts = anzWorkParts + anzCarryParts + anzMoveParts;
          if (anzBodyParts > MAX_CREEP_SIZE) {
            continue outer;
          }
          const maintainTimePerEnergyCycle = anzBodyParts * 3 / anzRegenPerLifeTime;
          // Worktime alwasy increases with carry capacity
          const worktime = Math.ceil(anzCarryParts * CARRY_CAPACITY / (anzWorkParts * 2));
          const roundTripTime = notWorkTime + worktime;
          if (roundTripTime > ENERGY_REGEN_TIME) {
            continue outer;
          }
          if (anzHarvesters > anzPlaetze) {
            const tooManyWorkers = anzHarvesters - anzPlaetze;
            if (Math.floor(notWorkTime / worktime) < tooManyWorkers) {
              continue outer;
            }
          }
          const anzTripsPerRound = Math.floor((ENERGY_REGEN_TIME - maintainTimePerEnergyCycle) / (roundTripTime * (1 + 0.05 * anzHarvesters)));
          if (anzTripsPerRound === 0) {
            continue outer;
          }
          const allCarryPerRound = Math.min(anzCarryParts * CARRY_CAPACITY * anzTripsPerRound * anzHarvesters, amountInSource);
          if (allCarryPerRound >= amountInSource) {
            maxEnergyReached = true;
          }
          const costForAllHavesters = creepCost * anzHarvesters;
          const energyProfit = allCarryPerRound * anzRegenPerLifeTime - costForAllHavesters;
          if (energyProfit > bestHarvestingSetup.energyProfit) {
            bestHarvestingSetup.anzCarry = anzCarryParts;
            bestHarvestingSetup.anzHarvesters = anzHarvesters;
            bestHarvestingSetup.anzMove = anzMoveParts;
            bestHarvestingSetup.anzWork = anzWorkParts;
            bestHarvestingSetup.energyProfit = energyProfit;
          }
        }
      }
      if (maxEnergyReached) {
        break;
      }
    }
    return bestHarvestingSetup;
  }

  public static calculateSourceSeats(source: Source): XYPosition[] {
    const results = source.room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
    return (results as LookAtResultWithPos[]).filter((result) => {
      if (result.terrain !== "swamp" && result.terrain !== "plain") {
        return false;
      }
      if (result.x === source.pos.x && result.y === source.pos.y) {
        return false;
      }
      return true;
    }).map((result) => {
      return {
        x: result.x,
        y: result.y
      };
    });
  }

  private roomName: string;

  private constructor(roomName: string) {
    super(ResourceSourceOrSinkType.Source);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
  }

  public getAnzSource(): number {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return 0;
    }
    if (!_.isObject(Memory.rooms[this.roomName].sources)) {
      return 0;
    }
    return _.keys(Memory.rooms[this.roomName].sources).length;
  }

  public getAnzSourcesSeats(): number {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return 0;
    }
    if (!_.isObject(Memory.rooms[this.roomName].sources)) {
      return 0;
    }
    return _.sum(_.values(Memory.rooms[this.roomName].sources), (sourceMemory: SourceMemory) => sourceMemory.seats.length);
  }

  public getRoom(): SourceRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  public getSourceRoomPosIds(): RoomPosId[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    if (!_.isObject(Memory.rooms[this.roomName].sources)) {
      return [];
    }
    return _.keys(Memory.rooms[this.roomName].sources).map((sourceId) => {
      const sourceMemory = Memory.rooms[this.roomName].sources[sourceId];
      return {
        id: sourceId,
        pos: new RoomPosition(sourceMemory.pos.x, sourceMemory.pos.y, this.roomName)
      };
    });
  }

  public getSourcePos(sourceId: string): RoomPosition | null {
    const sourceMemory: SourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(sourceMemory)) {
      return null;
    }
    if (!_.isObject(sourceMemory.sources)) {
      return null;
    }
    if (!_.isObject(sourceMemory.sources[sourceId])) {
      return null;
    }
    if (!_.isObject(sourceMemory.sources[sourceId].pos)) {
      return null;
    }
    if (!_.isNumber(sourceMemory.sources[sourceId].pos.x)) {
      return null;
    }
    if (!_.isNumber(sourceMemory.sources[sourceId].pos.y)) {
      return null;
    }
    return new RoomPosition(sourceMemory.sources[sourceId].pos.x, sourceMemory.sources[sourceId].pos.y, this.roomName);
  }

  public getSources(): Source[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Source>(FIND_SOURCES);
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getSources();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(sourceRoomMemory.sources)) {
      return [];
    }
    if (!_.isObject(sourceRoomMemory.sources[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(sourceRoomMemory.sources[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(sourceRoomMemory.sources[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(sourceRoomMemory.sources)) {
      return;
    }
    if (!_.isObject(sourceRoomMemory.sources[screepsEnergySourceOrSink.id])) {
      return;
    }
    sourceRoomMemory.sources[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return 0;
    }
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(sourceRoomMemory.sources)) {
      return 0;
    }
    if (!_.isObject(sourceRoomMemory.sources[screepsEnergySourceOrSink.id])) {
      return 0;
    }
    if (!_.isArray(sourceRoomMemory.sources[screepsEnergySourceOrSink.id].seats)) {
      return 0;
    }
    return sourceRoomMemory.sources[screepsEnergySourceOrSink.id].seats.length;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const sourceRoomMemory: SourceRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(sourceRoomMemory.sources)) {
      return false;
    }
    if (!_.isObject(sourceRoomMemory.sources[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(sourceRoomMemory.sources[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(sourceRoomMemory.sources[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private initMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.sources)) {
      room.memory.sources = {};
    }
    this.getSources().forEach((source) => {
      if (!_.isObject(room.memory.sources[source.id])) {
        room.memory.sources[source.id] = {
          energyCapacity: source.energyCapacity,
          pos: {
            x: source.pos.x,
            y: source.pos.y
          },
          reservations: [],
          seats: SourceManager.calculateSourceSeats(source),
        };
      }
      if (!_.isArray(room.memory.sources[source.id].seats)) {
        room.memory.sources[source.id].seats = SourceManager.calculateSourceSeats(source);
      }
      if (!_.isObject(room.memory.sources[source.id].pos)) {
        room.memory.sources[source.id].pos = {
          x: source.pos.x,
          y: source.pos.y
        };
      }
      if (!_.isArray(room.memory.sources[source.id].reservations)) {
        room.memory.sources[source.id].reservations = [];
      }
      room.memory.sources[source.id].reservations = ResourceSourceOrSink.filterBrokenResourceReservations(room.memory.sources[source.id].reservations);
    });
  }

  private refeshMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const sourceId in room.memory.sources) {
      if (!room.memory.sources.hasOwnProperty(sourceId)) {
        continue;
      }
      const source = Game.getObjectById<Source>(sourceId);
      if (source === null) {
        continue;
      }
      room.memory.sources[sourceId].energyCapacity = source.energyCapacity;
      room.memory.sources[sourceId].reservations = this.updateMemoryReservations(source, room.memory.sources[sourceId].reservations);
    }
  }

}
