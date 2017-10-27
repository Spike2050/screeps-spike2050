import {CreepManager} from "./components/creeps/creepManager";
import {RoomManager} from "./components/roomManager";
import * as Config from "./config/config";

import {DefenderManager} from "components/creeps/roles/defenderManager";
import {ScoutManager} from "components/creeps/roles/scoutManager";
import {UpgraderManager} from "components/creeps/roles/upgraderManager";
import * as Profiler from "screeps-profiler";
import {BuilderManager} from "./components/creeps/roles/builderManager";
import {ClaimerManager} from "./components/creeps/roles/claimerManager";
import {HarvesterManager} from "./components/creeps/roles/harvesterManager";
import {LongRangeHarvesterManager} from "./components/creeps/roles/longRangeHarvesterManager";
import {MinerManager} from "./components/creeps/roles/minerManager";
import {ControllerManager} from "./components/structures/controllerManager";
import {log} from "./lib/logger/log";

// Any code written outside the `loop()` method is executed only when the
// Screeps system reloads your script.
// Use this bootstrap wisely. You can cache some of your stuff to save CPU.
// You should extend prototypes before the game loop executes here.

// This is an example for using a config variable from `config.ts`.
// NOTE: this is used as an example, you may have better performance
// by setting USE_PROFILER through webpack, if you want to permanently
// remove it on deploy
// Start the profiler
if (Config.USE_PROFILER) {
  Profiler.enable();
}

log.info(`Scripts bootstrapped`);
if (__REVISION__) {
  log.info(`Revision ID: ${__REVISION__}`);
}

interface AllRoomType {
  [roomName: string]: string | Room;
}

function mloop() {

  CreepManager.refreshMemory();

  const allRooms: AllRoomType = {};

  _.keys(Memory.rooms).forEach((roomName) => {
    allRooms[roomName] = roomName;
  });

  _.values(Game.rooms).forEach((room: Room) => {
    allRooms[room.name] = room;
  });

  _.values(allRooms).forEach((roomOrRoomName: string | Room) => {
    RoomManager.getManager(roomOrRoomName).run();
    CreepManager.getManager(roomOrRoomName).run();
  });

  if (Math.floor(Game.time / 200) * 200 === Game.time) {
    console.log(" Map | CL | Pr | BU | CL | DE | HA | MI | LO | SC | UP | En");
    console.log("-----------------------------------------------------------");
    _.keys(allRooms).map((roomName) => {
      const controller = ControllerManager.getManager(roomName).getController();
      const controllerLevel = controller !== null && controller.my ? controller.level : 0;
      const progress: number = controller !== null && controller.my ? (controller.progress / controller.progressTotal) * 100 : 0;
      const anzBuilders = BuilderManager.getManager(roomName).anzBuilders();
      const anzClaimers = ClaimerManager.getManager(roomName).anzClaimers();
      const anzDefenders = DefenderManager.getManager(roomName).anzDefenders();
      const anzHarvesters = HarvesterManager.getManager(roomName).anzHarvesters();
      const anzMiners = MinerManager.getManager(roomName).anzMiners();
      const anzLongRangeHarvesters = LongRangeHarvesterManager.getManager(roomName).anzLongRangeHarvesters();
      const anzScouts = ScoutManager.getManager(roomName).anzScouts();
      const anzUpgraders = UpgraderManager.getManager(roomName).anzUpgraders();
      const storedMinimumFillLevel: number = RoomManager.getManager(roomName).storedMinimumFillLevel() * 100;
      return {
        anzBuilders,
        anzClaimers,
        anzDefenders,
        anzHarvesters,
        anzLongRangeHarvesters,
        anzMiners,
        anzScouts,
        anzUpgraders,
        controllerLevel,
        progress,
        roomName,
        storedMinimumFillLevel
      };
    }).filter((obj) => {
      return obj.anzBuilders !== 0 || obj.anzClaimers !== 0 || obj.anzDefenders !== 0 || obj.anzHarvesters !== 0 || obj.anzLongRangeHarvesters !== 0 || obj.anzScouts !== 0 || obj.anzUpgraders !== 0;
    }).sort((s1, s2) => s2.controllerLevel - s1.controllerLevel).forEach( (obj) => {
      let out = obj.roomName + " | ";
      out += " " + obj.controllerLevel + " |";
      out += " " + (obj.progress >= 10 ? "" : " ") + obj.progress.toFixed(0) + " |";
      out += " " + (obj.anzBuilders > 9 ? "" : " ") + obj.anzBuilders + " |";
      out += " " + (obj.anzClaimers > 9 ? "" : " ") + obj.anzClaimers + " |";
      out += " " + (obj.anzDefenders > 9 ? "" : " ") + obj.anzDefenders + " |";
      out += " " + (obj.anzHarvesters > 9 ? "" : " ") + obj.anzHarvesters + " |";
      out += " " + (obj.anzMiners > 9 ? "" : " ") + obj.anzMiners + " |";
      out += " " + (obj.anzLongRangeHarvesters > 9 ? "" : " ") + obj.anzLongRangeHarvesters + " |";
      out += " " + (obj.anzScouts > 9 ? "" : " ") + obj.anzScouts + " |";
      out += " " + (obj.anzUpgraders > 9 ? "" : " ") + obj.anzUpgraders + " |";
      out += " " + (obj.storedMinimumFillLevel > 9 ? "" : " ") + obj.storedMinimumFillLevel.toFixed(0);
      console.log(out);
    });
  }

}

/**
 * Screeps system expects this "loop" method in main.js to run the
 * application. If we have this line, we can be sure that the globals are
 * bootstrapped properly and the game loop is executed.
 * http://support.screeps.com/hc/en-us/articles/204825672-New-main-loop-architecture
 *
 * @export
 */
export const loop = !Config.USE_PROFILER ? mloop : () => {
  Profiler.wrap(mloop);
};
