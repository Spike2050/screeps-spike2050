// import {log} from "../../lib/logger/log";
import {CreepManager} from "components/creeps/creepManager";
import {RoomManager} from "components/roomManager";
import {
  ResourceReservation, ResourceSourceOrSinkType, RoomPosId, ScreepsResourceSourceOrSink,
  XYPosition
} from "../../config/types";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";
import {ConstructionManager} from "./constructionManager";
import {ControllerManager} from "./controllerManager";

interface MineralManagers {
  [roomName: string]: MineralManager;
}

const mineralManagers: MineralManagers = {};

type MineralStatusNotControlled = "not controlled";
const MINERAL_STATUS_NOT_CONTROLLED = "not controlled";
type MineralStatusLevelNotReached = "level not reached";
const MINERAL_STATUS_LEVEL_NOT_REACHED = "level not reached";
type MineralStatusLevelNoExtractor = "no extractor";
const MINERAL_STATUS_NO_EXTRACTOR = "no extractor";
type MineralStatusTypeBuildingExtractor = "building extractor";
const MINERAL_STATUS_TYPE_BUILDING_EXTRACTOR = "building extractor";
type MineralStatusTypeExtractor = "extractor";
const MINERAL_STATUS_TYPE_EXTRACTOR = "extractor";

interface MineralStatusBuildingExtractor {
  type: MineralStatusTypeBuildingExtractor;
  constructionSiteId: string;
}

interface MineralStatusExtractor {
  type: MineralStatusTypeExtractor;
  extractorId: string;
}

export interface MiningSetup {
  anzCarry: number;
  anzWork: number;
  anzMove: number;
  mineralsPerLifetime: number;
}

interface MemoryMiningSetup extends MiningSetup {
  lastRequested: number;
}

interface MiningMemory {
  reservations: ResourceReservation[];
  seats: XYPosition[];
  pos: XYPosition;
  status: MineralStatusNotControlled | MineralStatusLevelNotReached | MineralStatusLevelNoExtractor | MineralStatusBuildingExtractor | MineralStatusExtractor;
}

interface MineralRoomMemory {
  mineral: {
    [index: string]: MiningMemory
  };
}

interface MineralRoom extends Room {
  memory: MineralRoomMemory;
}

interface HarvestingMemory extends Memory {
  miningSetups: {
    [buildEnergy: number]: {
      [distance: number]: MemoryMiningSetup;
    }
  };
}

export class MineralManager extends ResourceSourceOrSink {

