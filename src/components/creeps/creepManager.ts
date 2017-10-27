import * as Config from "../../config/config";

import {BuilderManager} from "./roles/builderManager";
import {HarvesterManager} from "./roles/harvesterManager";
import {LongRangeHarvesterManager} from "./roles/longRangeHarvesterManager";
import {UpgraderManager} from "./roles/upgraderManager";

import {ScoutManager} from "components/creeps/roles/scoutManager";
import {
  BUILDER_ROLE_NAME, CacheRead, CLAIMER_ROLE_NAME, CREEP_JOB_NONE, CreepMemory, CreepPlan, CreepRoles,
  DEFENDER_ROLE_NAME,
  HARVESTER_ROLE_NAME,
  LONG_RANGE_HARVESTER_ROLE_NAME, MINER_ROLE_NAME, ResourceSourceOrSinkType, SCOUT_ROLE_NAME,
  ScreepsResourceSourceOrSink,
  UPGRADER_ROLE_NAME
} from "../../config/types";
import {log} from "../../lib/logger/log";
import {
  ResourceSourceOrSink
} from "../resources/ResourceSourceOrSink";
import {ControllerManager} from "../structures/controllerManager";
import {SourceManager} from "../structures/sourceManager";
import {SpawnManager} from "../structures/spawnManager";
import {ClaimerManager} from "./roles/claimerManager";
import {DefenderManager} from "./roles/defenderManager";
import {MinerManager} from "./roles/minerManager";

interface CreepManagers {
  [roomName: string]: CreepManager;
}

const creepManagers: CreepManagers = {};

export class CreepManager {

