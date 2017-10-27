import * as Config from "../../../config/config";
import {
  CacheRead, CLAIMER_ROLE_NAME, ClaimerRoleType, CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan,
  CreepPlanImportance,
  UpgraderRoleType
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {ControllerManager} from "../../structures/controllerManager";
import {SpawnManager} from "../../structures/spawnManager";
import {DefenderManager} from "./defenderManager";

interface ClaimerManagers {
  [roomName: string]: ClaimerManager;
}

const claimerManagers: ClaimerManagers = {};

const CLAIMER_JOB_TYPE_MOVE_TO_CLAIM_SPOT = "moveToClaimSpot";
type ClaimerJobTypeMoveToClaimSpot = "moveToClaimSpot";
const CLAIMER_JOB_TYPE_CLAIM = "claim";
type ClaimerJobTypeClaim = "claim";

interface ClaimerMoveToClaimSpotJob {
  "type": ClaimerJobTypeMoveToClaimSpot;
}

interface ClaimerClaimJob {
  "type": ClaimerJobTypeClaim;
  controllerId: string;
}

interface ClaimerMemory extends CreepMemory {
  role: ClaimerRoleType | UpgraderRoleType;
  job: ClaimerMoveToClaimSpotJob | ClaimerClaimJob | CreepJobNone;
  oldPos?: {
    x: number;
    y: number;
  };
  claimJobNr: number;
}

interface ClaimerCreep extends Creep {
  memory: ClaimerMemory;
}

type ClaimJobStatusLoaded = "loaded";
const CLAIM_JOB_STATUS_LOADED = "loaded";
type ClaimJobStatusWaitForGCL = "wait for gcl";
const CLAIM_JOB_STATUS_WAIT_FOR_GCL = "wait for gcl";
type ClaimJobStatusClaim = "claim";
const CLAIM_JOB_STATUS_CLAIM = "claim";
type ClaimJobStatusBuild = "build";
const CLAIM_JOB_STATUS_BUILD = "build";
type ClaimJobStatusDone = "done";
const CLAIM_JOB_STATUS_DONE = "done";
type ClaimJobStatusFailed = "failed";
const CLAIM_JOB_STATUS_FAILED = "failed";

interface ClaimJobType {
  claimRoom: string;
  status: ClaimJobStatusLoaded | ClaimJobStatusWaitForGCL | ClaimJobStatusClaim | ClaimJobStatusBuild | ClaimJobStatusDone | ClaimJobStatusFailed;
}

interface ClaimerRoom extends Room {
  memory: {
    claimers: {
      creepGeneration: number;
      claimJobGeneration: number;
      claimJobs: {
        [nr: number]: ClaimJobType
      };
      lastCreepProduced: number;
    }
  };
}

export class ClaimerManager {

  public static getManager(roomOrRoomName: Room | string): ClaimerManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof claimerManagers[roomName] === "undefined") {
      claimerManagers[roomName] = new ClaimerManager(roomName);
    }
    return claimerManagers[roomName];
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

  public getClaimers(): ClaimerCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === CLAIMER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzClaimers(): number {
    return this.getClaimers().length;
  }

  public getClaimJobsFromFlags(): ClaimJobType[] {
    const room = this.getRoom();
    if (room === null) {
      return [];
    }
    const regex = new RegExp("^claim (W\\d+N\\d+)");

    return room.find<Flag>(FIND_FLAGS, {
      filter: (f: Flag) => {
        return regex.test(f.name);
      }
    }).map((flag) => {
      const flagName = flag.name;
      const matchArr = flag.name.match(regex) as string[];
      flag.remove();
      room.createFlag(flag.pos.x, flag.pos.y, "Job started: " + flagName);
      return {
        claimRoom: matchArr[1],
        status: CLAIM_JOB_STATUS_LOADED
      } as ClaimJobType;
    });
  }

  public run(): void {
    const homeRoom = this.getRoom();
    if (homeRoom === null) {
      return;
    }
    this.refreshMemory();

    const claimJobs: ClaimJobType[] = _.values(homeRoom.memory.claimers.claimJobs);
    if (claimJobs.length === 0) {
      return;
    }

    const claimJobsStartedNotClaimed = _.size(claimJobs) === 0 ? 0 : _.sum(claimJobs, (claimJob: ClaimJobType) => claimJob.status === CLAIM_JOB_STATUS_BUILD ? 1 : 0);
    const anzControlledRooms = ControllerManager.anzControlledRooms();
    const globalControlLevel = Game.gcl.level;
    let anzClaimJobsCanBeStarted = globalControlLevel - anzControlledRooms - claimJobsStartedNotClaimed;

    claimJobs.forEach((claimJob) => {
      if (claimJob.status === CLAIM_JOB_STATUS_LOADED) {
        claimJob.status = CLAIM_JOB_STATUS_WAIT_FOR_GCL;
      }
      if (claimJob.status === CLAIM_JOB_STATUS_WAIT_FOR_GCL) {
        if (anzClaimJobsCanBeStarted > 0) {
          claimJob.status = CLAIM_JOB_STATUS_CLAIM;
          anzClaimJobsCanBeStarted = anzClaimJobsCanBeStarted - 1;
        }
      }
      if (claimJob.status === CLAIM_JOB_STATUS_CLAIM) {
        const claimRoomControllerManager = ControllerManager.getManager(claimJob.claimRoom);
        if (claimRoomControllerManager.getRoom() !== null) {
          const claimRoomController = claimRoomControllerManager.getController();
          const homeController = ControllerManager.getManager(homeRoom).getController();
          if (claimRoomController === null || homeController === null || _.isString(claimRoomController.owner) && claimRoomController.owner !== homeController.owner) {
            claimJob.status = CLAIM_JOB_STATUS_FAILED;
          } else if (claimRoomController.my) {
            claimJob.status = CLAIM_JOB_STATUS_BUILD;
          }
        }
      }
      if (claimJob.status === CLAIM_JOB_STATUS_BUILD) {
        if (SpawnManager.getManager(claimJob.claimRoom).hasSpawns()) {
          claimJob.status = CLAIM_JOB_STATUS_DONE;
        }
      }
    });

    {
      this.getClaimers().forEach((creep) => {

        // Get ClaimJob
        const claimJob = homeRoom.memory.claimers.claimJobs[creep.memory.claimJobNr];
        if (claimJob.status === CLAIM_JOB_STATUS_FAILED || claimJob.status === CLAIM_JOB_STATUS_DONE) {
          creep.suicide();
        } else if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
          if (!creep.spawning) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === CLAIMER_JOB_TYPE_MOVE_TO_CLAIM_SPOT) {
          if (creep.room.name === claimJob.claimRoom) {
            this.getNextJob(creep);
          }
        } else if (_.isObject(creep.memory.job) && creep.memory.job.type === CLAIMER_JOB_TYPE_CLAIM) {
          if (ControllerManager.getManager(claimJob.claimRoom).controlled()) {
            this.getNextJob(creep);
          }
        }
      });
    }

    this.getClaimers().forEach((creep) => {
      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === CLAIMER_JOB_TYPE_MOVE_TO_CLAIM_SPOT) {
        const claimJob = homeRoom.memory.claimers.claimJobs[creep.memory.claimJobNr];
        const target = new RoomPosition(25, 25, claimJob.claimRoom);
        CreepManager.moveToPos(creep, target);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === CLAIMER_JOB_TYPE_CLAIM) {
        const controller = Game.getObjectById<StructureController>(creep.memory.job.controllerId);
        CreepManager.moveToClaim(creep, controller);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, _maxBuildEnergyInNearbySpawns: number): CreepPlan | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null || !controller.my) {
      return null;
    }
    if (DefenderManager.getManager(room).defenseMode()) {
      return null;
    }
    const availableEnergy = spawnRoom.energyAvailable;
    if (availableEnergy < Config.CLAIMER_COST) {
      return null;
    }
    if (room.memory.claimers.lastCreepProduced === Game.time) {
      return null;
    }

    const openClaimJobNrs = _.keys(room.memory.claimers.claimJobs).filter((claimJobNrStr: string) => {
      const claimJobNr = parseInt(claimJobNrStr, 10);
      const claimJob = room.memory.claimers.claimJobs[claimJobNr];
      if (claimJob.status === CLAIM_JOB_STATUS_CLAIM) {
        return !_.some(this.getClaimers(), (claimer) => claimer.memory.claimJobNr === claimJobNr);
      }
      return false;
    });

    if (openClaimJobNrs.length === 0) {
      return null;
    }
    const openClaimJobNr = parseInt(openClaimJobNrs[0], 10);

    const memory: ClaimerMemory = {
      claimJobNr: openClaimJobNr,
      job: CREEP_JOB_NONE,
      role: CLAIMER_ROLE_NAME,
      room: room.name
    };

    const body: string[] = Config.CLAIM_BLOCK;

    return {
      body,
      importance: CreepPlanImportance.Normal,
      memory,
      name: CLAIMER_ROLE_NAME + " " + room.name + " " + room.memory.claimers.creepGeneration
    };
  }

  public creepProduced(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    room.memory.claimers.creepGeneration++;
    room.memory.claimers.lastCreepProduced = Game.time;
  }

  private getNextJob(creep: ClaimerCreep): void {
    const homeRoom = this.getRoom();
    if (homeRoom === null) {
      return;
    }
    const claimJob = homeRoom.memory.claimers.claimJobs[creep.memory.claimJobNr];
    if (creep.room.name !== claimJob.claimRoom) {
      creep.memory.job = {
        type: CLAIMER_JOB_TYPE_MOVE_TO_CLAIM_SPOT
      };
    } else {
      const claimController = ControllerManager.getManager(creep.room).getController();
      if (claimController === null) {
        creep.memory.job = CREEP_JOB_NONE;
      } else if (!claimController.my && _.any(creep.body, (bodyPart) => bodyPart.type === CLAIM)) {
        creep.memory.job = {
          controllerId: claimController.id,
          type: CLAIMER_JOB_TYPE_CLAIM
        };
      }
    }
  }

  private getRoom(): ClaimerRoom | null {
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
    if (!_.isObject(room.memory.claimers)) {
      room.memory.claimers = {
        claimJobGeneration: 0,
        claimJobs: {},
        creepGeneration: 0,
        lastCreepProduced: 0
      };
    }

    if (!_.isNumber(room.memory.claimers.claimJobGeneration)) {
      room.memory.claimers.claimJobGeneration = 0;
    }
    if (!_.isNumber(room.memory.claimers.creepGeneration)) {
      room.memory.claimers.creepGeneration = 0;
    }
    if (!_.isNumber(room.memory.claimers.lastCreepProduced)) {
      room.memory.claimers.lastCreepProduced = 0;
    }
    if (!_.isObject(room.memory.claimers.claimJobs)) {
      room.memory.claimers.claimJobs = {};
    }
    for (const claimJobNr in room.memory.claimers.claimJobs) {
      if (!room.memory.claimers.claimJobs.hasOwnProperty(claimJobNr)) {
        continue;
      }
      if (!_.isObject(room.memory.claimers.claimJobs[claimJobNr])) {
        delete room.memory.claimers.claimJobs[claimJobNr];
      }
    }
  }

  private refreshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }

    for (const claimJobNr in room.memory.claimers.claimJobs) {
      if (!room.memory.claimers.claimJobs.hasOwnProperty(claimJobNr)) {
        continue;
      }

      if (room.memory.claimers.claimJobs[claimJobNr].status === CLAIM_JOB_STATUS_DONE || room.memory.claimers.claimJobs[claimJobNr].status === CLAIM_JOB_STATUS_FAILED) {
        delete room.memory.claimers.claimJobs[claimJobNr];
      }
    }
    this.getClaimJobsFromFlags().forEach((newClaimJob) => {
      room.memory.claimers.claimJobs[room.memory.claimers.claimJobGeneration] = newClaimJob;
      room.memory.claimers.claimJobGeneration++;
    });
  }

}
