import * as Config from "../../../config/config";
import {
  CacheRead, CREEP_JOB_NONE, CreepJobNone, CreepMemory, CreepPlan, CreepPlanImportance, DEFENDER_ROLE_NAME,
  DefenderRoleType
} from "../../../config/types";
import {
  CreepManager
} from "../../creeps/creepManager";
import {ControllerManager} from "../../structures/controllerManager";
import {SpawnManager} from "../../structures/spawnManager";

interface DefenderManagers {
  [roomName: string]: DefenderManager;
}

const defenderManagers: DefenderManagers = {};

const DEFENDER_JOB_TYPE_WAIT = "wait";
type DefenderJobTypeWait = "wait";
const DEFENDER_JOB_TYPE_MOVE_TO_RAMPART = "move to rampart";
type DefenderJobTypeMoveToRampart = "move to rampart";
const DEFENDER_JOB_TYPE_ATTACK = "attack";
type DefenderJobTypeAttack = "attack";
const DEFENDER_JOB_TYPE_EVADE = "evade";
type DefenderJobTypeEvade = "evade";

interface DefenderWaitJob {
  "type": DefenderJobTypeWait;
  spawnId: string;
}

interface DefenderMoveToRampartJob {
  "type": DefenderJobTypeMoveToRampart;
  rampartId: string;
}

interface DefenderAttackJob {
  "type": DefenderJobTypeAttack;
  creepId: string;
}

interface DefenderEvadeJob {
  "type": DefenderJobTypeEvade;
  pos: {
    x: number,
    y: number
  };
}

interface DefenderMemory extends CreepMemory {
  role: DefenderRoleType;
  job: DefenderMoveToRampartJob | DefenderAttackJob | DefenderWaitJob | DefenderEvadeJob | CreepJobNone;
}

interface DefenderCreep extends Creep {
  memory: DefenderMemory;
}

interface DefenderRoomMemory extends Room {
  defenders: {
    generation: number;
    enemiesShowedUp: number;
    lastCreepProduced: number;
  };
}

interface DefenderRoom extends Room {
  memory: DefenderRoomMemory;
}

export class DefenderManager {

  public static getManager(roomOrRoomName: Room | string): DefenderManager {
    const roomName = (typeof roomOrRoomName === "string") ? roomOrRoomName : roomOrRoomName.name;
    if (typeof defenderManagers[roomName] === "undefined") {
      defenderManagers[roomName] = new DefenderManager(roomName);
    }
    return defenderManagers[roomName];
  }

  private roomName: string;
  private cacheCreeps: CacheRead<Creep[]> = {
    cache: [],
    readTime: 0
  };

  // noinspection JSUnusedLocalSymbols
  private constructor(roomName: string) {
    this.roomName = roomName;
    this.initializeMemory();
  }

  public getDefenders(): DefenderCreep[] {
    if (this.cacheCreeps.readTime !== Game.time) {
      this.cacheCreeps.cache = CreepManager.getManager(this.roomName).getCreeps().filter((c) => c.memory.role === DEFENDER_ROLE_NAME);
      this.cacheCreeps.readTime = Game.time;
    }
    return this.cacheCreeps.cache;
  }

  public anzDefenders(): number {
    return this.getDefenders().length;
  }

