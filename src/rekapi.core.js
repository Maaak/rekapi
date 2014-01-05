// REKAPI-GLOBALS
// These are global in development, but get wrapped in a closure at build-time.

// A hack for UglifyJS defines.  Gets removes in the build process.
if (typeof REKAPI_DEBUG === 'undefined') {
  REKAPI_DEBUG = true;
}

var rekapiModules = [];

/*!
 * Fire an event bound to a Rekapi.
 * @param {Rekapi} rekapi
 * @param {string} eventName
 * @param {Underscore} _ A reference to the scoped Underscore dependency
 * @param {object} opt_data Optional event-specific data
 */
function fireEvent (rekapi, eventName, _, opt_data) {
  _.each(rekapi._events[eventName], function (handler) {
    handler(rekapi, opt_data);
  });
}

/*!
 * @param {Rekapi} rekapi
 */
function recalculateAnimationLength (rekapi, _) {
  var actorLengths = [];

  _.each(rekapi._actors, function (actor) {
    actorLengths.push(actor.getEnd());
  });

  rekapi._animationLength = Math.max.apply(Math, actorLengths);
}

/*!
 * Does nothing.  Absolutely nothing at all.
 */
function noop () {
  // NOOP!
}

var rekapiCore = function (root, _, Tweenable) {

  'use strict';

  // CONSTANTS
  //
  var UPDATE_TIME = 1000 / 60;

  /*!
   * Determines which iteration of the loop the animation is currently in.
   * @param {Rekapi} rekapi
   * @param {number} timeSinceStart
   */
  function determineCurrentLoopIteration (rekapi, timeSinceStart) {
    var currentIteration = Math.floor(
        (timeSinceStart) / rekapi._animationLength);
    return currentIteration;
  }

  /*!
   * Calculate how many milliseconds since the animation began.
   * @param {Rekapi} rekapi
   * @return {number}
   */
  function calculateTimeSinceStart (rekapi) {
    return now() - rekapi._loopTimestamp;
  }

  /*!
   * Determines if the animation is complete or not.
   * @param {Rekapi} rekapi
   * @param {number} currentLoopIteration
   * @return {boolean}
   */
  function isAnimationComplete (rekapi, currentLoopIteration) {
    return currentLoopIteration >= rekapi._timesToIterate
        && rekapi._timesToIterate !== -1;
  }

  /*!
   * Stops the animation if it is complete.
   * @param {Rekapi} rekapi
   * @param {number} currentLoopIteration
   */
  function updatePlayState (rekapi, currentLoopIteration) {
    if (isAnimationComplete(rekapi, currentLoopIteration)) {
      rekapi.stop();
      fireEvent(rekapi, 'animationComplete', _);
    }
  }

  /*!
   * Calculate how far in the animation loop `rekapi` is, in milliseconds,
   * based on the current time.  Also overflows into a new loop if necessary.
   * @param {Rekapi} rekapi
   * @return {number}
   */
  function calculateLoopPosition (rekapi, forMillisecond, currentLoopIteration) {
    var currentLoopPosition;

    if (isAnimationComplete(rekapi, currentLoopIteration)) {
      currentLoopPosition = rekapi._animationLength;
    } else {
      currentLoopPosition = forMillisecond % rekapi._animationLength;
    }

    return currentLoopPosition;
  }

  /*!
   * Calculate the timeline position and state for a given millisecond.
   * Updates the `rekapi` state internally and accounts for how many loop
   * iterations the animation runs for.
   * @param {Rekapi} rekapi
   * @param {number} forMillisecond
   */
  function updateToMillisecond (rekapi, forMillisecond) {
    var currentIteration = determineCurrentLoopIteration(rekapi, forMillisecond);
    var loopPosition = calculateLoopPosition(rekapi, forMillisecond,
        currentIteration);
    rekapi.update(loopPosition);
    updatePlayState(rekapi, currentIteration);
  }

  /*!
   * Calculate how far into the animation loop `rekapi` is, in milliseconds,
   * and update based on that time.
   * @param {Rekapi} rekapi
   */
  function updateToCurrentMillisecond (rekapi) {
    updateToMillisecond(rekapi, calculateTimeSinceStart(rekapi));
  }

  /*!
   * This is the heartbeat of an animation.  This updates `rekapi`'s state and
   * then calls itself continuously.
   * @param {Rekapi} rekapi
   */
  function tick (rekapi) {
    // Need to check for .call presence to get around an IE limitation.  See
    // annotation for cancelLoop for more info.
    if (rekapi._scheduleUpdate.call) {
      rekapi._loopId = rekapi._scheduleUpdate.call(global,
          rekapi._updateFn, UPDATE_TIME);
    } else {
      rekapi._loopId = setTimeout(rekapi._updateFn, UPDATE_TIME);
    }
  }

  /*!
   * @return {Function}
   */
  function getUpdateMethod () {
    // requestAnimationFrame() shim by Paul Irish (modified for Rekapi)
    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    return global.requestAnimationFrame  ||
      global.webkitRequestAnimationFrame ||
      global.oRequestAnimationFrame      ||
      global.msRequestAnimationFrame     ||
      (global.mozCancelRequestAnimationFrame
        && global.mozRequestAnimationFrame) ||
      global.setTimeout;
  }

  /*!
   * @return {Function}
   */
  function getCancelMethod () {
    return global.cancelAnimationFrame  ||
      global.webkitCancelAnimationFrame ||
      global.oCancelAnimationFrame      ||
      global.msCancelAnimationFrame     ||
      global.mozCancelRequestAnimationFrame ||
      global.clearTimeout;
  }

  /*!
   * Cancels an update loop.  This abstraction is needed to get around the fact
   * that in IE, clearTimeout is not technically a function
   * (https://twitter.com/kitcambridge/status/206655060342603777) and thus
   * Function.prototype.call cannot be used upon it.
   * @param {Rekapi} rekapi
   */
  function cancelLoop (rekapi) {
    if (rekapi._cancelUpdate.call) {
      rekapi._cancelUpdate.call(global, rekapi._loopId);
    } else {
      clearTimeout(rekapi._loopId);
    }
  }

  // CORE-SPECIFIC VARS AND FUNCTIONS

  var now = Tweenable.now;

  var playState = {
    'STOPPED': 'stopped'
    ,'PAUSED': 'paused'
    ,'PLAYING': 'playing'
  };

  /**
   * Rekapi constructor.
   *
   * __[Example](../../../../docs/examples/rekapi.html)__
   * @param {Object} opt_context The context that the animation will run in.  If provided, this can be any type of `Object`.  It gets used by the renderer and inherited by the `Rekapi.Actor`s as they are added to the animation.  This is only needed if Rekapi is being used to render to the screen, such as in a canvas or DOM animation.
   * @constructor
   */
  function Rekapi (opt_context) {
    this.context = opt_context || {};
    this._actors = {};
    this._playState = playState.STOPPED;

    this._events = {
      'animationComplete': []
      ,'playStateChange': []
      ,'play': []
      ,'pause': []
      ,'stop': []
      ,'beforeUpdate': []
      ,'afterUpdate': []
      ,'addActor': []
      ,'removeActor': []
    };

    // How many times to loop the animation before stopping.
    this._timesToIterate = -1;

    // Millisecond duration of the animation
    this._animationLength = 0;

    // The setTimeout ID of `tick`
    this._loopId = null;

    // The UNIX time at which the animation loop started
    this._loopTimestamp = null;

    // Used for maintaining position when the animation is paused.
    this._pausedAtTime = null;

    // The last millisecond position that was updated
    this._lastUpdatedMillisecond = 0;

    this._scheduleUpdate = getUpdateMethod();
    this._cancelUpdate = getCancelMethod();

    this._updateFn = _.bind(function () {
      tick(this);
      updateToCurrentMillisecond(this);
    }, this);

    _.each(Rekapi._contextInitHook, function (fn) {
      fn.call(this);
    }, this);

    return this;
  }

  // Decorate the Rekapi object with the dependencies so that other modules can
  // access them.
  Rekapi.Tweenable = Tweenable;
  Rekapi._ = _;

  /*!
   * @type {Object.<function>} Contains the context init function to be called
   * in the Rekapi constructor.
   */
  Rekapi._contextInitHook = {};

  /**
   * Add a `Rekapi.Actor` to the animation.
   *
   * __[Example](../../../../docs/examples/add_actor.html)__
   * @param {Rekapi.Actor} actor
   * @return {Rekapi}
   */
  Rekapi.prototype.addActor = function (actor) {
    // You can't add an actor more than once.
    if (!_.contains(this._actors, actor)) {
      if (typeof actor.context === 'undefined') {
        actor.context = this.context;
      }

      actor.rekapi = this;
      this._actors[actor.id] = actor;
      recalculateAnimationLength(this, _);
      actor.setup();

      fireEvent(this, 'addActor', _, actor);
    }

    return this;
  };

  /**
   * Retrieve a `Rekapi.Actor` from the `Rekapi` instance by its ID.  All `Actor`s have an `id` property.
   *
   * __[Example](../../../../docs/examples/get_actor.html)__
   * @param {number} actorId
   * @return {Rekapi.Actor}
   */
  Rekapi.prototype.getActor = function (actorId) {
    return this._actors[actorId];
  };

  /**
   * Retrieve the IDs of all `Rekapi.Actor`s in a `Rekapi` instance as an Array.
   *
   * __[Example](../../../../docs/examples/get_actor_ids.html)__
   * @return {Array.<number>}
   */
  Rekapi.prototype.getActorIds = function () {
    return _.pluck(this._actors, 'id');
  };

  /**
   * Retrieve all `Rekapi.Actor`s in the animation as an Object.  Actors' IDs correspond to the property names of the returned Object.
   *
   * __[Example](../../../../docs/examples/get_all_actors.html)__
   * @return {Array}
   */
  Rekapi.prototype.getAllActors = function () {
    return _.clone(this._actors);
  };

  /**
   * Remove a `Rekapi.Actor` from the animation.  This does not destroy the `Actor`, it only removes the link between it and the `Rekapi` instance.
   *
   * __[Example](../../../../docs/examples/remove_actor.html)__
   * @param {Rekapi.Actor} actor
   * @return {Rekapi}
   */
  Rekapi.prototype.removeActor = function (actor) {
    delete this._actors[actor.id];
    delete actor.rekapi;
    actor.teardown();
    recalculateAnimationLength(this, _);

    fireEvent(this, 'removeActor', _, actor);

    return this;
  };

  /**
   * Play the animation on a loop, either a set amount of times or infinitely.  If `opt_howManyTimes` is omitted, the animation will loop infinitely.
   *
   * __[Example](../../../../docs/examples/play.html)__
   * @param {number} opt_howManyTimes
   * @return {Rekapi}
   */
  Rekapi.prototype.play = function (opt_howManyTimes) {
    cancelLoop(this);

    if (this._playState === playState.PAUSED) {
      this._loopTimestamp += now() - this._pausedAtTime;
    } else {
      this._loopTimestamp = now();
    }

    this._timesToIterate = opt_howManyTimes || -1;
    this._playState = playState.PLAYING;
    tick(this);

    fireEvent(this, 'playStateChange', _);
    fireEvent(this, 'play', _);

    return this;
  };

  /**
   * Move to a specific millisecond on the timeline and play from there. `opt_howManyTimes` works as it does in `play()`.
   *
   * __[Example](../../../../docs/examples/play_from.html)__
   * @param {number} millisecond
   * @param {number} opt_howManyTimes
   * @return {Rekapi}
   */
  Rekapi.prototype.playFrom = function (millisecond, opt_howManyTimes) {
    this.play(opt_howManyTimes);
    this._loopTimestamp = now() - millisecond;

    return this;
  };

  /**
   * Play from the last frame that was calculated with [`update()`](#update). `opt_howManyTimes` works as it does in `play()`.
   *
   * __[Example](../../../../docs/examples/play_from_current.html)__
   * @param {number} opt_howManyTimes
   * @return {Rekapi}
   */
  Rekapi.prototype.playFromCurrent = function (opt_howManyTimes) {
    return this.playFrom(this._lastUpdatedMillisecond, opt_howManyTimes);
  };

  /**
   * Pause the animation.  A "paused" animation can be resumed from where it left off with `play()`.
   *
   * __[Example](../../../../docs/examples/pause.html)__
   * @return {Rekapi}
   */
  Rekapi.prototype.pause = function () {
    if (this._playState === playState.PAUSED) {
      return this;
    }

    this._playState = playState.PAUSED;
    cancelLoop(this);
    this._pausedAtTime = now();

    fireEvent(this, 'playStateChange', _);
    fireEvent(this, 'pause', _);

    return this;
  };

  /**
   * Stop the animation.  A "stopped" animation will start from the beginning if `play()` is called.
   *
   * __[Example](../../../../docs/examples/stop.html)__
   * @return {Rekapi}
   */
  Rekapi.prototype.stop = function () {
    this._playState = playState.STOPPED;
    cancelLoop(this);

    // Also kill any shifty tweens that are running.
    _.each(this._actors, function (actor) {
      actor.stop();
    });

    fireEvent(this, 'playStateChange', _);
    fireEvent(this, 'stop', _);

    return this;
  };

  /**
   * Return whether or not the animation is playing (meaning not paused or stopped).
   *
   * __[Example](../../../../docs/examples/is_playing.html)__
   * @return {boolean}
   */
  Rekapi.prototype.isPlaying = function () {
    return this._playState === playState.PLAYING;
  };

  /**
   * Return the length of the animation, in milliseconds.
   *
   * __[Example](../../../../docs/examples/animation_length.html)__
   * @return {number}
   */
  Rekapi.prototype.animationLength = function () {
    return this._animationLength;
  };

  /**
   * Return the normalized (between 0 and 1) timeline position that was last calculated.
   *
   * __[Example](../../../../docs/examples/last_position_updated.html)__
   * @return {number}
   */
  Rekapi.prototype.lastPositionUpdated = function () {
    return (this._lastUpdatedMillisecond / this._animationLength);
  };

  /**
   * Return the number of `Rekapi.Actor`s in the animation.
   *
   * __[Example](../../../../docs/examples/actor_count.html)__
   * @return {number}
   */
  Rekapi.prototype.actorCount = function () {
    return _.size(this._actors);
  };

  /**
   * Update the position of all the `Rekapi.Actor`s to `opt_millisecond`.  If `opt_millisecond` is omitted, update to the last millisecond that the animation was updated to (it's a re-update).
   *
   * __[Example](../../../../docs/examples/update.html)__
   * @param {number=} opt_millisecond
   * @return {Rekapi}
   */
  Rekapi.prototype.update = function (opt_millisecond) {
    if (opt_millisecond === undefined) {
      opt_millisecond = this._lastUpdatedMillisecond;
    }

    fireEvent(this, 'beforeUpdate', _);
    _.each(this._actors, function (actor) {
      actor._updateState(opt_millisecond);
      if (typeof actor.update === 'function') {
        actor.update(actor.context, actor.get());
      }
    });
    this._lastUpdatedMillisecond = opt_millisecond;
    fireEvent(this, 'afterUpdate', _);

    return this;
  };

  /**
   * Bind a handler function to a Rekapi event.  Valid events are:
   *
   * - __animationComplete__: Fires when all animations loops have completed.
   * - __playStateChange__: Fires when the animation is played, paused, or stopped.
   * - __play__: Fires when the animation is `play()`ed.
   * - __pause__: Fires when the animation is `pause()`d.
   * - __stop__: Fires when the animation is `stop()`ped.
   * - __beforeUpdate__: Fires each frame before all Actors are updated.
   * - __afterUpdate__: Fires each frame after all Actors are updated.
   * - __addActor__: Fires when an Actor is added.
   * - __removeActor__: Fires when an Actor is removed.
   * - __timelineModified__: Fires when a keyframe is added, modified or removed.
   *
   * __[Example](../../../../docs/examples/bind.html)__
   * @param {string} eventName
   * @param {Function} handler
   * @return {Rekapi}
   */
  Rekapi.prototype.on = function (eventName, handler) {
    if (!this._events[eventName]) {
      return;
    }

    this._events[eventName].push(handler);

    return this;
  };

  /**
   * Unbind `opt_handler` from a Rekapi event.  If `opt_handler` is omitted, all handler functions bound to `eventName` are unbound.  Valid events correspond to the list under [`on()`](#on).
   *
   * __[Example](../../../../docs/examples/unbind.html)__
   * @param {string} eventName
   * @param {Function} opt_handler
   * @return {Rekapi}
   */
  Rekapi.prototype.off = function (eventName, opt_handler) {
    if (!this._events[eventName]) {
      return;
    }

    if (!opt_handler) {
      this._events[eventName] = [];
    } else {
      this._events[eventName] = _.without(this._events[eventName],
        opt_handler);
    }

    return this;
  };

  /**
   * Export the current state of the animation into a serializable `Object`.
   *
   * __[Example](../../../docs/examples/export_timeline.html)__
   * @return {Object}
   */
  Rekapi.prototype.exportTimeline = function () {
    var exportData = {
      'duration': this._animationLength
      ,'actors': []
    };

    _.each(this._actors, function (actor) {
      exportData.actors.push(actor.exportTimeline());
    }, this);

    return exportData;
  };

  /**
   * Import data that was created by [`Rekapi#exportTimeline`](#exportTimeline).  Sets up all necessary actors and keyframes.  Note that this method only creates `Rekapi.Actor` instances, not subclasses.
   *
   * @param {Object} rekapiData Any object that has the same data format as the object generated from Rekapi#exportTimeline.
   */
  Rekapi.prototype.importTimeline = function (rekapiData) {
    _.each(rekapiData.actors, function (actorData) {
      var actor = new Rekapi.Actor();
      actor.importTimeline(actorData);
      this.addActor(actor);
    }, this);
  };

  Rekapi.util = {};

  // Some hooks for testing.
  if (REKAPI_DEBUG) {
    Rekapi._private = {
      'calculateLoopPosition': calculateLoopPosition
      ,'updateToCurrentMillisecond': updateToCurrentMillisecond
      ,'tick': tick
      ,'determineCurrentLoopIteration': determineCurrentLoopIteration
      ,'calculateTimeSinceStart': calculateTimeSinceStart
      ,'isAnimationComplete': isAnimationComplete
      ,'updatePlayState': updatePlayState
    };
  }

  root.Rekapi = Rekapi;

};
