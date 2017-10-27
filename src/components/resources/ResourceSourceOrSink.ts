import {
  ResourceReservation, ResourceReservationType, ResourceSourceOrSinkType, ResourceStorageState, ResourceStore,
  ScreepsResourceSourceOrSink,
  SearchResourceSourceOrSink
} from "../../config/types";
import {CreepManager} from "../creeps/creepManager";

export abstract class ResourceSourceOrSink {

  public static resourceSourceOrSinkIsFull(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): boolean {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Storage:
      case ResourceSourceOrSinkType.Container: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        return _.sum(structure.store) >= structure.storeCapacity;
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy >= structure.energyCapacity;
        }
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy >= structure.energyCapacity;
        } else {
          return structure.mineralAmount >= structure.mineralCapacity;
        }
      }
      default:
        return true;
    }
  }

  public static resourceSourceOrSinkIsEmpty(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): boolean {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Container:
      case ResourceSourceOrSinkType.Storage: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        if (_.isUndefined(structure.store[resourceType])) {
          return true;
        } else {
          return structure.store[resourceType] === 0;
        }
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy === 0;
        }
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy === 0;
        } else {
          return structure.mineralAmount === 0;
        }
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        if (resourceType === structure.mineralType) {
          return structure.mineralAmount === 0;
        } else {
          return true;
        }
      }
      case ResourceSourceOrSinkType.DroppedResource: {
        const structure = screepsResourceSourceOrSink as Resource;
        if (resourceType === structure.resourceType) {
          return structure.amount === 0;
        } else {
          return true;
        }
      }
      default:
        return true;
    }
  }

  public static resourceSourceOrSinkAmount(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Container:
      case ResourceSourceOrSinkType.Storage: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        if (_.isNumber(structure.store[resourceType])) {
          return structure.store[resourceType] as number;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energy;
        } else if (resourceType === structure.mineralType) {
          return structure.mineralAmount;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        if (resourceType === structure.mineralType) {
          return structure.mineralAmount;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.DroppedResource: {
        const structure = screepsResourceSourceOrSink as Resource;
        if (resourceType === structure.resourceType) {
          return structure.amount;
        }
        return 0;
      }
      default:
        return 0;
    }
  }

  public static resourceSourceOrSinkCapacity(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Container:
      case ResourceSourceOrSinkType.Storage: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        return structure.storeCapacity;
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energyCapacity;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energyCapacity;
        }
        return structure.mineralCapacity;
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        if (resourceType === structure.mineralType) {
          return structure.mineralAmount;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.DroppedResource: {
        const structure = screepsResourceSourceOrSink as Resource;
        if (resourceType === structure.resourceType) {
          return structure.amount;
        }
        return 0;
      }
      default:
        return 0;
    }
  }

  public static resourceSourceOrSinkFreeStorageLeft(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Container:
      case ResourceSourceOrSinkType.Storage: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        return structure.storeCapacity - _.sum(structure.store);
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energyCapacity - structure.energy;
        }
        return 0;
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        if (resourceType === RESOURCE_ENERGY) {
          return structure.energyCapacity - structure.energy;
        } else if (structure.mineralType === null) {
          return structure.mineralCapacity;
        } else if (structure.mineralType === resourceType) {
          return structure.mineralCapacity - structure.mineralAmount;
        }
        return 0;
      }
      default:
        return 0;
    }
  }

  public static resourceSourceOrSinkRegenAmount(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType): ResourceStore {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Source: {
        const structure = screepsResourceSourceOrSink as Source;
        const retObj: ResourceStore = {};
        retObj[RESOURCE_ENERGY] = structure.energyCapacity;
        return retObj;
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        const retObj: ResourceStore = {};
        retObj[structure.mineralType] = 10000;
        return retObj;
      }
      default:
        return {};
    }
  }

  public static resourceSourceOrSinkNextRegenTick(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType): ResourceStore {
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Source: {
        const structure = screepsResourceSourceOrSink as Source;
        const retObj: ResourceStore = {};
        retObj[RESOURCE_ENERGY] = Game.time + structure.ticksToRegeneration;
        return retObj;
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        const retObj: ResourceStore = {};
        retObj[structure.mineralType] = Game.time + structure.ticksToRegeneration;
        return retObj;
      }
      default:
        return {};
    }
  }

  public static resourceSourceHasFreeSeats(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink) {
    const pos = screepsResourceSourceOrSink.pos;
    if (typeof screepsResourceSourceOrSink.room === "undefined") {
      return true;
    }
    const results = screepsResourceSourceOrSink.room.lookAtArea(Math.max(pos.y - 1, 0), Math.max(pos.x - 1, 0), Math.min(pos.y + 1, 49), Math.min(pos.x + 1, 49)) as LookAtResultMatrix;
    for (const y in results) {
      for (const x in results[y]) {
        if (parseInt(y, 10) === pos.y && parseInt(x, 10) === pos.x) {
          continue;
        }
        const hasSmoothGround = _.any((results[y][x] as LookAtResult[]), (r) => r.type === "terrain" && (r.terrain === "swamp" || r.terrain === "plain"));
        const hasCreep = _.any((results[y][x] as LookAtResult[]), (r) => typeof r.creep !== "undefined");
        if (hasSmoothGround && !hasCreep) {
          return true;
        }
      }
    }
    return false;
  }

  public static filterBrokenResourceReservations(energyReservations: ResourceReservation[]): ResourceReservation[] {
    return energyReservations.filter((reservation) => {
      if (!_.isObject(reservation)) {
        return false;
      }
      if (!_.isNumber(reservation.arrivalTick)) {
        return false;
      }
      if (!_.isString(reservation.creepId)) {
        return false;
      }
      if (!_.isNumber(reservation.amount)) {
        return false;
      }
      if (!_.isString(reservation.resourceType)) {
        return false;
      }
      if (!_.isNumber(reservation.amountPerTick)) {
        return false;
      }
      if (!_.isNumber(reservation.type)) {
        return false;
      }
      return true;
    });
  }

  private static resourceSourceOrSinkSorageState(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType): ResourceStorageState | null {
    const store: ResourceStore = {};
    switch (resourceSourceOrSinkType) {
      case ResourceSourceOrSinkType.Container:
      case ResourceSourceOrSinkType.Storage: {
        const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
        _.keys(structure.store).forEach((resourceType) => {
          if (_.isNumber(structure.store[resourceType])) {
            store[resourceType] = structure.store[resourceType];
          }
        });
      }
      case ResourceSourceOrSinkType.Extension:
      case ResourceSourceOrSinkType.Source:
      case ResourceSourceOrSinkType.Spawn:
      case ResourceSourceOrSinkType.Tower: {
        const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Source | Tower;
        store[RESOURCE_ENERGY] = structure.energy;
      }
      case ResourceSourceOrSinkType.Lab: {
        const structure = screepsResourceSourceOrSink as StructureLab;
        store[RESOURCE_ENERGY] = structure.energy;
        if (_.isString(structure.mineralType)) {
          store[structure.mineralType] = structure.mineralAmount;
        }
      }
      case ResourceSourceOrSinkType.Mineral: {
        const structure = screepsResourceSourceOrSink as Mineral;
        store[structure.mineralType] = structure.mineralAmount;
      }
      case ResourceSourceOrSinkType.DroppedResource: {
        const structure = screepsResourceSourceOrSink as Resource;
        store[structure.resourceType] = structure.amount;
      }
    }

    let currentMineralType = (resourceSourceOrSinkType === ResourceSourceOrSinkType.Lab) ? (screepsResourceSourceOrSink as StructureLab).mineralType : null;

    const retObj = {
      addAmount: (resourceType: string, amount: number): void => {
        switch (resourceSourceOrSinkType) {
          case ResourceSourceOrSinkType.Container:
          case ResourceSourceOrSinkType.Storage: {
            if (!_.isNumber(store[resourceType])) {
              store[resourceType] = 0;
            }
            store[resourceType] += Math.min(retObj.freeStorageLeft(resourceType), amount);
            store[resourceType] = Math.round(store[resourceType]);
            return;
          }
          case ResourceSourceOrSinkType.Extension:
          case ResourceSourceOrSinkType.Spawn:
          case ResourceSourceOrSinkType.Tower: {
            if (resourceType === RESOURCE_ENERGY) {
              store[resourceType] += Math.min(retObj.freeStorageLeft(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
            }
            return;
          }
          case ResourceSourceOrSinkType.Lab: {
            if (resourceType === RESOURCE_ENERGY || currentMineralType === resourceType || currentMineralType === null) {
              if (_.isUndefined(store[resourceType])) {
                store[resourceType] = 0;
              }
              store[resourceType] += Math.min(retObj.freeStorageLeft(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
              if (currentMineralType === null && resourceType !== RESOURCE_ENERGY) {
                currentMineralType = resourceType;
              }
            }
            return;
          }
        }
      },
      freeStorageLeft: (resourceType: string): number => {
        switch (resourceSourceOrSinkType) {
          case ResourceSourceOrSinkType.Container:
          case ResourceSourceOrSinkType.Storage: {
            const structure = screepsResourceSourceOrSink as StructureContainer | StructureStorage;
            return structure.storeCapacity - _.sum(store);
          }
          case ResourceSourceOrSinkType.Extension:
          case ResourceSourceOrSinkType.Spawn:
          case ResourceSourceOrSinkType.Tower: {
            const structure = screepsResourceSourceOrSink as StructureExtension | StructureSpawn | Tower;
            if (resourceType === RESOURCE_ENERGY) {
              return structure.energyCapacity - store[RESOURCE_ENERGY];
            }
            return 0;
          }
          case ResourceSourceOrSinkType.Lab: {
            const structure = screepsResourceSourceOrSink as StructureLab;
            if (resourceType === RESOURCE_ENERGY) {
              return structure.energyCapacity - store[RESOURCE_ENERGY];
            } else if (currentMineralType === resourceType) {
              return structure.mineralCapacity - store[resourceType];
            }
            return 0;
          }
          default: {
            return 0;
          }
        }
      },
      getAmount: (resourceType: string): number => {
        switch (resourceSourceOrSinkType) {
          case ResourceSourceOrSinkType.Container:
          case ResourceSourceOrSinkType.Storage: {
            if (!_.isNumber(store[resourceType])) {
              return 0;
            }
            return store[resourceType];
          }
          case ResourceSourceOrSinkType.Extension:
          case ResourceSourceOrSinkType.Source:
          case ResourceSourceOrSinkType.Spawn:
          case ResourceSourceOrSinkType.Tower: {
            if (resourceType === RESOURCE_ENERGY) {
              return store[RESOURCE_ENERGY];
            }
            return 0;
          }
          case ResourceSourceOrSinkType.Lab: {
            if (_.isNumber(store[resourceType])) {
              return store[resourceType];
            }
            return 0;
          }
          case ResourceSourceOrSinkType.Mineral: {
            const structure = screepsResourceSourceOrSink as Mineral;
            if (resourceType === structure.mineralType) {
              return structure.mineralAmount;
            }
            return 0;
          }
          case ResourceSourceOrSinkType.DroppedResource: {
            const structure = screepsResourceSourceOrSink as Resource;
            if (resourceType === structure.resourceType) {
              return structure.amount;
            }
            return 0;
          }
          default: {
            return 0;
          }
        }
      },
      isEmpty: (resourceType: string): boolean => {
        return retObj.getAmount(resourceType) === 0;
      },
      isFull: (resourceType: string): boolean => {
        return retObj.freeStorageLeft(resourceType) === 0;
      },
      setAmount: (resourceType: string, amount: number): void => {
        store[resourceType] = amount;
      },
      withdrawAmount: (resourceType: string, amount: number): void => {
        switch (resourceSourceOrSinkType) {
          case ResourceSourceOrSinkType.Container:
          case ResourceSourceOrSinkType.Storage: {
            if (!_.isNumber(store[resourceType])) {
              store[resourceType] = 0;
            }
            store[resourceType] -= Math.min(retObj.getAmount(resourceType), amount);
            store[resourceType] = Math.round(store[resourceType]);
            break;
          }
          case ResourceSourceOrSinkType.Extension:
          case ResourceSourceOrSinkType.Source:
          case ResourceSourceOrSinkType.Spawn:
          case ResourceSourceOrSinkType.Tower: {
            if (resourceType === RESOURCE_ENERGY) {
              store[resourceType] -= Math.min(retObj.getAmount(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
            }
            break;
          }
          case ResourceSourceOrSinkType.Lab: {
            if (resourceType === RESOURCE_ENERGY || resourceType === currentMineralType) {
              if (!_.isNumber(store[resourceType])) {
                store[resourceType] = 0;
              }
              store[resourceType] -= Math.min(retObj.getAmount(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
              if (currentMineralType !== null && store[resourceType] === 0) {
                currentMineralType = null;
              }
            }
            break;
          }
          case ResourceSourceOrSinkType.Mineral: {
            const structure = screepsResourceSourceOrSink as Mineral;
            if (resourceType === structure.mineralType) {
              store[resourceType] -= Math.min(retObj.getAmount(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
            }
            break;
          }
          case ResourceSourceOrSinkType.DroppedResource: {
            const structure = screepsResourceSourceOrSink as Resource;
            if (structure.resourceType === resourceType) {
              store[resourceType] -= Math.min(retObj.getAmount(resourceType), amount);
              store[resourceType] = Math.round(store[resourceType]);
            }
          }
        }
      }
    };
    return retObj;
  }

  private resourceSourceOrSinkType: ResourceSourceOrSinkType;

  constructor(resourceSourceOrSinkType: ResourceSourceOrSinkType) {
    this.resourceSourceOrSinkType = resourceSourceOrSinkType;
  }

  public getResourceSourcesOrSinks(creep: Creep, resourceReservationType: ResourceReservationType, resourceType: string): SearchResourceSourceOrSink[] {
    if (this.resourceSourceOrSinkType === ResourceSourceOrSinkType.None) {
      return [];
    }
    return this.getScreepsResourceSourcesOrSinks().filter((s) => {
      if (_.size(ResourceSourceOrSink.resourceSourceOrSinkRegenAmount(s, this.resourceSourceOrSinkType)) > 0) {
        return true;
      }
      if (!this.hasResourceReservation(s, resourceType)) {
        switch (resourceReservationType) {
          case ResourceReservationType.Withdraw:
            if (ResourceSourceOrSink.resourceSourceOrSinkIsEmpty(s, this.resourceSourceOrSinkType, resourceType)) {
              return false;
            }
            break;
          case ResourceReservationType.Add:
            if (ResourceSourceOrSink.resourceSourceOrSinkIsFull(s, this.resourceSourceOrSinkType, resourceType)) {
              return false;
            }
            break;
        }
      }
      return true;
    }).map((s) => {
      const distance = s.pos.getRangeTo(creep.pos) === 1 ? 0 : PathFinder.search(creep.pos, s.pos, {swampCost: 1}).cost - 1;
      const amountFreeSeat = this.calcAmountFreeSeatResourceSourceOrSink(s, distance, resourceType);
      const ret: SearchResourceSourceOrSink = {
        calcAmount: amountFreeSeat.amount,
        capacity: ResourceSourceOrSink.resourceSourceOrSinkCapacity(s, this.resourceSourceOrSinkType, resourceType),
        currentAmount: ResourceSourceOrSink.resourceSourceOrSinkAmount(s, this.resourceSourceOrSinkType, resourceType),
        distance,
        freeSeat: amountFreeSeat.freeSeat,
        resourceSourceOrSink: s,
        type: this.resourceSourceOrSinkType
      };
      return ret;
    }).filter((e: any) => e.freeSeat);
  }

  public reserveResourceSourceOrSink(creep: Creep, searchResourceSourceOrSink: SearchResourceSourceOrSink, amount: number, amountPerTick: number, resourceReservationType: ResourceReservationType, resourceType: string): void {
    let reservations = this.getResourceReservations(searchResourceSourceOrSink.resourceSourceOrSink);
    reservations = reservations.filter((r) => r.creepId !== creep.id);
    const creepReservation: ResourceReservation = {
      amount,
      amountPerTick,
      arrivalTick: Game.time + searchResourceSourceOrSink.distance - 1,
      creepId: creep.id,
      resourceType,
      type: resourceReservationType
    };
    reservations.push(creepReservation);
    reservations = this.recalculateEnergyReservations(searchResourceSourceOrSink.resourceSourceOrSink, reservations);
    this.setResourceReservations(searchResourceSourceOrSink.resourceSourceOrSink, reservations);
  }

  protected updateMemoryReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceReservations: ResourceReservation[]) {
    return resourceReservations.filter((reservation) => {
      const creep = Game.getObjectById<Creep>(reservation.creepId);
      if (creep === null) {
        return false;
      }
      const amount = CreepManager.getResourceSourceOrSinkReservation(creep, screepsResourceSourceOrSink, this.resourceSourceOrSinkType, reservation.resourceType);
      if (amount === 0) {
        return false;
      }
      if (creep.pos.getRangeTo(screepsResourceSourceOrSink.pos) !== 1) {
        reservation.arrivalTick = Game.time + PathFinder.search(screepsResourceSourceOrSink.pos, creep.pos).cost - 1;
      }
      reservation.amount = amount;
      return true;
    });
  }

  protected abstract getScreepsResourceSourcesOrSinks(): ScreepsResourceSourceOrSink[];

  protected abstract getResourceReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink): ResourceReservation[];

  protected abstract setResourceReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceReservations: ResourceReservation[]): void;

  protected abstract getAnzResourceSourceOrSinkSeats(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink): number;

  protected abstract hasResourceReservation(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceType: string): boolean;

  private calcAmountFreeSeatResourceSourceOrSink(screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, ticksInFuture: number, resourceType: string): {
    freeSeat: boolean,
    amount: number
  } {
    if (ticksInFuture < 0) {
      return {
        amount: 0,
        freeSeat: false
      };
    }
    let reservations = this.getResourceReservations(screepsEnergySourceOrSink);
    const nextRegenTick = ResourceSourceOrSink.resourceSourceOrSinkNextRegenTick(screepsEnergySourceOrSink, this.resourceSourceOrSinkType);
    if (reservations.length === 0 && _.isUndefined(nextRegenTick[resourceType])) {
      return {
        amount: ResourceSourceOrSink.resourceSourceOrSinkAmount(screepsEnergySourceOrSink, this.resourceSourceOrSinkType, resourceType),
        freeSeat: true
      };
    }
    const maxSeats = this.getAnzResourceSourceOrSinkSeats(screepsEnergySourceOrSink);
    const endTick = Game.time + ticksInFuture;
    const nextRegenAmount = ResourceSourceOrSink.resourceSourceOrSinkRegenAmount(screepsEnergySourceOrSink, this.resourceSourceOrSinkType);
    const storageState = ResourceSourceOrSink.resourceSourceOrSinkSorageState(screepsEnergySourceOrSink, this.resourceSourceOrSinkType);
    if (storageState === null) {
      return {
        amount: 0,
        freeSeat: false
      };
    }
    for (let currentTick = Game.time; currentTick <= endTick; currentTick++) {
      {
        _.keys(nextRegenTick).filter((regenResourceType) => {
          return _.isNumber(nextRegenTick[regenResourceType]) && _.isNumber(nextRegenAmount[regenResourceType]) && nextRegenTick[regenResourceType] === currentTick;
        }).forEach((regenResourceType) => {
          storageState.setAmount(regenResourceType, nextRegenAmount[regenResourceType]);
        });
      }
      reservations.forEach((reservation) => {
        if (currentTick > reservation.arrivalTick) {
          if (reservation.type === ResourceReservationType.Withdraw) {
            storageState.withdrawAmount(reservation.resourceType, reservation.amountPerTick);
            reservation.amount -= reservation.amountPerTick;
          } else {
            storageState.addAmount(reservation.resourceType, reservation.amountPerTick);
            reservation.amount -= reservation.amountPerTick;
          }
        }
      });
      reservations = reservations.filter((reservation) => {
        if (currentTick <= reservation.arrivalTick) {
          return true;
        }
        if (reservation.amount <= 0) {
          return false;
        }
        if (reservation.type === ResourceReservationType.Withdraw && storageState.isEmpty(reservation.resourceType) ||
          reservation.type === ResourceReservationType.Add && storageState.isFull(reservation.resourceType)) {
          return false;
        }
        return true;
      });
    }
    const usedSeat = reservations.filter((reservation) => reservation.arrivalTick < endTick).length;
    return {
      amount: storageState.getAmount(resourceType),
      freeSeat: maxSeats > usedSeat
    };
  }

  private recalculateEnergyReservations(screepsResourceSourceOrSink: ScreepsResourceSourceOrSink, resourceReservations: ResourceReservation[]): ResourceReservation[] {
    let simulatedEnergyReservations = _.cloneDeep(resourceReservations);
    const nextRegenTick = ResourceSourceOrSink.resourceSourceOrSinkNextRegenTick(screepsResourceSourceOrSink, this.resourceSourceOrSinkType);
    const maxSeats = this.getAnzResourceSourceOrSinkSeats(screepsResourceSourceOrSink);
    const nextRegenAmount = ResourceSourceOrSink.resourceSourceOrSinkRegenAmount(screepsResourceSourceOrSink, this.resourceSourceOrSinkType);
    const storageState = ResourceSourceOrSink.resourceSourceOrSinkSorageState(screepsResourceSourceOrSink, this.resourceSourceOrSinkType);
    if (storageState === null) {
      return resourceReservations;
    }
    for (let currentTick = Game.time; simulatedEnergyReservations.length !== 0; currentTick++) {
      {
        _.keys(nextRegenTick).filter((regenResourceType) => {
          return _.isNumber(nextRegenTick[regenResourceType]) && _.isNumber(nextRegenAmount[regenResourceType]) && nextRegenTick[regenResourceType] === currentTick;
        }).forEach((regenResourceType) => {
          storageState.setAmount(regenResourceType, nextRegenAmount[regenResourceType]);
        });
      }
      const currentOccupiedSeats = simulatedEnergyReservations.filter((reservation) => currentTick > reservation.arrivalTick).length;
      simulatedEnergyReservations = simulatedEnergyReservations.filter((reservation) => {
        if (reservation.arrivalTick + 1 === currentTick) {
          if (storageState.isEmpty(reservation.resourceType) && reservation.type === ResourceReservationType.Withdraw || storageState.isFull(reservation.resourceType) && ResourceReservationType.Add) {
            const creep = Game.getObjectById<Creep>(reservation.creepId);
            CreepManager.cancelEnergySinkOrSource(creep);
            resourceReservations = resourceReservations.filter((r) => r.creepId === reservation.creepId);
            return false;
          }
        } else if (reservation.arrivalTick === currentTick) {
          if (currentOccupiedSeats === maxSeats) {
            const creep = Game.getObjectById<Creep>(reservation.creepId);
            CreepManager.cancelEnergySinkOrSource(creep);
            resourceReservations = resourceReservations.filter((r) => r.creepId === reservation.creepId);
            return false;
          }
        }
        return false;
      });
      simulatedEnergyReservations.forEach((reservation) => {
        if (currentTick > reservation.arrivalTick) {
          if (reservation.type === ResourceReservationType.Withdraw) {
            storageState.withdrawAmount(reservation.resourceType, reservation.amountPerTick);
            reservation.amount -= reservation.amountPerTick;
          } else {
            storageState.addAmount(reservation.resourceType, reservation.amountPerTick);
            reservation.amount -= reservation.amountPerTick;
          }
        }
      });
      simulatedEnergyReservations = simulatedEnergyReservations.filter((reservation) => {
        if (currentTick <= reservation.arrivalTick) {
          return true;
        }
        if (reservation.amount <= 0) {
          return false;
        }
        if (reservation.type === ResourceReservationType.Withdraw && storageState.isEmpty(reservation.resourceType) ||
          reservation.type === ResourceReservationType.Add && storageState.isFull(reservation.resourceType)) {
          return false;
        }
        return true;
      });
    }
    return resourceReservations;
  }

}