  public defenseMode(): boolean {
    const defenderRoomMemory: DefenderRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(defenderRoomMemory)) {
      return false;
    }
    if (!_.isObject(defenderRoomMemory.defenders)) {
      return false;
    }
    if (!_.isNumber(defenderRoomMemory.defenders.enemiesShowedUp)) {
      return false;
    }
    return defenderRoomMemory.defenders.enemiesShowedUp !== 0 && Game.time >= defenderRoomMemory.defenders.enemiesShowedUp + Config.DEFENDER_DEFENSE_OFFSET;
  }

  public run(): void {
    this.refreshMemory();
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    this.getDefenders().forEach((creep) => {
      if (_.isUndefined(creep.memory.job) || creep.memory.job === CREEP_JOB_NONE) {
        if (!creep.spawning) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_WAIT) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        if (spawn == null || this.defenseMode()) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_MOVE_TO_RAMPART) {
        const rampart = Game.getObjectById<StructureRampart>(creep.memory.job.rampartId);
        if (rampart === null || rampart.hits === 0 || rampart.pos.getRangeTo(creep.pos) === 0 || !this.defenseMode()) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_EVADE) {
        const evadePos = new RoomPosition(creep.memory.job.pos.x, creep.memory.job.pos.y, creep.room.name);
        if (evadePos.getRangeTo(creep.pos) === 0 || !this.defenseMode()) {
          this.getNextJob(creep);
        }
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_ATTACK) {
        const enemyCreep = Game.getObjectById<Creep>(creep.memory.job.creepId);
        if (enemyCreep === null || enemyCreep.hits === 0 || !this.defenseMode()) {
          this.getNextJob(creep);
        } else {
          const rampart = this.getClosestRampartinAttackDistanceToEnemy(enemyCreep.pos);
          if (rampart !== null && rampart.pos.getRangeTo(creep.pos) > 0) {
            this.getNextJob(creep);
          }
        }
      }
    });

    _.forEach(this.getDefenders(), (creep) => {
      if (creep.memory.job === CREEP_JOB_NONE) {
        // Nothing
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_WAIT) {
        const spawn = Game.getObjectById<StructureSpawn>(creep.memory.job.spawnId);
        CreepManager.moveTo(creep, spawn);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_MOVE_TO_RAMPART) {
        const closestEnemy = this.getClosestEnemy(creep.pos);
        if (closestEnemy !== null && creep.pos.getRangeTo(closestEnemy.pos) <= Config.RANGED_ATTACK_DISTANCE) {
          CreepManager.rangedAttack(creep, closestEnemy);
        }
        const rampart = Game.getObjectById<StructureRampart>(creep.memory.job.rampartId);
        CreepManager.moveTo(creep, rampart);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_EVADE) {
        const closestEnemy = this.getClosestEnemy(creep.pos);
        if (closestEnemy !== null && creep.pos.getRangeTo(closestEnemy.pos) <= Config.RANGED_ATTACK_DISTANCE) {
          CreepManager.rangedAttack(creep, closestEnemy);
        }
        const evadePos = new RoomPosition(creep.memory.job.pos.x, creep.memory.job.pos.y, creep.room.name);
        CreepManager.moveToPos(creep, evadePos);
      } else if (_.isObject(creep.memory.job) && creep.memory.job.type === DEFENDER_JOB_TYPE_ATTACK) {
        const enemyCreep = Game.getObjectById<Creep>(creep.memory.job.creepId);
        CreepManager.moveToRangedAttack(creep, enemyCreep);
      }
    });
  }

  public needNewCreep(spawnRoom: Room, maxBuildEnergyInNearbySpawns: number): CreepPlan | null {
    const room = this.getRoom();
    if (room === null) {
      return null;
    }
    const availableEnergy = spawnRoom.energyAvailable;
    const controller = ControllerManager.getManager(room).getController();
    if (controller === null || !controller.my) {
      return null;
    }
    if (!this.defenseMode()) {
      return null;
    }
    if (room.memory.defenders.lastCreepProduced === Game.time) {
      return null;
    }
    const anzDefenders = this.getDefenders().length;
    const anzEnemys = CreepManager.getManager(room).getEnemyCreep().length;
    const missingEnergyRatio = 1 - availableEnergy / maxBuildEnergyInNearbySpawns;
    const elapsedTime = Game.time - room.memory.defenders.enemiesShowedUp - (Config.DEFENDER_DEFENSE_OFFSET);
    const emergencyLevel = elapsedTime / Config.DEFENDER_MAX_TICKS;

    console.log("emergencyLevel " + emergencyLevel + " missingEnergyRatio " + missingEnergyRatio);

    if (anzDefenders === 0 && anzEnemys > 0 && emergencyLevel >= missingEnergyRatio && availableEnergy >= 150) {
      let body: string[] = [];
      const memory: DefenderMemory = {
        job: CREEP_JOB_NONE,
        role: DEFENDER_ROLE_NAME,
        room: room.name
      };

      let energyLeft = availableEnergy;
      const plans = [];
      plans.push([RANGED_ATTACK, TOUGH, TOUGH, TOUGH, MOVE, MOVE]);
      plans.push([RANGED_ATTACK, TOUGH, MOVE]);
      plans.push([RANGED_ATTACK, MOVE]);
      plans.push([TOUGH, MOVE]);
      let partAdded: boolean;
      do {
        partAdded = false;
        plans.forEach((plan) => {
          if (partAdded) {
            return;
          }
          const costs = CreepManager.calculateBodyPlanCosts(plan);
          if (costs <= energyLeft && body.length + plan.length <= MAX_CREEP_SIZE) {
            body = body.concat(plan);
            partAdded = true;
            energyLeft -= costs;
          }
        });
      } while (partAdded);

      return {
        body,
        importance: CreepPlanImportance.Critical,
        memory,
        name: DEFENDER_ROLE_NAME + " " + room.name + " " + room.memory.defenders.generation
      };
    }
    return null;
  }

  public creepProduced(): void {
    const defenderRoomMemory: DefenderRoomMemory = Memory.rooms[this.roomName];
    if (!_.isObject(defenderRoomMemory)) {
      return;
    }
    if (!_.isObject(defenderRoomMemory.defenders)) {
      return;
    }
    defenderRoomMemory.defenders.lastCreepProduced = Game.time;
    if (!_.isNumber(defenderRoomMemory.defenders.generation)) {
      return;
    }
    defenderRoomMemory.defenders.generation++;
  }

  private getNextJob(creep: DefenderCreep): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const controller = ControllerManager.getManager(room).getController();
    if (typeof controller === "undefined") {
      return;
    }
    const creepVirtualPos = (creep.room.name === creep.memory.room) ? creep.pos : new RoomPosition(25, 25, creep.memory.room);
    if (!this.defenseMode()) {
      const closestSpawn = SpawnManager.getManager(room).getClosestSpawn(creepVirtualPos);
      if (closestSpawn !== null && closestSpawn.pos.getRangeTo(creepVirtualPos) > 1) {
        creep.memory.job = {
          spawnId: closestSpawn.id,
          type: DEFENDER_JOB_TYPE_WAIT
        };
      } else {
        creep.memory.job = CREEP_JOB_NONE;
      }
    } else {
      const rampart = this.getClosestRampartinAttackDistanceToEnemy(creepVirtualPos);
      if (rampart !== null) {
        if (rampart.pos.getRangeTo(creepVirtualPos) === 0) {
          const closestEnemy = this.getClosestEnemy(creepVirtualPos);
          if (closestEnemy !== null) {
            creep.memory.job = {
              creepId: closestEnemy.id,
              type: DEFENDER_JOB_TYPE_ATTACK
            };
          } else {
            creep.memory.job = CREEP_JOB_NONE;
          }
        } else {
          creep.memory.job = {
            rampartId: rampart.id,
            type: DEFENDER_JOB_TYPE_MOVE_TO_RAMPART
          };
        }
      } else {
        const closestEnemy = this.getClosestEnemy(creepVirtualPos);
        if (closestEnemy !== null) {
          if (creepVirtualPos.getRangeTo(closestEnemy.pos) <= Config.RANGED_ATTACK_DISTANCE - 1) {
            const closestPos = this.getClosestPosAwayFromPos(creepVirtualPos, closestEnemy.pos, Config.RANGED_ATTACK_DISTANCE);
            if (closestPos !== null) {
              creep.memory.job = {
                pos: {
                  x: closestPos.x,
                  y: closestPos.y
                },
                type: DEFENDER_JOB_TYPE_EVADE
              };
            } else {
              creep.memory.job = {
                creepId: closestEnemy.id,
                type: DEFENDER_JOB_TYPE_ATTACK
              };
            }
          } else {
            creep.memory.job = {
              creepId: closestEnemy.id,
              type: DEFENDER_JOB_TYPE_ATTACK
            };
          }
        } else {
          creep.memory.job = CREEP_JOB_NONE;
        }
      }
    }
  }

  private getClosestEnemy(myPos: RoomPosition): Creep | null {
    const enemyCreep = CreepManager.getManager(myPos.roomName).getEnemyCreep().map((creep) => {
      return {
        creep,
        distance: PathFinder.search(myPos, creep.pos).cost
      };
    }).sort((s1, s2) => s1.distance - s2.distance);
    return enemyCreep.length === 0 ? null : enemyCreep[0].creep;
  }

  private getClosestPosAwayFromPos(myPos: RoomPosition, awayPos: RoomPosition, distance: number): RoomPosition | null {
    if (myPos.roomName !== awayPos.roomName) {
      return null;
    }
    if (distance <= 0) {
      return awayPos;
    }
    if (distance > 49) {
      return null;
    }
    let closestPos: RoomPosition | null = null;
    let currentDist: number = 0;
    // Go Around in a Circle
    let x = awayPos.x - distance;
    let y = awayPos.y - distance;
    for (x = awayPos.x - distance; x <= awayPos.x + distance; x++) {
      for (y = awayPos.y - distance; y <= awayPos.y + distance; y++) {
        if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
          if (x === awayPos.x - distance || x === awayPos.x + distance || y === awayPos.y - distance || y === awayPos.y + distance) {
            const testPos = new RoomPosition(x, y, awayPos.roomName);
            const testDistance = myPos.getRangeTo(testPos);
            if (closestPos === null || currentDist > testDistance) {
              closestPos = testPos;
              currentDist = testDistance;
            }
          }
        }
      }
    }
    return closestPos;
  }

  private getRampartsInRangedAttackDistance(pos: RoomPosition): StructureRampart[] {
    const room = DefenderManager.getManager(pos.roomName).getRoom();
    if (room === null) {
      return [];
    }
    return (room.lookForAtArea(LOOK_STRUCTURES, Math.max(0, pos.y - 3), Math.max(0, pos.x - 3), Math.min(49, pos.y + 3), Math.min(49, pos.x + 3), true) as LookAtResultWithPos[]).filter((s) => {
      return _.isObject(s.structure) && (s.structure as Structure).structureType === STRUCTURE_RAMPART;
    }).map((result) => {
      return result.structure;
    }) as StructureRampart[];
  }

  private getClosestRampartinAttackDistanceToEnemy(myPos: RoomPosition): StructureRampart | null {
    const room = DefenderManager.getManager(myPos.roomName).getRoom();
    if (room === null) {
      return null;
    }
    const enemyRamparts = _.flatten(CreepManager.getManager(room).getEnemyCreep().map((creep) => this.getRampartsInRangedAttackDistance(creep.pos))).map((rampart) => {
      return {
        distance: PathFinder.search(myPos, rampart.pos).cost,
        rampart
      };
    }).sort((r1, r2) => r1.distance - r2.distance);
    return enemyRamparts.length === 0 ? null : enemyRamparts[0].rampart;
  }

  private getRoom(): DefenderRoom | null {
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
    if (!_.isObject(room.memory.defenders)) {
      room.memory.defenders = {
        enemiesShowedUp: 0,
        generation: 0,
        lastCreepProduced: 0
      };
    }
    if (!_.isNumber(room.memory.defenders.generation)) {
      room.memory.defenders.generation = 0;
    }
    if (!_.isNumber(room.memory.defenders.enemiesShowedUp)) {
      room.memory.defenders.enemiesShowedUp = 0;
    }
    if (!_.isNumber(room.memory.defenders.lastCreepProduced)) {
      room.memory.defenders.lastCreepProduced = 0;
    }
  }

  private refreshMemory(): void {
    const room = this.getRoom();
    if (room === null) {
      return;
    }
    const anzEnemies = CreepManager.getManager(room).getEnemyCreep().length;
    if (room.memory.defenders.enemiesShowedUp === 0 && anzEnemies > 0) {
      room.memory.defenders.enemiesShowedUp = Game.time;
    } else if (room.memory.defenders.enemiesShowedUp > 0 && anzEnemies === 0) {
      room.memory.defenders.enemiesShowedUp = 0;
    }
  }

}
