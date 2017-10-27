"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* tslint:disable:no-reference */
/// <reference path="../../typings/globals/screeps/index.d.ts"/>
var _ = require("lodash");
var CreepFactory = /** @class */ (function () {
    function CreepFactory() {
    }
    CreepFactory.prototype.build = function () {
        var capacity = this._carryCapacity;
        if (!capacity && _.isArray(this._body)) {
            capacity = _.filter(this._body, function (p) { return p === CARRY; }).length * CARRY_CAPACITY;
        }
        return {
            body: this._body,
            carry: this._carry,
            carryCapacity: capacity,
            fatigue: this._fatigue,
            hits: this._hits,
            hitsMax: this._hitsMax,
            id: this._id,
            memory: this._memory || {},
            my: this._my,
            name: this._name,
            owner: this._owner,
            room: this._room,
            saying: this._saying,
            spawning: this._spawning,
            ticksToLive: this._ticksToLive,
        };
    };
    CreepFactory.prototype.body = function (body) {
        this._body = body;
        return this;
    };
    CreepFactory.prototype.carrying = function (type, amount) {
        if (!amount) {
            this._carry = type;
        }
        else if (typeof type === "string") {
            var c = {};
            c[type] = amount;
            this._carry = c;
        }
        return this;
    };
    CreepFactory.prototype.carryCapacity = function (capactiy) {
        this._carryCapacity = capactiy;
        return this;
    };
    CreepFactory.prototype.fatigue = function (fatigue) {
        this._fatigue = fatigue;
        return this;
    };
    CreepFactory.prototype.hits = function (hits) {
        this._hits = hits;
        return this;
    };
    CreepFactory.prototype.hitsMax = function (hitsMax) {
        this._hitsMax = hitsMax;
        return this;
    };
    CreepFactory.prototype.id = function (id) {
        this._id = id;
        return this;
    };
    CreepFactory.prototype.memory = function (memory) {
        this._memory = memory;
        return this;
    };
    CreepFactory.prototype.my = function (my) {
        this._my = my;
        return this;
    };
    CreepFactory.prototype.name = function (name) {
        this._name = name;
        return this;
    };
    CreepFactory.prototype.owner = function (owner) {
        this._owner = owner;
        return this;
    };
    CreepFactory.prototype.room = function (room) {
        this._room = room;
        return this;
    };
    CreepFactory.prototype.spawning = function (spawning) {
        this._spawning = spawning;
        return this;
    };
    CreepFactory.prototype.saying = function (saying) {
        this._saying = saying;
        return this;
    };
    CreepFactory.prototype.ticksToLive = function (ticksToLive) {
        this._ticksToLive = ticksToLive;
        return this;
    };
    return CreepFactory;
}());
exports.CreepFactory = CreepFactory;
