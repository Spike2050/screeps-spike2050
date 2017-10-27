export enum ResourceSourceOrSinkType {
  Container,
  DroppedResource,
  Extension,
  Storage,
  Spawn,
  Source,
  Tower,
  Lab,
  Mineral,
  None
}

export type ScreepsResourceSourceOrSink =
  Mineral
  | Resource
  | Source
  | StructureContainer
  | StructureExtension
  | StructureLab
  | StructureStorage
  | StructureSpawn
  | StructureTower;

export interface SearchResourceSourceOrSink {
  calcAmount: number;
  currentAmount: number;
  distance: number;
  capacity: number;
  resourceSourceOrSink: ScreepsResourceSourceOrSink;
  freeSeat: boolean;
  type: ResourceSourceOrSinkType;
}

export type GetAndReserveResourceSourceOrSinkOptionsFilter = (searchResourceSourceOrSink: SearchResourceSourceOrSink) => boolean;

export interface GetAndReserveResourceSourceOrSinkOptions {
  accomodateAmount?: boolean;
  sourceOrMineralAmountPerTick?: number;
  includeEmptyOrFull?: boolean;
  noReservation?: boolean;
  filter?: GetAndReserveResourceSourceOrSinkOptionsFilter;
}

export type ResourceSourceOrSinkGetAndReserveType = (creep: Creep, resourceType: string, amount: number, filterAndOrder: ResourceSourceOrSinkType[], resourceReservationType: ResourceReservationType,
                                                     opts: GetAndReserveResourceSourceOrSinkOptions) => SearchResourceSourceOrSink | null;

export interface ResourceSourceOrSinkProvider {
  getAndReserveResourceSourceOrSink: ResourceSourceOrSinkGetAndReserveType;
}

export enum ResourceReservationType {
  Add,
  Withdraw
}

export interface ResourceReservation {
  creepId: string;
  amount: number;
  resourceType: string;
  arrivalTick: number;
  amountPerTick: number;
  type: ResourceReservationType;
}

export interface ResourceStore {
  [resourceType: string]: number;
}

export interface ResourceStorageState {
  addAmount: ((resourceType: string, amount: number) => void);
  freeStorageLeft: ((resourceType: string) => number);
  getAmount: ((resourceType: string) => number);
  isFull: ((resourceType: string) => boolean);
  isEmpty: ((resourceType: string) => boolean);
  setAmount: ((resourceType: string, amount: number) => void);
  withdrawAmount: ((resourceType: string, amount: number) => void);
}

export interface XYPosition {
  x: number;
  y: number;
}

export interface RoomPosId {
  pos: RoomPosition;
  id: string;
}

export interface CacheRead<T> {
  readTime: number;
  cache: T;
}

export interface StructureMaxRepair {
  structure: Structure;
  maxHp?: number;
}

export enum CreepPlanImportance {
  Critical,
  Important,
  Normal,
  Low,
  Insignificant
}

export interface CreepPlan {
  memory: any;
  body: string[];
  name: string;
  importance: CreepPlanImportance;
}

export enum CreepRoles {
  None,
  Builder,
  Harvester,
  Upgrader,
  Defender,
  LongRangeHarvester,
  Claimer,
  Scout,
  Miner
}

export const CREEP_JOB_NONE = "none";
export type CreepJobNone = "none";

export const BUILDER_ROLE_NAME = "builder";
export type BuilderRoleType = "builder";

export const DEFENDER_ROLE_NAME = "defender";
export type DefenderRoleType = "defender";

export const HARVESTER_ROLE_NAME = "harvester";
export type HarvesterRoleType = "harvester";

export const UPGRADER_ROLE_NAME = "upgrader";
export type UpgraderRoleType = "upgrader";

export const LONG_RANGE_HARVESTER_ROLE_NAME = "longRangeHarvester";
export type LongRangeHarvesterRoleType = "longRangeHarvester";

export const CLAIMER_ROLE_NAME = "claimer";
export type ClaimerRoleType = "claimer";

export const SCOUT_ROLE_NAME = "scout";
export type ScoutRoleType = "scout";

export const MINER_ROLE_NAME = "miner";
export type MinerRoleType = "miner";

export type CreepRoleTypes =
  BuilderRoleType
  | DefenderRoleType
  | HarvesterRoleType
  | UpgraderRoleType
  | LongRangeHarvesterRoleType
  | ClaimerRoleType
  | ScoutRoleType
  | MinerRoleType;

export interface CreepMemory {
  role: CreepRoleTypes;
  room: string;
  oldRole?: CreepRoleTypes;
}
