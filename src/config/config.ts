import { LogLevels } from "../lib/logger/logLevels";

/**
 * Enable this if you want a lot of text to be logged to console.
 * @type {boolean}
 */
export const ENABLE_DEBUG_MODE: boolean = true;

/**
 * Enable this to enable screeps profiler
 */
export const USE_PROFILER: boolean = true;

/**
 * Debug level for log output
 */
export const LOG_LEVEL: number = LogLevels.DEBUG;

/**
 * Prepend log output with current tick number.
 */
export const LOG_PRINT_TICK: boolean = true;

/**
 * Prepend log output with source line.
 */
export const LOG_PRINT_LINES: boolean = true;

/**
 * Load source maps and resolve source lines back to typeascript.
 */
export const LOG_LOAD_SOURCE_MAP: boolean = true;

/**
 * Maximum padding for source links (for aligning log output).
 */
export const LOG_MAX_PAD: number = 100;

/**
 * VSC location, used to create links back to source.
 * Repo and revision are filled in at build time for git repositories.
 */
// export const LOG_VSC = { repo: "@@_repo_@@", revision: "@@_revision_@@", valid: false };
export const LOG_VSC = { repo: "@@_repo_@@", revision: __REVISION__, valid: false };

/**
 * URL template for VSC links, this one works for github and gitlab.
 */
export const LOG_VSC_URL_TEMPLATE = (path: string, line: string) => {
  return `${LOG_VSC.repo}/blob/${LOG_VSC.revision}/${path}#${line}`;
};

/**
 * Minimum number of ticksToLive for a Creep before they go to renew.
 * @type {number}
 */
export const DEFAULT_MIN_LIFE_BEFORE_NEEDS_REFILL: number = 700;

/*
 * Ranged Attack Distance
 */
export const RANGED_ATTACK_DISTANCE = 3;

/*
 * Minum Nr of Usage for a Tile, before road must be built or maintained
 */
export const ROAD_MIN_USAGE = 8;
/*
 * Minum Nr of Usage for a Tile, before road must be built or maintained
 */
export const ROAD_HEALTH_DELETE = 0.1;

/*
 * Amount of ticks a new Road lives
 */
export const ROAD_TICK_LIFE_TIME = 50000;

/*
 * The Resolution of how many Chunks of Timeback we look on Road usage
 */
export const ROAD_HISTORY_RESOLUTION = 10;

/*
 * The Size of the Chunk Road Usage is counted
 */
export const ROAD_HISTORY_CHUNK_SIZE = Math.floor(ROAD_TICK_LIFE_TIME / ROAD_HISTORY_RESOLUTION);

/*
 * The Minimum when Roads should be started to be rapaired
 */
export const ROAD_START_REPAIRING = 0.5;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 2
 */
export const WALL_MIN_HP_CL2 = 30000;
export const WALL_MAX_HP_CL2 = 40000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 3
 */
export const WALL_MIN_HP_CL3 = 60000;
export const WALL_MAX_HP_CL3 = 80000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 4
 */
export const WALL_MIN_HP_CL4 = 120000;
export const WALL_MAX_HP_CL4 = 150000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 5
 */
export const WALL_MIN_HP_CL5 = 200000;
export const WALL_MAX_HP_CL5 = 240000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 6
 */
export const WALL_MIN_HP_CL6 = 300000;
export const WALL_MAX_HP_CL6 = 350000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 7
 */
export const WALL_MIN_HP_CL7 = 500000;
export const WALL_MAX_HP_CL7 = 600000;
/*
 * The Minimum Hp when Walls should be repaired at Controller Level 8
 */
export const WALL_MIN_HP_CL8 = 1000000;
export const WALL_MAX_HP_CL8 = 1100000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 2
 */
export const RAMPART_MIN_HP_CL2 = 30000;
export const RAMPART_MAX_HP_CL2 = 35000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 3
 */
export const RAMPART_MIN_HP_CL3 = 60000;
export const RAMPART_MAX_HP_CL3 = 80000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 4
 */
export const RAMPART_MIN_HP_CL4 = 120000;
export const RAMPART_MAX_HP_CL4 = 150000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 5
 */
export const RAMPART_MIN_HP_CL5 = 200000;
export const RAMPART_MAX_HP_CL5 = 240000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 6
 */
export const RAMPART_MIN_HP_CL6 = 300000;
export const RAMPART_MAX_HP_CL6 = 350000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 7
 */
export const RAMPART_MIN_HP_CL7 = 600000;
export const RAMPART_MAX_HP_CL7 = 700000;
/*
 * The Minimum Hp when Ramparts should be repaired at Controller Level 8
 */
export const RAMPART_MIN_HP_CL8 = 1200000;
export const RAMPART_MAX_HP_CL8 = 1400000;
/*
 * The Minimum when All ither Structures should be repaired
 */
export const STRUCTURE_START_REPAIRING = 0.5;
/*
 * Maximum Time before starts DefenseMode
 */
export const DEFENDER_DEFENSE_OFFSET = 150;
/*
 * Maximum Time of Ticks, until a Defendercreep is built
 */
export const DEFENDER_MAX_TICKS = 150;
/*
Basic Block of Worker
 */
export const WORKER_BASIC_BLOCK = [WORK, CARRY, MOVE];
/*
Basic Block of Worker
 */
export const WORKER_BASIC_BLOCK_COST = BODYPART_COST[MOVE] + BODYPART_COST[CARRY] + BODYPART_COST[WORK];
/*
Basic Block of Worker
 */
export const WORKER_BASIC_BLOCK_CARRY_CAPACITY = WORKER_BASIC_BLOCK.filter((part) => part === CARRY).length * CARRY_CAPACITY;
/*
Builder Max Cost
 */
export const BUILDER_MAX_WORKER_BLOCKS = 10;
/*
Builder Max Cost
 */
export const BUILDER_MIN_ANZ_JOB_PER_CYCLE_FROM_SOURCE = 5;
/*
Builder Max Cost
 */
export const BUILDER_MIN_ANZ_JOB_PER_CYCLE_FROM_STORAGE = 15;
/*
Builder Max Cost
 */
export const BUILDER_MAX_ANZ = 4;
/*
Upgrader Max Cost
 */
export const UPGRADER_MAX_WORKER_BLOCKS = 10;
/*
Upgrader Max Cost
 */
export const UPGRADER_MAX = 8;
/*
Claim Block
 */
export const CLAIM_BLOCK = [CLAIM, MOVE];
/*
Claim Block Cost
 */
export const CLAIMER_COST = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE];
/*
Long Range Harvester Max Cost
 */
export const CREEP_NEED_RENEW = 0.75;
/*
Long Range Harvester Max Cost
 */
export const CREEP_STOP_RENEW = 0.95;
/*
Upgrader Max Cost
 */
export const SPAWN_MIN_RENEW_ENERGY = 100;
/*
Scout Min Cost
 */
export const SCOUT_MIN_COST = BODYPART_COST[MOVE];