  public static getManager(roomOrRoomName: Room | string): CreepManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof creepManagers[roomName] === "undefined") {
      creepManagers[roomName] = new CreepManager(roomName);
    }
    return creepManagers[roomName];
  }

  public static getCreepRole(creep: Creep | CreepPlan): CreepRoles {
    if (creep.memory.role === UPGRADER_ROLE_NAME) {
      return CreepRoles.Upgrader;
    } else if (creep.memory.role === BUILDER_ROLE_NAME) {
      return CreepRoles.Builder;
    } else if (creep.memory.role === HARVESTER_ROLE_NAME) {
      return CreepRoles.Harvester;
    } else if (creep.memory.role === DEFENDER_ROLE_NAME) {
      return CreepRoles.Defender;
    } else if (creep.memory.role === LONG_RANGE_HARVESTER_ROLE_NAME) {
      return CreepRoles.LongRangeHarvester;
    } else if (creep.memory.role === CLAIMER_ROLE_NAME) {
      return CreepRoles.Claimer;
    } else if (creep.memory.role === SCOUT_ROLE_NAME) {
      return CreepRoles.Scout;
    } else if (creep.memory.role === MINER_ROLE_NAME) {
      return CreepRoles.Miner;
    } else {
      return CreepRoles.None;
    }
  }

  public static getEnergyInCreep(creep: Creep): number {
    return CreepManager.getResourceInCreep(creep, RESOURCE_ENERGY);
  }

  public static getResourceInCreep(creep: Creep, resourceName: string): number {
    if (_.isUndefined(creep.carry[resourceName])) {
      return 0;
    }
    return creep.carry[resourceName] as number;
  }

  public static getUsedCarryAmount(creep: Creep): number {
    return _.sum(creep.carry);
  }

  public static getFreeCarryAmount(creep: Creep): number {
    return creep.carryCapacity - CreepManager.getUsedCarryAmount(creep);
  }

  public static isEmpty(creep: Creep, resourceName: string | null = null): boolean {
    if (resourceName === null) {
      return _.sum(creep.carry) < 1;
    }
    if (!_.isNumber(creep.carry[resourceName])) {
      return true;
    }
    return (creep.carry[resourceName] as number) < 1;
  }

  public static isFull(creep: Creep): boolean {
    return _.sum(creep.carry) === creep.carryCapacity;
  }

  public static getCreepRoom(creep: Creep): Room | null {
    if (_.isString(creep.memory.room)) {
      const room = Game.rooms[creep.memory.room];
      return (!_.isUndefined(room)) ? room : null;
    }
    return null;
  }

  public static holdsStructureReservation(creep: Creep, structure: Structure): boolean {
    switch (CreepManager.getCreepRole(creep)) {
      case CreepRoles.Builder:
        return BuilderManager.holdsStructureReservation(creep, structure);
      default:
        return false;
    }
  }

  public static moveToDrainResource(creep: Creep, screepsEnergySource: ScreepsResourceSourceOrSink | null, energySourceType: ResourceSourceOrSinkType, resourceType: string) {
    if (screepsEnergySource === null) {
      return;
    }
    const distance = creep.pos.getRangeTo(screepsEnergySource.pos);
    if (distance > 3) {
      if (energySourceType === ResourceSourceOrSinkType.Source) {
        const pos = SourceManager.getClosestSourceSeat(screepsEnergySource as Source, creep.pos);
        if (pos !== null) {
          CreepManager.moveToPos(creep, pos);
        }
      } else {
        CreepManager.moveToPos(creep, screepsEnergySource.pos);
      }
    } else if (distance === 3) {
      if (ResourceSourceOrSink.resourceSourceHasFreeSeats(screepsEnergySource)) {
        CreepManager.moveToPos(creep, screepsEnergySource.pos);
      }
    } else if (distance === 2) {
      CreepManager.moveToPos(creep, screepsEnergySource.pos);
    } else {
      switch (energySourceType) {
        case ResourceSourceOrSinkType.Container:
        case ResourceSourceOrSinkType.Extension:
        case ResourceSourceOrSinkType.Lab:
        case ResourceSourceOrSinkType.Spawn:
        case ResourceSourceOrSinkType.Storage:
        case ResourceSourceOrSinkType.Tower:
          creep.withdraw(screepsEnergySource as StructureContainer | StructureExtension | StructureLab | StructureSpawn | StructureStorage | StructureTower, resourceType);
          break;
        case ResourceSourceOrSinkType.DroppedResource:
          creep.pickup(screepsEnergySource as Resource);
          break;
        case ResourceSourceOrSinkType.Source:
        case ResourceSourceOrSinkType.Mineral:
          creep.harvest(screepsEnergySource as Source | Mineral);
          break;
      }
    }
  }

  public static moveToDropResource(creep: Creep, screepsEnergySink: ScreepsResourceSourceOrSink | null, energySinkType: ResourceSourceOrSinkType, resourceType: string) {
    if (screepsEnergySink === null) {
      return;
    }
    if (creep.pos.getRangeTo(screepsEnergySink.pos) > 1) {
      CreepManager.moveToPos(creep, screepsEnergySink.pos);
    } else {
      switch (energySinkType) {
        case ResourceSourceOrSinkType.Container:
        case ResourceSourceOrSinkType.Extension:
        case ResourceSourceOrSinkType.Spawn:
        case ResourceSourceOrSinkType.Storage:
        case ResourceSourceOrSinkType.Lab:
        case ResourceSourceOrSinkType.Tower:
          const status = creep.transfer((screepsEnergySink as StructureTower | StructureExtension | StructureSpawn | StructureStorage | StructureTower), resourceType);
          if (status !== OK) {
            console.log("Transfer failed " + status + " " + creep.id + " " + JSON.stringify(creep.pos));
          }
          break;
      }
    }
  }

  public static moveToRenew(creep: Creep, target: StructureSpawn | null): void {
    if (target === null) {
      return;
    }
    if (creep.pos.getRangeTo(target.pos) > 1) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      if (SpawnManager.reserveRenewReservation(creep, target)) {
        target.renewCreep(creep);
      }
    }
  }

  public static moveToUpgradeController(creep: Creep, target: Controller | null): void {
    if (target === null) {
      return;
    }
    const controllerSourceDistance = ControllerManager.getControllerSourceDistance(target);
    const minDistance = (controllerSourceDistance !== null && controllerSourceDistance <= 5) ? 2 : 3;
    if (creep.pos.getRangeTo(target.pos) > minDistance) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      creep.upgradeController(target);
    }
  }

  public static moveToRepair(creep: Creep, target: Structure | null): void {
    if (target === null) {
      return;
    }
    if (creep.pos.getRangeTo(target.pos) > 2) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      creep.repair(target);
    }
  }

  public static moveToConstruct(creep: Creep, target: ConstructionSite | null): void {
    if (target === null) {
      return;
    }
    if (creep.pos.getRangeTo(target.pos) > 2) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      creep.build(target);
    }
  }

  public static moveToClaim(creep: Creep, target: StructureController | null): void {
    if (target === null) {
      return;
    }
    if (creep.pos.getRangeTo(target.pos) > 1) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      creep.claimController(target);
    }
  }

  public static rangedAttack(creep: Creep, target: Creep | null): void {
    if (target === null) {
      return;
    }
    creep.rangedAttack(target);
  }

  public static moveToRangedAttack(creep: Creep, target: Creep | null): void {
    if (target === null) {
      return;
    }
    if (creep.pos.getRangeTo(target.pos) > Config.RANGED_ATTACK_DISTANCE) {
      CreepManager.moveToPos(creep, target.pos);
    } else {
      creep.rangedAttack(target);
    }
  }

  public static moveTo(creep: Creep, target: Structure | null): void {
    if (target === null) {
      return;
    }
    CreepManager.moveToPos(creep, target.pos);
  }

  public static moveToPos(creep: Creep, target: RoomPosition | null): void {
    if (target === null) {
      return;
    }
    creep.moveTo(target);
  }

  public static calculateBodyPlanCosts(body: string[]) {
    return _.sum(body, ((p: string) => {
      if (typeof BODYPART_COST[p] !== "number") {
        return 0;
      }
      return BODYPART_COST[p];
    }));
  }

  public static calculateBodyCosts(creep: Creep) {
    return _.sum(creep.body, ((p) => {
      if (typeof BODYPART_COST[p.type] !== "number") {
        return 0;
      }
      return BODYPART_COST[p.type];
    }));
  }

  public static anzTypeParts(creep: Creep, bodyPartType: string) {
    return _.sum(creep.body, ((p) => p.type === bodyPartType ? 1 : 0));
  }

  public static refreshMemory() {
    for (const name in Memory.creeps) {
      if (!Memory.creeps.hasOwnProperty(name)) {
        continue;
      }
      if (!Game.creeps[name]) {
        log.info("Clearing non-existing creep memory:", name);
        delete Memory.creeps[name];
      }
    }
  }

  public static cancelEnergySinkOrSource(creep: Creep | null): void {
    if (creep === null) {
      return;
    }
    creep.memory.job = CREEP_JOB_NONE;
  }

  public static getResourceSourceOrSinkReservation(creep: Creep, screepsEnergySourceOrSink: ScreepsResourceSourceOrSink, resourceSourceOrSinkType: ResourceSourceOrSinkType, resourceType: string): number {
    switch (CreepManager.getCreepRole(creep)) {
      case CreepRoles.Builder:
        return BuilderManager.getResourceSourceOrSinkReservation(creep, screepsEnergySourceOrSink, resourceSourceOrSinkType, resourceType);
      case CreepRoles.Harvester:
        return HarvesterManager.getResourceSourceOrSinkReservation(creep, screepsEnergySourceOrSink, resourceSourceOrSinkType, resourceType);
      case CreepRoles.Upgrader:
        return UpgraderManager.getEnergySourceOrSinkReservation(creep, screepsEnergySourceOrSink, resourceSourceOrSinkType, resourceType);
      case CreepRoles.LongRangeHarvester:
        return LongRangeHarvesterManager.getResourceSourceOrSinkReservation(creep, screepsEnergySourceOrSink, resourceSourceOrSinkType, resourceType);
      case CreepRoles.Miner:
        return MinerManager.getResourceSourceOrSinkReservation(creep, screepsEnergySourceOrSink, resourceSourceOrSinkType, resourceType);
      default:
        return 0;
    }
  }

  public static holdsRenewReservation(spawn: Spawn, creep: Creep): boolean {
    switch (CreepManager.getCreepRole(creep)) {
      case CreepRoles.Harvester:
        return HarvesterManager.holdsRenewReservation(spawn, creep);
      case CreepRoles.Upgrader:
        return UpgraderManager.holdsRenewReservation(spawn, creep);
      case CreepRoles.LongRangeHarvester:
        return LongRangeHarvesterManager.holdsRenewReservation(spawn, creep);
      case CreepRoles.Miner:
        return MinerManager.holdsRenewReservation(spawn, creep);
      default:
        return false;
    }
  }

  public static getAmountPerTick(creep: Creep) {
    return _.sum(creep.body, (bodyPart) => bodyPart.type === WORK ? 2 : 0);
  }

  public static getMineralReservation(_creep: Creep, _mineral: Mineral) {
    return 0;
  }

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };

  private constructor(roomName: string) {
    this.roomName = roomName;
  }

  public creepProduced(plan: CreepPlan): void {
    switch (CreepManager.getCreepRole(plan)) {
      case CreepRoles.Builder:
        BuilderManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Harvester:
        HarvesterManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Upgrader:
        UpgraderManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Defender:
        DefenderManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.LongRangeHarvester:
        LongRangeHarvesterManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Claimer:
        ClaimerManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Scout:
        ScoutManager.getManager(this.roomName).creepProduced();
        break;
      case CreepRoles.Miner:
        MinerManager.getManager(this.roomName).creepProduced();
        break;
    }
  }

  public run() {
    DefenderManager.getManager(this.roomName).run();
    UpgraderManager.getManager(this.roomName).run();
    BuilderManager.getManager(this.roomName).run();
    HarvesterManager.getManager(this.roomName).run();
    LongRangeHarvesterManager.getManager(this.roomName).run();
    ClaimerManager.getManager(this.roomName).run();
    ScoutManager.getManager(this.roomName).run();
    MinerManager.getManager(this.roomName).run();
  }

  public getCreeps(): Creep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = (_.values(Game.creeps) as Creep[]).filter((creep) => (creep.memory as CreepMemory).room === this.roomName);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public getEnemyCreep(): Creep[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Creep>(FIND_HOSTILE_CREEPS).sort((c1: Creep, c2: Creep) => c1.hits - c2.hits);
  }

  public getDamagedCreep(): Creep[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    return room.find<Creep>(FIND_MY_CREEPS, {
      filter: (c: Creep) => c.hits < c.hitsMax
    }).sort((c1: Creep, c2: Creep) => c1.hits - c2.hits);
  }

  public getNewCreepPlans(spawnRoom: Room, maxBuildEnergyInNearbySpawns: number): CreepPlan[] {
    const creepPlans: CreepPlan[] = [];
    {
      const plan = DefenderManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = HarvesterManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = BuilderManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = UpgraderManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = LongRangeHarvesterManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = ClaimerManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = ScoutManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    {
      const plan = MinerManager.getManager(this.roomName).needNewCreep(spawnRoom, maxBuildEnergyInNearbySpawns);
      if (plan !== null) {
        creepPlans.push(plan);
      }
    }
    return creepPlans;
  }

  private getRoom(): Room | null {
    if (typeof Game.rooms[this.roomName] === "undefined") {
      return null;
    }
    return Game.rooms[this.roomName];
  }

}