  public static getManager(roomOrRoomName: Room | string): MineralManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof mineralManagers[roomName] === "undefined") {
      mineralManagers[roomName] = new MineralManager(roomName);
    }
    return mineralManagers[roomName];
  }

  public static getMiningSetup(buildEnergy: number, distance: number): MiningSetup {
    const harvestingMemory: HarvestingMemory = Memory as HarvestingMemory;
    if (!_.isObject(harvestingMemory.miningSetups)) {
      harvestingMemory.miningSetups = {};
    }
    if (!_.isObject(harvestingMemory.miningSetups[buildEnergy])) {
      harvestingMemory.miningSetups[buildEnergy] = {};
    }
    if (!_.isObject(harvestingMemory.miningSetups[buildEnergy][distance])) {
      const harvestingSetup = MineralManager.calculateMiningSetup(buildEnergy, distance);
      const memoryMiningSetup: MemoryMiningSetup = harvestingSetup as MemoryMiningSetup;
      harvestingMemory.miningSetups[buildEnergy][distance] = memoryMiningSetup;
    }
    harvestingMemory.miningSetups[buildEnergy][distance].lastRequested = Game.time;
    return harvestingMemory.miningSetups[buildEnergy][distance];
  }

  public static getAnzMineralSeats(mineral: Mineral): number {
    if (_.isUndefined(mineral.room)) {
      return 0;
    }
    return MineralManager.getAnzMineralRoomSeats((mineral.room as Room).name, mineral.id);
  }

  public static getAnzMineralRoomSeats(roomName: string, mineralId: string): number {
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(mineralRoomMemory)) {
      return 0;
    }
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return 0;
    }
    if (!_.isObject(mineralRoomMemory.mineral[mineralId])) {
      return 0;
    }
    if (!_.isArray(mineralRoomMemory.mineral[mineralId].seats)) {
      return 0;
    }
    return mineralRoomMemory.mineral[mineralId].seats.length;
  }

  public static getClosestMineralSeat(mineral: Mineral, startPos: RoomPosition): RoomPosition | null {
    const mineralSeats = MineralManager.getMineralSeats(mineral).map((seat) => {
      const pos = new RoomPosition(seat.x, seat.y, (mineral.room as Room).name);
      return {
        distance: pos.getRangeTo(startPos),
        pos: new RoomPosition(seat.x, seat.y, (mineral.room as Room).name)
      };
    });
    if (mineralSeats.length === 0) {
      return null;
    }
    return (_.min(mineralSeats, (seat) => seat.distance)).pos;
  }

  public static getMineralSeats(mineral: Mineral): XYPosition[] {
    if (_.isUndefined(mineral.room)) {
      return [];
    }
    return MineralManager.getMineralRoomSeats((mineral.room as Room).name, mineral.id);
  }

  public static getMineralRoomSeats(roomName: string, mineralId: string): XYPosition[] {
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[roomName];
    if (!_.isObject(mineralRoomMemory)) {
      return [];
    }
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return [];
    }
    if (!_.isObject(mineralRoomMemory.mineral[mineralId])) {
      return [];
    }
    if (!_.isArray(mineralRoomMemory.mineral[mineralId].seats)) {
      return [];
    }
    return mineralRoomMemory.mineral[mineralId].seats;
  }

  private static calculateMiningSetup(buildEnergy: number, distance: number): MiningSetup {
    const bestMiningSetup: MiningSetup = {
      anzCarry: 0,
      anzMove: 0,
      anzWork: 0,
      mineralsPerLifetime: 0
    };
    const notWorkTime = 2 + 2 * distance;
    for (let anzWorkParts = 1; anzWorkParts <= Math.floor(buildEnergy / BODYPART_COST[WORK]); anzWorkParts++) {
      const workCost = anzWorkParts * BODYPART_COST[WORK];
      let anzCarryParts = 0;
      let carryCost = 0;
      let anzMoveParts = 0;
      let moveCost = 0;
      let creepCost = workCost;
      let anzBodyParts = anzWorkParts;
      for (let tmpCarryParts = 0; tmpCarryParts <= Math.floor(buildEnergy / BODYPART_COST[CARRY]); tmpCarryParts++) {
        const tmpcarryCost = tmpCarryParts * BODYPART_COST[CARRY];
        const tmpAnzMoveParts = Math.ceil((anzWorkParts + tmpCarryParts) / 2);
        const tmpMoveCost = tmpAnzMoveParts * BODYPART_COST[MOVE];
        const tmpCreepCost = workCost + tmpcarryCost + tmpMoveCost;
        const tmpAnzBodyParts = anzWorkParts + tmpCarryParts + tmpAnzMoveParts;
        if (tmpCreepCost <= buildEnergy && tmpAnzBodyParts <= MAX_CREEP_SIZE) {
          anzCarryParts = tmpCarryParts;
          carryCost = tmpcarryCost;
          anzMoveParts = tmpAnzMoveParts;
          moveCost = tmpMoveCost;
          creepCost = tmpCreepCost;
          anzBodyParts = tmpAnzBodyParts;
        } else {
          break;
        }
      }
      if (anzCarryParts === 0 || anzMoveParts === 0) {
        break;
      }
      const maintainTimePerCreepLifeTime = anzBodyParts * 3;
      const harvestPerTick = anzWorkParts * 1;
      const harvestTicks = Math.ceil(anzCarryParts * CARRY_CAPACITY / harvestPerTick);
      const worktime = (harvestTicks <= 1) ? 1 : (harvestTicks - 1) * 6 + 1;
      const roundTripTime = notWorkTime + worktime;
      const tripsPerLifeTime = (CREEP_LIFE_TIME - maintainTimePerCreepLifeTime) / roundTripTime;
      const carryPerTrip = anzCarryParts * CARRY_CAPACITY;
      const carryPerLifeTime = carryPerTrip * tripsPerLifeTime;
      if (carryPerLifeTime > bestMiningSetup.mineralsPerLifetime) {
        bestMiningSetup.anzCarry = anzCarryParts;
        bestMiningSetup.anzMove = anzMoveParts;
        bestMiningSetup.anzWork = anzWorkParts;
        bestMiningSetup.mineralsPerLifetime = Math.round(carryPerLifeTime);
      }
    }
    return bestMiningSetup;
  }

  private static calculateMineralSeats(mineral: Mineral): XYPosition[] {
    if (_.isUndefined(mineral.room)) {
      return [];
    }
    const results = (mineral.room as Room).lookForAtArea(LOOK_TERRAIN, mineral.pos.y - 1, mineral.pos.x - 1, mineral.pos.y + 1, mineral.pos.x + 1, true);
    return (results as LookAtResultWithPos[]).filter((result) => {
      if (result.terrain !== "swamp" && result.terrain !== "plain") {
        return false;
      }
      if (result.x === mineral.pos.x && result.y === mineral.pos.y) {
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
    super(ResourceSourceOrSinkType.Mineral);
    this.roomName = roomName;
    this.initMemory();
  }

  public run() {
    this.refeshMemory();
    this.buildMissingExtractors();
  }

  public getAnzMineral(): number {
    const roomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(roomMemory)) {
      return 0;
    }
    if (!_.isObject(roomMemory.mineral)) {
      return 0;
    }
    return _.keys(roomMemory.mineral).length;
  }

  public getAnzMineralsSeats(): number {
    const roomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(roomMemory)) {
      return 0;
    }
    if (!_.isObject(roomMemory.mineral)) {
      return 0;
    }
    return _.sum(_.values(roomMemory.mineral), (mineralMemory: MiningMemory) => mineralMemory.seats.length);
  }

  public getRoom(): MineralRoom | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

  public getMineralRoomPosIds(): RoomPosId[] {
    const roomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(roomMemory)) {
      return [];
    }
    if (!_.isObject(roomMemory.mineral)) {
      return [];
    }
    return _.keys(roomMemory.mineral).map((mineralId) => {
      const mineralMemory = roomMemory.mineral[mineralId];
      return {
        id: mineralId,
        pos: new RoomPosition(mineralMemory.pos.x, mineralMemory.pos.y, this.roomName)
      };
    });
  }

  public getMineralPos(mineralId: string): RoomPosition | null {
    const mineralMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(mineralMemory)) {
      return null;
    }
    if (!_.isObject(mineralMemory.mineral)) {
      return null;
    }
    if (!_.isObject(mineralMemory.mineral[mineralId].pos)) {
      return null;
    }
    if (!_.isNumber(mineralMemory.mineral[mineralId].pos.x)) {
      return null;
    }
    if (!_.isNumber(mineralMemory.mineral[mineralId].pos.y)) {
      return null;
    }
    return new RoomPosition(mineralMemory.mineral[mineralId].pos.x, mineralMemory.mineral[mineralId].pos.y, this.roomName);
  }

  public getMinerals(): Mineral[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Mineral>(FIND_MINERALS);
  }

  protected getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[] {
    return this.getMinerals();
  }

  protected getResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[] {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return [];
    }
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return [];
    }
    if (!_.isObject(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id])) {
      return [];
    }
    if (!_.isArray(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].reservations)) {
      return [];
    }
    return _.cloneDeep(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].reservations);
  }

  protected setResourceReservations(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, energyReservations: ResourceReservation[]): void {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return;
    }
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return;
    }
    if (!_.isObject(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id])) {
      return;
    }
    mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].reservations = energyReservations;
  }

  protected getAnzResourceSourceOrSinkSeats(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink): number {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return 0;
    }
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return 0;
    }
    if (!_.isObject(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id])) {
      return 0;
    }
    if (!_.isArray(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].seats)) {
      return 0;
    }
    return mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].seats.length;
  }

  protected hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean {
    if (!_.isObject(Memory.rooms[this.roomName])) {
      return false;
    }
    const mineralRoomMemory: MineralRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(mineralRoomMemory.mineral)) {
      return false;
    }
    if (!_.isObject(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id])) {
      return false;
    }
    if (!_.isArray(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].reservations)) {
      return false;
    }
    return _.some(mineralRoomMemory.mineral[screepsEnergySourceOrSink.id].reservations, (reservation) => reservation.resourceType === resourceType);
  }

  private buildMissingExtractors(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const mineralId in room.memory.mineral) {
      if (!room.memory.mineral.hasOwnProperty(mineralId)) {
        continue;
      }
      const mineral = Game.getObjectById<Mineral>(mineralId);
      if (mineral === null) {
        continue;
      }
      const mineralMemory = room.memory.mineral[mineralId];
      if (mineralMemory.status === MINERAL_STATUS_NO_EXTRACTOR) {
        room.createConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);
      }
    }
  }

  private initMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    if (!_.isObject(room.memory.mineral)) {
      room.memory.mineral = {};
    }
    this.getMinerals().forEach((mineral) => {
      if (!_.isObject(room.memory.mineral[mineral.id])) {
        room.memory.mineral[mineral.id] = {
          pos: {
            x: mineral.pos.x,
            y: mineral.pos.y
          },
          reservations: [],
          seats: MineralManager.calculateMineralSeats(mineral),
          status: MINERAL_STATUS_NOT_CONTROLLED
        };
      }
      if (!_.isArray(room.memory.mineral[mineral.id].seats)) {
        room.memory.mineral[mineral.id].seats = MineralManager.calculateMineralSeats(mineral);
      }
      if (!_.isObject(room.memory.mineral[mineral.id].pos)) {
        room.memory.mineral[mineral.id].pos = {
          x: mineral.pos.x,
          y: mineral.pos.y
        };
      }
      if (!_.isArray(room.memory.mineral[mineral.id].reservations)) {
        room.memory.mineral[mineral.id].reservations = [];
      }
      if (_.isString(room.memory.mineral[mineral.id].status) && room.memory.mineral[mineral.id].status !== MINERAL_STATUS_NO_EXTRACTOR &&
        room.memory.mineral[mineral.id].status !== MINERAL_STATUS_LEVEL_NOT_REACHED && room.memory.mineral[mineral.id].status !== MINERAL_STATUS_NOT_CONTROLLED) {
        room.memory.mineral[mineral.id].status = MINERAL_STATUS_NOT_CONTROLLED;
      }
      if (_.isObject(room.memory.mineral[mineral.id].status)) {
        if ((room.memory.mineral[mineral.id].status as MineralStatusBuildingExtractor).type !== MINERAL_STATUS_TYPE_BUILDING_EXTRACTOR || (room.memory.mineral[mineral.id].status as MineralStatusExtractor).type !== MINERAL_STATUS_TYPE_EXTRACTOR) {
          room.memory.mineral[mineral.id].status = MINERAL_STATUS_NOT_CONTROLLED;
        } else if ((room.memory.mineral[mineral.id].status as MineralStatusBuildingExtractor).type === MINERAL_STATUS_TYPE_BUILDING_EXTRACTOR && !_.isString((room.memory.mineral[mineral.id].status as MineralStatusBuildingExtractor).constructionSiteId)) {
          room.memory.mineral[mineral.id].status = MINERAL_STATUS_NOT_CONTROLLED;
        } else if ((room.memory.mineral[mineral.id].status as MineralStatusExtractor).type === MINERAL_STATUS_TYPE_EXTRACTOR && !_.isString((room.memory.mineral[mineral.id].status as MineralStatusExtractor).extractorId)) {
          room.memory.mineral[mineral.id].status = MINERAL_STATUS_NOT_CONTROLLED;
        }
      }
      room.memory.mineral[mineral.id].reservations = room.memory.mineral[mineral.id].reservations.filter((reservation) => {
        if (!_.isString(reservation.creepId)) {
          return false;
        }
        if (!_.isNumber(reservation.amount)) {
          return false;
        }
        if (!_.isNumber(reservation.arrivalTick)) {
          return false;
        }
        if (!_.isNumber(reservation.amountPerTick)) {
          return false;
        }
        return true;
      });
    });
  }

  private refeshMemory() {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    for (const mineralId in room.memory.mineral) {
      if (!room.memory.mineral.hasOwnProperty(mineralId)) {
        continue;
      }
      const mineral = Game.getObjectById<Mineral>(mineralId);
      if (mineral === null) {
        delete room.memory.mineral[mineralId];
        continue;
      }
      {
        let statusValid = true;
        if (room.memory.mineral[mineralId].status === MINERAL_STATUS_NOT_CONTROLLED) {
          if (ControllerManager.getManager(room).controlled()) {
            statusValid = false;
          }
        }
        if (room.memory.mineral[mineralId].status === MINERAL_STATUS_LEVEL_NOT_REACHED) {
          if (!ControllerManager.getManager(room).controlled()) {
            statusValid = false;
          } else if (RoomManager.getMaxBuildings(STRUCTURE_EXTRACTOR, ControllerManager.getManager(room).getControllerLevel()) >= 1) {
            statusValid = false;
          }
        }
        if (room.memory.mineral[mineralId].status === MINERAL_STATUS_NO_EXTRACTOR) {
          if (!ControllerManager.getManager(room).controlled()) {
            statusValid = false;
          } else if (RoomManager.getMaxBuildings(STRUCTURE_EXTRACTOR, ControllerManager.getManager(room).getControllerLevel()) === 0) {
            statusValid = false;
          } else {
            const constructionSites = ConstructionManager.getManager(room).getConstructionSites(mineral.pos, STRUCTURE_EXTRACTOR);
            if (constructionSites.length > 0) {
              statusValid = false;
            } else {
              const extractors = RoomManager.getManager(room).getStructuresAt(mineral.pos, STRUCTURE_EXTRACTOR);
              if (extractors.length > 0) {
                statusValid = false;
              }
            }
          }
        }
        if (_.isObject(room.memory.mineral[mineralId].status) && (room.memory.mineral[mineralId].status as MineralStatusBuildingExtractor).type === MINERAL_STATUS_TYPE_BUILDING_EXTRACTOR) {
          if (!ControllerManager.getManager(room).controlled()) {
            statusValid = false;
          } else if (RoomManager.getMaxBuildings(STRUCTURE_EXTRACTOR, ControllerManager.getManager(room).getControllerLevel()) === 0) {
            statusValid = false;
          } else {
            const constructionSite = Game.getObjectById((room.memory.mineral[mineralId].status as MineralStatusBuildingExtractor).constructionSiteId);
            if (constructionSite === null) {
              statusValid = false;
            }
          }
        }
        if (_.isObject(room.memory.mineral[mineralId].status) && (room.memory.mineral[mineralId].status as MineralStatusExtractor).type === MINERAL_STATUS_TYPE_EXTRACTOR) {
          if (!ControllerManager.getManager(room).controlled()) {
            statusValid = false;
          } else if (RoomManager.getMaxBuildings(STRUCTURE_EXTRACTOR, ControllerManager.getManager(room).getControllerLevel()) === 0) {
            statusValid = false;
          } else {
            const extractor = Game.getObjectById((room.memory.mineral[mineralId].status as MineralStatusExtractor).extractorId);
            if (extractor === null) {
              statusValid = false;
            }
          }
        }
        if (!statusValid) {
          if (!ControllerManager.getManager(room).controlled()) {
            room.memory.mineral[mineralId].status = MINERAL_STATUS_NOT_CONTROLLED;
          } else if (RoomManager.getMaxBuildings(STRUCTURE_EXTRACTOR, ControllerManager.getManager(room).getControllerLevel()) === 0) {
            room.memory.mineral[mineralId].status = MINERAL_STATUS_LEVEL_NOT_REACHED;
          } else {
            const constructionSites = ConstructionManager.getManager(room).getConstructionSites(mineral.pos, STRUCTURE_EXTRACTOR);
            if (constructionSites.length > 0) {
              room.memory.mineral[mineralId].status = {
                constructionSiteId: constructionSites[0].id,
                type: MINERAL_STATUS_TYPE_BUILDING_EXTRACTOR
              };
            } else {
              const extractors = RoomManager.getManager(room).getStructuresAt(mineral.pos, STRUCTURE_EXTRACTOR);
              if (extractors.length > 0) {
                room.memory.mineral[mineralId].status = {
                  extractorId: extractors[0].id,
                  type: MINERAL_STATUS_TYPE_EXTRACTOR
                };
              } else {
                room.memory.mineral[mineralId].status = MINERAL_STATUS_NO_EXTRACTOR;
              }
            }
          }
        }
      }
      room.memory.mineral[mineralId].reservations = room.memory.mineral[mineralId].reservations.filter((reservation) => {
        const creep = Game.getObjectById<Creep>(reservation.creepId);
        if (creep === null) {
          return false;
        }
        const amount = CreepManager.getMineralReservation(creep, mineral);
        if (amount === 0) {
          return false;
        }
        if (creep.pos.getRangeTo(mineral.pos) !== 1) {
          reservation.arrivalTick = Game.time + PathFinder.search(mineral.pos, creep.pos).cost - 1;
        }
        reservation.amount = amount;
        return true;
      });
    }
  }

}
