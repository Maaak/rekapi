/*! Rekapi - v0.16.4 - 2014-01-05 - http://rekapi.com */
/*!
 * Rekapi - Rewritten Kapi.
 * https://github.com/jeremyckahn/rekapi
 *
 * By Jeremy Kahn (jeremyckahn@gmail.com)
 *
 * Make fun keyframe animations with JavaScript.
 * Dependencies: Underscore.js (https://github.com/documentcloud/underscore),
 *   Shifty.js (https://github.com/jeremyckahn/shifty).
 * MIT License.  This code free to use, modify, distribute and enjoy.
 */

;(function (global) {

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
      actor.updateState(opt_millisecond);
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

rekapiModules.push(function (context) {

  'use strict';

  var DEFAULT_EASING = 'linear';
  var Rekapi = context.Rekapi;
  var Tweenable = Rekapi.Tweenable;
  var _ = Rekapi._;

  /*!
   * Sorts an array numerically, from smallest to largest.
   * @param {Array} array The Array to sort.
   * @return {Array} The sorted Array.
   */
  function sortNumerically (array) {
    return array.sort(function (a, b) {
      return a - b;
    });
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {number} millisecond
   * @return {number}
   */
  //TODO:  Oh noes, this is a linear search!  Maybe optimize it?
  function getPropertyCacheIdForMillisecond (actor, millisecond) {
    var list = actor._timelinePropertyCacheIndex;
    var len = list.length;

    var i;
    for (i = 1; i < len; i++) {
      if (list[i] >= millisecond) {
        return (i - 1);
      }
    }

    return -1;
  }

  /*!
   * Order all of an Actor's property tracks so they can be cached.
   * @param {Rekapi.Actor} actor
   */
  function sortPropertyTracks (actor) {
    _.each(actor._propertyTracks, function (track, name) {
      actor._propertyTracks[name] = _.sortBy(actor._propertyTracks[name],
        function (keyframeProperty) {
        return keyframeProperty.millisecond;
      });
    });
  }

  /*!
   * Compute and fill all timeline caches.
   * @param {Rekapi.Actor} actor
   */
  function cachePropertiesToSegments (actor) {
    _.each(actor._timelinePropertyCaches, function (propertyCache, cacheId) {
      var latestProperties = getLatestPropeties(actor, +cacheId);
      _.defaults(propertyCache, latestProperties);
    });
  }

  /*!
   * Gets all of the current and most recent Rekapi.KeyframeProperties for a
   * given millisecond.
   * @param {Rekapi.Actor} actor
   * @param {number} forMillisecond
   * @return {Object} An Object containing Rekapi.KeyframeProperties
   */
  function getLatestPropeties (actor, forMillisecond) {
    var latestProperties = {};

    _.each(actor._propertyTracks, function (propertyTrack, propertyName) {
      var previousKeyframeProperty = null;

      _.find(propertyTrack, function (keyframeProperty) {
        if (keyframeProperty.millisecond > forMillisecond) {
          latestProperties[propertyName] = previousKeyframeProperty;
        } else if (keyframeProperty.millisecond === forMillisecond) {
          latestProperties[propertyName] = keyframeProperty;
        }

        previousKeyframeProperty = keyframeProperty;
        return !!latestProperties[propertyName];
      });

      if (!latestProperties[propertyName]) {
        var lastProp = _.last(propertyTrack);

        if (lastProp && lastProp.millisecond <= forMillisecond) {
          latestProperties[propertyName] = lastProp;
        }
      }
    });

    return latestProperties;
  }

  /*!
   * Links each KeyframeProperty to the next one in it's respective track.
   *
   * They're linked lists!
   * @param {Rekapi.Actor} actor
   */
  function linkTrackedProperties (actor) {
    _.each(actor._propertyTracks, function (propertyTrack, trackName) {
      _.each(propertyTrack, function (trackProperty, i) {
        trackProperty.linkToNext(propertyTrack[i + 1]);
      });
    });
  }

  /*!
   * Returns a requested KeyframeProperty at a millisecond on a specified
   * track.
   * @param {Rekapi.Actor} actor
   * @param {string} trackName
   * @param {number} millisecond
   * @return {Rekapi.KeyframeProperty}
   */
  function findPropertyAtMillisecondInTrack (actor, trackName, millisecond) {
    return _.find(actor._propertyTracks[trackName],
        function (keyframeProperty) {
      return keyframeProperty.millisecond === millisecond;
    });
  }

  /*!
   * Empty out and re-cache internal KeyframeProperty data.
   * @param {Rekapi.Actor}
   */
  function invalidatePropertyCache (actor) {
    actor._timelinePropertyCaches = {};

    _.each(actor._keyframeProperties, function (keyframeProperty) {
      if (!actor._timelinePropertyCaches[keyframeProperty.millisecond]) {
        actor._timelinePropertyCaches[keyframeProperty.millisecond] = {};
      }

      actor._timelinePropertyCaches[keyframeProperty.millisecond][
          keyframeProperty.name] = keyframeProperty;
    }, actor);

    actor._timelinePropertyCacheIndex = _.keys(actor._timelinePropertyCaches);

    _.each(actor._timelinePropertyCacheIndex, function (listId, i) {
      actor._timelinePropertyCacheIndex[i] = +listId;
    }, actor);

    sortNumerically(actor._timelinePropertyCacheIndex);
    cachePropertiesToSegments(actor);
    linkTrackedProperties(actor);

    if (actor.rekapi) {
      fireEvent(actor.rekapi, 'timelineModified', _);
    }
  }

  /*!
   * Updates internal Rekapi and Actor data after a KeyframeProperty
   * modification method is called.
   *
   * TODO: This should be moved to core.
   *
   * @param {Rekapi.Actor} actor
   */
  function cleanupAfterKeyframeModification (actor) {
    sortPropertyTracks(actor);
    invalidatePropertyCache(actor);
    recalculateAnimationLength(actor.rekapi, _);
  }

  /**
   * Create a `Rekapi.Actor` instance.  Note that the rest of the API docs for `Rekapi.Actor` will simply refer to this Object as `Actor`.
   *
   * Valid properties of `opt_config` (you can omit the ones you don't need):
   *
   * - __context__ (_Object_): The context that this Actor is associated with. If omitted, this Actor gets the `Rekapi` instance's context when it is added with [`Rekapi#addActor`](rekapi.core.js.html#addActor).
   * - __setup__ (_Function_): A function that gets called when the `Actor` is added with [`Rekapi#addActor`](rekapi.core.js.html#addActor).
   * - __update__ (_Function(Object, Object)_): A function that gets called every time that the `Actor`'s state is updated. It receives two parameters: A reference to the `Actor`'s context and an Object containing the current state properties.
   * - __teardown__ (_Function_): A function that gets called when the `Actor` is removed with [`Rekapi#removeActor`](rekapi.core.js.html#removeActor).
   *
   * `Rekapi.Actor` does _not_ render to any context.  It is a base class.  Use the [`Rekapi.CanvasActor`](../ext/canvas/rekapi.canvas.actor.js.html) or [`Rekapi.DOMActor`](../ext/dom/rekapi.dom.actor.js.html) subclasses to render to the screen.  You can also make your own rendering subclass - see the source code for the aforementioned examples.
   *
   * __[Example](../../../../docs/examples/actor.html)__
   * @param {Object} opt_config
   * @constructor
   */
  Rekapi.Actor = function (opt_config) {

    opt_config = opt_config || {};

    // Steal the `Tweenable` constructor.
    Tweenable.call(this);

    _.extend(this, {
      '_propertyTracks': {}
      ,'_timelinePropertyCaches': {}
      ,'_timelinePropertyCacheIndex': []
      ,'_keyframeProperties': {}
      ,'id': _.uniqueId()
      ,'context': opt_config.context // This may be undefined
      ,'setup': opt_config.setup || noop
      ,'update': opt_config.update || noop
      ,'teardown': opt_config.teardown || noop
      ,'data': {}
    });

    return this;
  };
  var Actor = Rekapi.Actor;

  // Kind of a fun way to set up an inheritance chain.  `ActorMethods` prevents
  // methods on `Actor.prototype` from polluting `Tweenable`'s prototype with
  // `Actor` specific methods.
  var ActorMethods = function () {};
  ActorMethods.prototype = Tweenable.prototype;
  Actor.prototype = new ActorMethods();
  // But the magic doesn't stop here!  `Actor`'s constructor steals the
  // `Tweenable` constructor.

  /**
   * Create a keyframe for the `Actor`.  `millisecond` defines where in the animation to place the keyframe, in milliseconds (assumes that `0` is when the animation began).  The animation length will automatically "grow" to accommodate any keyframe position.
   *
   * `properties` should contain all of the properties that define the keyframe's state.  These properties can be any value that can be tweened by [Shifty](https://github.com/jeremyckahn/shifty) (numbers, color strings, CSS properties).
   *
   * __Note:__ Internally, this creates [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s and places them on a "track."  These [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s are managed for you by the `Actor` APIs.
   *
   * ## Easing
   *
   * `opt_easing`, if specified, can be a string or an Object.  If it's a string, all properties in `properties` will have the same easing formula applied to them. For example:
   *
   * ```javascript
   * actor.keyframe(1000, {
   *     'x': 100,
   *     'y': 100
   *   }, 'easeOutSine');
   * ```
   *
   * Both `x` and `y` will have `easeOutSine` applied to them.  You can also specify multiple easing formulas with an Object:
   *
   * ```javascript
   * actor.keyframe(1000, {
   *     'x': 100,
   *     'y': 100
   *   }, {
   *     'x': 'easeinSine',
   *     'y': 'easeOutSine'
   *   });
   * ```
   *
   * `x` will ease with `easeInSine`, and `y` will ease with `easeOutSine`.  Any unspecified properties will ease with `linear`.  If `opt_easing` is omitted, all properties will default to `linear`.
   *
   * ## Keyframe inheritance
   *
   * Keyframes always inherit missing properties from the keyframes that came before them.  For example:
   *
   * ```javascript
   * actor.keyframe(0, {
   *   'x': 100
   * }).keyframe(1000{
   *   // Inheriting the `x` from above!
   *   'y': 50
   * });
   * ```
   *
Keyframe `1000` will have a `y` of `50`, and an `x` of `100`, because `x` was inherited from keyframe `0`.
   * @param {number} millisecond Where on the timeline to set the keyframe.
   * @param {Object} properties Keyframe properties to set for the keyframe.
   * @param {string|Object} opt_easing Optional easing string or configuration object.
   * @return {Rekapi.Actor}
   */
  Actor.prototype.keyframe = function keyframe (
      millisecond, properties, opt_easing) {

    var originalEasingString;

    // TODO:  The opt_easing logic seems way overcomplicated, it's probably out
    // of date.  Multiple eases landed first in Rekapi, then were pushed
    // upstream into Shifty.  There's likely some redundant logic here.
    opt_easing = opt_easing || DEFAULT_EASING;

    if (typeof opt_easing === 'string') {
      originalEasingString = opt_easing;
      opt_easing = {};
      _.each(properties, function (property, propertyName) {
        opt_easing[propertyName] = originalEasingString;
      });
    }

    // If `opt_easing` was passed as an Object, this will fill in any missing
    // opt_easing properties with the default equation.
    _.each(properties, function (property, propertyName) {
      opt_easing[propertyName] = opt_easing[propertyName] || DEFAULT_EASING;
    });

    _.each(properties, function (value, name) {
      var newKeyframeProperty = new Rekapi.KeyframeProperty(
          this, millisecond, name, value, opt_easing[name]);

      this._keyframeProperties[newKeyframeProperty.id] = newKeyframeProperty;

      if (!this._propertyTracks[name]) {
        this._propertyTracks[name] = [];
      }

      this._propertyTracks[name].push(newKeyframeProperty);
      sortPropertyTracks(this);
    }, this);

    if (this.rekapi) {
      recalculateAnimationLength(this.rekapi, _);
    }

    invalidatePropertyCache(this);

    return this;
  };

  /**
   * Gets the [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html) from an `Actor`'s [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html) track. Returns `undefined` if there were no properties found with the specified parameters.
   *
   * __[Example](../../../../docs/examples/actor_get_keyframe_property.html)__
   * @param {string} property The name of the property.
   * @param {number} index The 0-based index of the KeyframeProperty in the Actor's KeyframeProperty track.
   * @return {Rekapi.KeyframeProperty|undefined}
   */
  Actor.prototype.getKeyframeProperty = function (property, index) {
    if (this._propertyTracks[property]
        && this._propertyTracks[property][index]) {
      return this._propertyTracks[property][index];
    }
  };

  /**
   * Modify a specified [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html) stored on an `Actor`.  Essentially, this calls [`KeyframeProperty#modifyWith`](rekapi.keyframeprops.js.html#modifyWith) (passing along `newProperties`) and then performs some cleanup.
   *
   * __[Example](../../../../docs/examples/actor_modify_keyframe_property.html)__
   * @param {string} property The name of the property to modify
   * @param {number} index The property track index of the KeyframeProperty to modify
   * @param {Object} newProperties The properties to augment the KeyframeProperty with
   * @return {Rekapi.Actor}
   */
  Actor.prototype.modifyKeyframeProperty = function (
      property, index, newProperties) {

    if (this._propertyTracks[property]
        && this._propertyTracks[property][index]) {
      this._propertyTracks[property][index].modifyWith(newProperties);
    }

    cleanupAfterKeyframeModification(this);

    return this;
  };

  /**
   * Get a list of all the track names for an `Actor`.
   *
   * __[Example](../../../../docs/examples/actor_get_track_names.html)__
   * @return {Array.<string>}
   */
  Actor.prototype.getTrackNames = function () {
    return _.keys(this._propertyTracks);
  };

  /**
   * Get the property track length for an `Actor` (how many `KeyframeProperty`s are in a given property track).
   *
   * __[Example](../../../../docs/examples/actor_get_track_length.html)__
   * @param {string} trackName
   * @return {number}
   */
  Actor.prototype.getTrackLength = function (trackName) {
    if (!this._propertyTracks[trackName]) {
      return;
    }

    return this._propertyTracks[trackName].length;
  };

  /**
   * Copy all of the properties that at one point in the timeline to another point. This is useful for many things, particularly for bringing a `Rekapi.Actor` back to its original position.
   *
   * __[Example](../../../../docs/examples/actor_copy_properties.html)__
   * @param {number} copyTo The millisecond to copy KeyframeProperties to
   * @param {number} copyFrom The millisecond to copy KeyframeProperties from
   * @return {Rekapi.Actor}
   */
  Actor.prototype.copyProperties = function (copyTo, copyFrom) {
    var sourcePositions = {};
    var sourceEasings = {};

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var foundProperty = findPropertyAtMillisecondInTrack(this, trackName,
          copyFrom);

      if (foundProperty) {
        sourcePositions[trackName] = foundProperty.value;
        sourceEasings[trackName] = foundProperty.easing;
      }
    }, this);

    this.keyframe(copyTo, sourcePositions, sourceEasings);
    return this;
  };

  /**
   * Extend the last state on this `Actor`'s timeline to create a animation wait. The state does not change during this time.
   *
   * __[Example](../../../../docs/examples/actor_wait.html)__
   * @param {number} until At what point in the animation the Actor should wait until (relative to the start of the animation)
   * @return {Rekapi.Actor}
   */
  Actor.prototype.wait = function (until) {
    var length = this.getEnd();

    if (until <= length) {
      return this;
    }

    var end = this.getEnd();
    var latestProps = getLatestPropeties(this, this.getEnd());
    var serializedProps = {};
    var serializedEasings = {};

    _.each(latestProps, function (latestProp, propName) {
      serializedProps[propName] = latestProp.value;
      serializedEasings[propName] = latestProp.easing;
    });

    this.removeKeyframe(end);
    this.keyframe(end, serializedProps, serializedEasings);
    this.keyframe(until, serializedProps, serializedEasings);

    return this;
  };

  /**
   * Get the millisecond of the first state of an `Actor` (when it first starts animating).  You can get the start time of a specific track with `opt_trackName`.
   *
   * __[Example](../../../../docs/examples/actor_get_start.html)__
   * @param {string} opt_trackName
   * @return {number}
   */
  Actor.prototype.getStart = function (opt_trackName) {
    var starts = [];

    if (opt_trackName) {
      starts.push(this._propertyTracks[opt_trackName][0].millisecond);
    } else {
      _.each(this._propertyTracks, function (propertyTrack) {
        if (propertyTrack.length) {
          starts.push(propertyTrack[0].millisecond);
        }
      });
    }

    if (starts.length === 0) {
      starts = [0];
    }

    return Math.min.apply(Math, starts);
  };

  /**
   * Get the millisecond of the last state of an `Actor` (when it is done animating).  You can get the last state for a specific track with `opt_trackName`.
   *
   * __[Example](../../../../docs/examples/actor_get_end.html)__
   * @param {string} opt_trackName
   * @return {number}
   */
  Actor.prototype.getEnd = function (opt_trackName) {
    var latest = 0;
    var tracksToInspect = this._propertyTracks;

    if (opt_trackName) {
      tracksToInspect = {};
      tracksToInspect[opt_trackName] = this._propertyTracks[opt_trackName];
    }

    _.each(tracksToInspect, function (propertyTrack) {
      if (propertyTrack.length) {
        var trackLength = _.last(propertyTrack).millisecond;

        if (trackLength > latest) {
          latest = trackLength;
        }
      }
    }, this);

    return latest;
  };

  /**
   * Get the length of time in milliseconds that an `Actor` animates for.  You can get the length of time that a specific track animates for with `opt_trackName`.
   *
   * __[Example](../../../../docs/examples/actor_get_length.html)__
   * @param {string} opt_trackName
   * @return {number}
   */
  Actor.prototype.getLength = function (opt_trackName) {
    return this.getEnd(opt_trackName) - this.getStart(opt_trackName);
  };

  /*
   * Determines if an actor has a keyframe set at a given millisecond.  Can optionally scope the lookup to a specific property name.
   *
   * @param {number} millisecond Point on the timeline to query.
   * @param {string} opt_trackName Optional name of a property track.
   * @return {boolean}
   */
  Actor.prototype.hasKeyframeAt = function(millisecond, opt_trackName) {
    var tracks = this._propertyTracks;

    if (opt_trackName) {
      if (!_.has(tracks, opt_trackName)) {
        return false;
      }
      tracks = _.pick(tracks, opt_trackName);
    }

    return _.find(tracks, function (propertyTrack, trackName) {
      var retrievedProperty =
          findPropertyAtMillisecondInTrack(this, trackName, millisecond);
      return retrievedProperty !== undefined;
    }, this) !== undefined;
  };

  /**
   * Moves a Keyframe from one point on the timeline to another.  Although this method does error checking for you to make sure the operation can be safely performed, an effective pattern is to use [`hasKeyframeAt`](#hasKeyframeAt) to see if there is already a keyframe at the requested `to` destination.
   *
   * __[Example](../../../../docs/examples/actor_move_keyframe.html)__
   * @param {number} from The millisecond of the keyframe to be moved.
   * @param {number} to The millisecond of where the keyframe should be moved to.
   * @return {boolean} Whether or not the keyframe was successfully moved.
   */
  Actor.prototype.moveKeyframe = function (from, to) {
    if (!this.hasKeyframeAt(from) || this.hasKeyframeAt(to)) {
      return false;
    }

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var property = findPropertyAtMillisecondInTrack(this, trackName, from);

      if (property) {
        property.modifyWith({
          'millisecond': to
        });
      }
    }, this);

    cleanupAfterKeyframeModification(this);

    return true;
  };

  /**
   * Augment the `value` or `easing` of the [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s at a given millisecond.  Any [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s omitted in `stateModification` or `opt_easing` are not modified.  Here's how you might use it:
   *
   * ```javascript
   * actor.keyframe(0, {
   *   'x': 10,
   *   'y': 20
   * }).keyframe(1000, {
   *   'x': 20,
   *   'y': 40
   * }).keyframe(2000, {
   *   'x': 30,
   *   'y': 60
   * })
   *
   * // Changes the state of the keyframe at millisecond 1000.
   * // Modifies the value of 'y' and the easing of 'x.'
   * actor.modifyKeyframe(1000, {
   *   'y': 150
   * }, {
   *   'x': 'easeFrom'
   * });
   * ```
   *
   * __[Example](../../../../docs/examples/actor_modify_keyframe.html)__
   * @param {number} millisecond
   * @param {Object} stateModification
   * @param {Object} opt_easingModification
   * @return {Rekapi.Actor}
   */
  Actor.prototype.modifyKeyframe = function (
      millisecond, stateModification, opt_easingModification) {
    opt_easingModification = opt_easingModification || {};

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var property = findPropertyAtMillisecondInTrack(
          this, trackName, millisecond);

      if (property) {
        property.modifyWith({
          'value': stateModification[trackName]
          ,'easing': opt_easingModification[trackName]
        });
      }
    }, this);

    return this;
  };

  /**
   * Remove all [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s at a given millisecond in the animation.
   *
   * __[Example](../../../../docs/examples/actor_remove_keyframe.html)__
   * @param {number} millisecond The location on the timeline of the keyframe to remove.
   * @return {Rekapi.Actor}
   */
  Actor.prototype.removeKeyframe = function (millisecond) {
    _.each(this._propertyTracks, function (propertyTrack, propertyName) {
      var i = -1;
      var foundProperty = false;

      _.find(propertyTrack, function (keyframeProperty) {
        i++;
        foundProperty = (millisecond === keyframeProperty.millisecond);
        return foundProperty;
      });

      if (foundProperty) {
        var removedProperty = propertyTrack.splice(i, 1)[0];

        if (removedProperty) {
          delete this._keyframeProperties[removedProperty.id];
        }
      }
    }, this);

    if (this.rekapi) {
      recalculateAnimationLength(this.rekapi, _);
    }

    invalidatePropertyCache(this);

    return this;
  };

  /**
   * Remove all `KeyframeProperty`s set on the `Actor`.
   *
   * __[Example](../../../../docs/examples/actor_remove_all_keyframe_properties.html)__
   * @return {Rekapi.Actor}
   */
  Actor.prototype.removeAllKeyframeProperties = function () {
    _.each(this._propertyTracks, function (propertyTrack, propertyName) {
      propertyTrack.length = 0;
    }, this);

    this._keyframeProperties = {};
    return this.removeKeyframe(0);
  };

  /**
   * Calculate and set the `Actor`'s position at `millisecond` in the animation.
   *
   * __[Example](../../../../docs/examples/actor_update_state.html)__
   * @param {number} millisecond
   * @return {Rekapi.Actor}
   */
  Actor.prototype.updateState = function (millisecond) {
    var startMs = this.getStart();
    var endMs = this.getEnd();

    millisecond = Math.min(endMs, millisecond);

    if (startMs <= millisecond) {
      var latestCacheId = getPropertyCacheIdForMillisecond(this, millisecond);
      var propertiesToInterpolate =
          this._timelinePropertyCaches[this._timelinePropertyCacheIndex[
          latestCacheId]];
      var interpolatedObject = {};

      _.each(propertiesToInterpolate, function (keyframeProperty, propName) {
        // TODO: Try to get rid of this null check
        if (keyframeProperty) {
          if (this._beforeKeyframePropertyInterpolate !== noop) {
            this._beforeKeyframePropertyInterpolate(keyframeProperty);
          }

          interpolatedObject[propName] =
              keyframeProperty.getValueAt(millisecond);

          if (this._afterKeyframePropertyInterpolate !== noop) {
            this._afterKeyframePropertyInterpolate(
                keyframeProperty, interpolatedObject);
          }
        }
      }, this);

      this.set(interpolatedObject);
    }

    return this;
  };

  /*!
   * @param {Rekapi.KeyframeProperty} keyframeProperty
   * @abstract
   */
  Actor.prototype._beforeKeyframePropertyInterpolate = noop;

  /*!
   * @param {Rekapi.KeyframeProperty} keyframeProperty
   * @param {Object} interpolatedObject
   * @abstract
   */
  Actor.prototype._afterKeyframePropertyInterpolate = noop;

  /**
   * Export a serializable `Object` of this `Actor`'s timeline property tracks and [`Rekapi.KeyframeProperty`](rekapi.keyframeprops.js.html)s.
   *
   * __[Example](../../../../docs/examples/actor_export_timeline.html)__
   * @return {Object}
   */
  Actor.prototype.exportTimeline = function () {
    var exportData = {
      'start': this.getStart()
      ,'end': this.getEnd()
      ,'trackNames': this.getTrackNames()
      ,'propertyTracks': {}
    };

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var trackAlias = exportData.propertyTracks[trackName] = [];
      _.each(propertyTrack, function (keyframeProperty) {
        trackAlias.push(keyframeProperty.exportPropertyData());
      });
    });

    return exportData;
  };

  /**
   * Import an `Object` to augment this actor's state.  Does not remove keyframe properties before importing new ones, so this could be used to "merge" keyframes across multiple actors.
   *
   * @param {Object} actorData Any object that has the same data format as the object generated from Actor#exportTimeline.
   */
  Actor.prototype.importTimeline = function (actorData) {
    _.each(actorData.propertyTracks, function (propertyTrack) {
      _.each(propertyTrack, function (property) {
        var obj = {};
        obj[property.name] = property.value;
        this.keyframe(property.millisecond, obj, property.easing);
      }, this);
    }, this);
  };

});

rekapiModules.push(function (context) {

  'use strict';

  var DEFAULT_EASING = 'linear';
  var Rekapi = context.Rekapi;
  var Tweenable = Rekapi.Tweenable;
  var _ = Rekapi._;
  var interpolate = Tweenable.interpolate;

  /**
   * Represents an individual component of a `Rekapi.Actor`'s keyframe state.  In many cases you won't need to deal with this directly, `Rekapi.Actor` abstracts a lot of what this Object does away for you.
   *
   * __[Example](../../../../docs/examples/keyprop.html)__
   * @param {Rekapi.Actor} ownerActor The Actor to which this KeyframeProperty is associated.
   * @param {number} millisecond Where in the animation this KeyframeProperty lives.
   * @param {string} name The property's name, such as "x" or "opacity."
   * @param {number|string} value The value of `name`.  This is the value to animate to.
   * @param {string=} opt_easing The easing at which to animate to `value`.  Defaults to linear.
   * @constructor
   */
  Rekapi.KeyframeProperty = function (
      ownerActor, millisecond, name, value, opt_easing) {
    this.id = _.uniqueId('keyframeProperty_');
    this.ownerActor = ownerActor;
    this.millisecond = millisecond;
    this.name = name;
    this.value = value;
    this.easing = opt_easing || DEFAULT_EASING;
    this.nextProperty = null;

    return this;
  };
  var KeyframeProperty = Rekapi.KeyframeProperty;

  /**
   * Modify a `KeyframeProperty`.  Any of the following are valid properties of `newProperties` and correspond to the formal parameters of `Rekapi.KeyframeProperty`:
   *
   * - _millisecond_ (__number__)
   * - _easing_ (__string__)
   * - _value_ (__number,string__)
   *
   * __[Example](../../../../docs/examples/keyprop_modify_with.html)__
   * @param {Object} newProperties
   */
  KeyframeProperty.prototype.modifyWith = function (newProperties) {
    var modifiedProperties = {};

    _.each(['millisecond', 'easing', 'value'], function (str) {
      modifiedProperties[str] = typeof(newProperties[str]) === 'undefined' ?
          this[str] : newProperties[str];
    }, this);

    _.extend(this, modifiedProperties);
  };

  /**
   * Create the reference to the next KeyframeProperty in an `Actor`'s `KeyframeProperty` track.  Tracks are linked lists of `Rekapi.KeyframeProperty`s.
   *
   * __[Example](../../../../docs/examples/keyprop_link_to_next.html)__
   * @param {KeyframeProperty} nextProperty The KeyframeProperty that immediately follows this one in an animation.
   */
  KeyframeProperty.prototype.linkToNext = function (nextProperty) {
    this.nextProperty = nextProperty || null;
  };

  /**
   * Calculate the midpoint between this `Rekapi.KeyframeProperty` and the next `Rekapi.KeyframeProperty` in a `Rekapi.Actor`'s `Rekapi.KeyframeProperty` track.
   *
   * __[Example](../../../../docs/examples/keyprop_get_value_at.html)__
   * @param {number} millisecond The point in the animation to compute.
   * @return {number}
   */
  KeyframeProperty.prototype.getValueAt = function (millisecond) {
    var fromObj = {};
    var toObj = {};
    var value;

    if (this.nextProperty) {
      fromObj[this.name] = this.value;
      toObj[this.name] = this.nextProperty.value;
      var delta = this.nextProperty.millisecond - this.millisecond;
      var interpolatedPosition = (millisecond - this.millisecond) / delta;
      value = interpolate(fromObj, toObj, interpolatedPosition,
          this.nextProperty.easing)[this.name];
    } else {
      value =  this.value;
    }

    return value;
  };

  /**
   * Export a serializable `Object` of this `Rekapi.KeyframeProperty`'s state data.
   *
   * __[Example](../../../../docs/examples/keyprop_export_property_data.html)__
   * @return {Object}
   */
  KeyframeProperty.prototype.exportPropertyData = function () {
    return {
     'millisecond': this.millisecond
     ,'name': this.name
     ,'value': this.value
     ,'easing': this.easing
    };
  };

});

rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;

  // PRIVATE UTILITY FUNCTIONS
  //

  /*!
   * Gets (and optionally sets) height or width on a canvas.
   * @param {HTMLCanvas} context
   * @param {string} heightOrWidth The dimension (either "height" or "width")
   * to get or set.
   * @param {number} opt_newSize The new value to set for `dimension`.
   * @return {number}
   */
  function dimension (context, heightOrWidth, opt_newSize) {
    var canvas = context.canvas;

    if (typeof opt_newSize !== 'undefined') {
      canvas[heightOrWidth] = opt_newSize;
      canvas.style[heightOrWidth] = opt_newSize + 'px';
    }

    return canvas[heightOrWidth];
  }

  /*!
   * Takes care of some pre-rendering tasks for canvas animations.
   * @param {Rekapi}
   */
  function beforeRender (rekapi) {
    rekapi.canvas.clear();
  }

  /*!
   * Render all the `Actor`s at whatever position they are currently in.
   * @param {Rekapi}
   * @return {Rekapi}
   */
  function render (rekapi) {
    fireEvent(rekapi, 'beforeRender', _);
    var len = rekapi.canvas._renderOrder.length;
    var renderOrder;

    if (rekapi.canvas._renderOrderSorter) {
      var orderedActors =
          _.sortBy(rekapi.canvas._canvasActors, rekapi.canvas._renderOrderSorter);
      renderOrder = _.pluck(orderedActors, 'id');
    } else {
      renderOrder = rekapi.canvas._renderOrder;
    }

    var currentActor, canvas_context;

    var i;
    for (i = 0; i < len; i++) {
      currentActor = rekapi.canvas._canvasActors[renderOrder[i]];
      canvas_context = currentActor.context;
      currentActor.render(canvas_context, currentActor.get());
    }
    fireEvent(rekapi, 'afterRender', _);

    return rekapi;
  }

  /*!
   * @param {Rekapi} rekapi
   * @param {Rekapi.Actor} actor
   */
  function addActor (rekapi, actor) {
    if (actor instanceof Rekapi.CanvasActor) {
      rekapi.canvas._renderOrder.push(actor.id);
      rekapi.canvas._canvasActors[actor.id] = actor;
    }
  }

  /*!
   * @param {Rekapi} rekapi
   * @param {Rekapi.Actor} actor
   */
  function removeActor (rekapi, actor) {
    if (actor instanceof Rekapi.CanvasActor) {
      rekapi.canvas._renderOrder = _.without(rekapi.canvas._renderOrder, actor.id);
      delete rekapi.canvas._canvasActors[actor.id];
    }
  }

  /*!
   * Sets up an instance of CanvasRenderer and attaches it to a `Rekapi`
   * instance.  Also augments the Rekapi instance with canvas-specific
   * functions.
   */
  Rekapi._contextInitHook.canvas = function () {
    if (typeof this.context.getContext === 'undefined') {
      return;
    }

    // Overwrite this.context to reference the canvas drawing context directly.
    // The original element is still accessible via this.context.canvas.
    this.context = this.context.getContext('2d');

    this.canvas = new CanvasRenderer(this);

    _.extend(this._events, {
      'beforeRender': []
      ,'afterRender': []
    });

    this.on('afterUpdate', render);
    this.on('addActor', addActor);
    this.on('removeActor', removeActor);
    this.on('beforeRender', beforeRender);
  };

  // CANVAS RENDERER OBJECT
  //

  /**
   * You can use Rekapi to render to an HTML5 `<canvas>`.  The Canvas renderer does a few things:
   *
   *   1. It subclasses `Rekapi.Actor` as `Rekapi.CanvasActor`.
   *   2. If the  `Rekapi` constructor is given a `<canvas>` as a `context`, the Canvas renderer attaches an instance of `Rekapi.CanvasRenderer` to the `Rekapi` instance, named `canvas`, at initialization time.  So:
   * ```
   * // With the Rekapi Canvas renderer loaded
   * var rekapi = new Rekapi(document.createElement('canvas'));
   * rekapi.canvas instanceof Rekapi.CanvasRenderer; // true
   * ```
   *   3. It maintains a layer list that defines the render order for [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s.
   *
   * __Note:__ This `Rekapi.CanvasRenderer` constructor is called for you automatically - there is no need to call it explicitly.
   *
   * The Canvas renderer adds some new events you can bind to with [`Rekapi#on`](../../src/rekapi.core.js.html#on) (and unbind from with [`Rekapi#off`](../../src/rekapi.core.js.html#off)).
   *
   *  - __beforeRender__: Fires just before an actor is rendered to the screen.
   *  - __afterRender__: Fires just after an actor is rendered to the screen.
   *
   * @param {Rekapi} rekapi
   * @constructor
   */
  Rekapi.CanvasRenderer = function (rekapi) {
    this.rekapi = rekapi;
    this._renderOrder = [];
    this._renderOrderSorter = null;
    this._canvasActors = {};
    return this;
  };
  var CanvasRenderer = Rekapi.CanvasRenderer;

  /**
   * Get and optionally set the height of the associated `<canvas>` element.
   *
   * @param {number} opt_height
   * @return {number}
   */
  CanvasRenderer.prototype.height = function (opt_height) {
    return dimension(this.rekapi.context, 'height', opt_height);
  };

  /**
   * Get and optionally set the width of the associated `<canvas>` element.
   *
   * @param {number} opt_width
   * @return {number}
   */
  CanvasRenderer.prototype.width = function (opt_width) {
    return dimension(this.rekapi.context, 'width', opt_width);
  };

  /**
   * Erase the `<canvas>`.
   *
   * @return {Rekapi}
   */
  CanvasRenderer.prototype.clear = function () {
    this.rekapi.context.clearRect(0, 0, this.width(), this.height());

    return this.rekapi;
  };

  /**
   * Move a [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html) around in the layer list.  Each layer has one [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html), and [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s are rendered in order of their layer.  Lower layers (starting with 0) are rendered earlier.  If `layer` is higher than the number of layers (which can be found with [`actorCount`](../../src/rekapi.core.js.html#actorCount)) or lower than 0, this method will return `undefined`.  Otherwise `actor` is returned.
   *
   * __[Example](../../../../docs/examples/canvas_move_actor_to_layer.html)__
   * @param {Rekapi.Actor} actor
   * @param {number} layer
   * @return {Rekapi.Actor|undefined}
   */
  CanvasRenderer.prototype.moveActorToLayer = function (actor, layer) {
    if (layer < this._renderOrder.length) {
      this._renderOrder = _.without(this._renderOrder, actor.id);
      this._renderOrder.splice(layer, 0, actor.id);

      return actor;
    }

    return;
  };

  /**
   * Set a function that defines the render order of the [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s.  This is called each frame before the [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s are rendered.  The following example assumes that all [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s are circles that have a `radius` [`Rekapi.KeyframeProperty`](../../src/rekapi.keyframeprops.js.html).  The circles will be rendered in order of the value of their `radius`, from smallest to largest.  This has the effect of layering larger circles on top of smaller circles, giving a sense of perspective.
   *
   * ```
   * rekapi.canvas.setOrderFunction(function (actor) {
   *   return actor.get().radius;
   * });
   * ```
   * @param {function(Rekapi.Actor,number)} sortFunction
   * @return {Rekapi}
   */
  CanvasRenderer.prototype.setOrderFunction = function (sortFunction) {
    this._renderOrderSorter = sortFunction;
    return this.rekapi;
  };

  /**
   * Remove the sort order function set by [`setOrderFunction`](#setOrderFunction).  Render order defaults back to the order in which [`Rekapi.CanvasActor`](rekapi.canvas.actor.js.html)s were added.
   *
   * __[Example](../../../../docs/examples/canvas_unset_order_function.html)__
   * @return {Rekapi}
   */
  CanvasRenderer.prototype.unsetOrderFunction = function () {
    this._renderOrderSorter = null;
    return this.rekapi;
  };

});

rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;

  /**
   * Constructor for rendering Actors to a `<canvas>`.  Extends [`Rekapi.Actor`](../../src/rekapi.actor.js.html).  Valid options for `opt_config` are the same as those for [`Rekapi.Actor`](../../src/rekapi.actor.js.html), with the following additions:
   *
   *  - __render__ _(function(CanvasRenderingContext2D, Object))_: A function that renders something to a canvas.
   * @param {Object=} opt_config
   * @constructor
   */
  Rekapi.CanvasActor = function (opt_config) {
    Rekapi.Actor.call(this, opt_config);

    opt_config = opt_config || {};
    this.render = opt_config.render || noop;

    return this;
  };
  var CanvasActor = Rekapi.CanvasActor;

  function CanvasActorMethods () {}
  CanvasActorMethods.prototype = Rekapi.Actor.prototype;
  CanvasActor.prototype = new CanvasActorMethods();

  /**
   * Move this `Rekapi.CanvasActor` to a different layer in the `Rekapi` instance that it belongs to.  This returns `undefined` if the operation was unsuccessful.  This is just a wrapper for [moveActorToLayer](rekapi.canvas.context.js.html#moveActorToLayer).
   * @param {number} layer
   * @return {Rekapi.Actor|undefined}
   */
  CanvasActor.prototype.moveToLayer = function (layer) {
    return this.rekapi.canvas.moveActorToLayer(this, layer);
  };
});

rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;
  var vendorTransforms = [
    'transform'
    ,'webkitTransform'
    ,'MozTransform'
    ,'oTransform'
    ,'msTransform'];
  var transformFunctions = [
    'translateX',
    'translateY',
    'scale',
    'scaleX',
    'scaleY',
    'rotate',
    'skewX',
    'skewY'];

  function setStyle (forElement, styleName, styleValue) {
    forElement.style[styleName] = styleValue;
  }

  /*!
   * @param {string} name A transform function name
   * @return {boolean}
   */
  function isTransformFunction (name) {
    return _.contains(transformFunctions, name);
  }

  /*!
   * Builds a concatenated string of given transform property values in order.
   *
   * @param {Array.<string>} orderedFunctions Array of ordered transform
   *     function names
   * @param {Object} transformProperties Transform properties to build together
   * @return {string}
   */
  function buildTransformValue (orderedFunctions, transformProperties) {
    var transformComponents = [];

    _.each(orderedFunctions, function(functionName) {
      if (transformProperties[functionName]) {
        transformComponents.push(functionName + '(' +
          transformProperties[functionName] + ')');
      }
    });

    return transformComponents.join(' ');
  }

  /*!
   * Sets value for all vendor prefixed transform properties on a given context
   *
   * @param {Object} context The actor's DOM context
   * @param {string} transformValue The transform style value
   */
  function setTransformStyles (context, transformValue) {
    _.each(vendorTransforms, function(prefixedTransform) {
      setStyle(context, prefixedTransform, transformValue);
    });
  }

  /**
   * `Rekapi.DOMActor` is a subclass of [`Rekapi.Actor`](../../src/rekapi.actor.js.html).  Please note that `Rekapi.DOMActor` accepts `opt_config` as the second parameter, not the first.  Instantiate a `Rekapi.DOMActor` with an `HTMLElement`, and then add it to the animation:
   *
   * ```
   * var rekapi = new Rekapi();
   * var actor = new Rekapi.DOMActor(document.getElementById('actor'));
   *
   * rekapi.addActor(actor);
   * ```
   *
   * Now you can keyframe `actor` like you would any Actor.
   *
   * ```
   * actor
   *   .keyframe(0, {
   *     'left': '0px'
   *     ,'top': '0px'
   *   })
   *   .keyframe(1500, {
   *     'left': '200px'
   *     ,'top': '200px'
   *   }, 'easeOutExpo');
   *
   * rekapi.play();
   * ```
   *
   * ## Transforms
   *
   * `Rekapi.DOMActor` supports CSS3 transforms as keyframe properties. Here's an example:
   *
   * ```
   * actor
   *   .keyframe(0, {
   *     'translateX': '0px'
   *     ,'translateY': '0px'
   *     ,'rotate': '0deg'
   *   })
   *   .keyframe(1500, {
   *     'translateX': '200px'
   *     ,'translateY': '200px'
   *     ,'rotate': '90deg'
   *   }, 'easeOutExpo');
   * ```
   *
   * The list of supported transforms is: `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`, `skewX`, `skewY`.
   *
   * Internally, this builds a CSS3 `transform` rule that gets applied to the `Rekapi.DOMActor`'s DOM node on each animation update.
   *
   * Typically, when writing a `transform` rule, it is necessary to write the same rule multiple times, in order to support the vendor prefixes for all of the browser rendering engines. `Rekapi.DOMActor` takes care of the cross browser inconsistencies for you.
   *
   * You can also use the `transform` property directly:
   *
   * ```
   * actor
   *   .keyframe(0, {
   *     'transform': 'translateX(0px) translateY(0px) rotate(0deg)'
   *   })
   *   .keyframe(1500, {
   *     'transform': 'translateX(200px) translateY(200px) rotate(90deg)'
   *   }, 'easeOutExpo');
   * ```
   * @param {HTMLElement} element
   * @param {Object} opt_config
   * @constructor
   */
  Rekapi.DOMActor = function (element, opt_config) {
    Rekapi.Actor.call(this, opt_config);
    this.context = element;
    var className = this.getCSSName();

    // Add the class if it's not already there.
    // Using className instead of classList to make IE happy.
    if (!this.context.className.match(className)) {
      this.context.className += ' ' + className;
    }

    this._transformOrder = transformFunctions.slice(0);

    // Remove the instance's update method to allow the DOMActor.prototype
    // methods to be accessible.
    delete this.update;
    delete this.teardown;

    return this;
  };
  var DOMActor = Rekapi.DOMActor;

  function DOMActorMethods () {}
  DOMActorMethods.prototype = Rekapi.Actor.prototype;
  DOMActor.prototype = new DOMActorMethods();

  /*!
   * @param {HTMLElement} context
   * @param {Object} state
   * @override
   */
  DOMActor.prototype.update = function (context, state) {
    var propertyNames = _.keys(state);
    // TODO:  Optimize the following code so that propertyNames is not looped
    // over twice.
    var transformFunctionNames = _.filter(propertyNames, isTransformFunction);
    var otherPropertyNames = _.reject(propertyNames, isTransformFunction);
    var otherProperties = _.pick(state, otherPropertyNames);

    if (transformFunctionNames.length) {
      var transformProperties = _.pick(state, transformFunctionNames);
      var builtStyle = buildTransformValue(this._transformOrder,
          transformProperties);
      setTransformStyles(context, builtStyle);
    } else if (state.transform) {
      setTransformStyles(context, state.transform);
    }

    _.each(otherProperties, function (styleValue, styleName) {
      setStyle(context, styleName, styleValue);
    }, this);
  };

  /*!
   * transform properties like translate3d and rotate3d break the cardinality
   * of multi-ease easing strings, because the "3" gets treated like a
   * tweenable value.  Transform "3d(" to "__THREED__" to prevent this, and
   * transform it back in _afterKeyframePropertyInterpolate.
   *
   * @param {Rekapi.KeyframeProperty} keyframeProperty
   * @override
   */
  DOMActor.prototype._beforeKeyframePropertyInterpolate =
      function (keyframeProperty) {
    if (keyframeProperty.name !== 'transform') {
      return;
    }

    var value = keyframeProperty.value;
    var nextProp = keyframeProperty.nextProperty;

    if (nextProp && value.match(/3d\(/g)) {
      keyframeProperty.value = value.replace(/3d\(/g, '__THREED__');
      nextProp.value = nextProp.value.replace(/3d\(/g, '__THREED__');
    }
  };

  /*!
   * @param {Rekapi.KeyframeProperty} keyframeProperty
   * @param {Object} interpolatedObject
   * @override
   */
  DOMActor.prototype._afterKeyframePropertyInterpolate =
      function (keyframeProperty, interpolatedObject) {
    if (keyframeProperty.name !== 'transform') {
      return;
    }

    var value = keyframeProperty.value;
    var nextProp = keyframeProperty.nextProperty;

    if (nextProp && value.match(/__THREED__/g)) {
      keyframeProperty.value = value.replace(/__THREED__/g, '3d(');
      nextProp.value = nextProp.value.replace(/__THREED__/g, '3d(');
      var keyPropName = keyframeProperty.name;
      interpolatedObject[keyPropName] =
          interpolatedObject[keyPropName].replace(/__THREED__/g, '3d(');
    }
  };

  // TODO:  Make this a private method.
  DOMActor.prototype.teardown = function (context, state) {
    var classList = this.context.className.match(/\S+/g);
    var sanitizedClassList = _.without(classList, this.getCSSName());
    this.context.className = sanitizedClassList;
  };

  /**
   * This can be useful when used with [toCSS](../to-css/rekapi.to-css.js.html).  You might not ever need to use this directly, as the class is attached to an element when you create a `Rekapi.DOMActor` from said element.
   * @return {string}
   */
  DOMActor.prototype.getCSSName = function () {
    return 'actor-' + this.id;
  };

  /**
   * Overrides the default transform function order.
   *
   * @param {Array} orderedFunctions The Array of transform function names
   * @return {Rekapi.DOMActor}
   */
  DOMActor.prototype.setTransformOrder = function (orderedFunctions) {
    // TODO: Document this better...
    var unknownFunctions = _.reject(orderedFunctions, isTransformFunction);

    if (unknownFunctions.length) {
      throw 'Unknown or unsupported transform functions: ' +
        unknownFunctions.join(', ');
    }
    // Ignore duplicate transform function names in the array
    this._transformOrder = _.uniq(orderedFunctions);

    return this;
  };

});

rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;

  // CONSTANTS
  //

  var DEFAULT_FPS = 30;
  var TRANSFORM_TOKEN = 'TRANSFORM';
  var VENDOR_TOKEN = 'VENDOR';
  var VENDOR_PREFIXES = Rekapi.util.VENDOR_PREFIXES = {
    'microsoft': '-ms-'
    ,'mozilla': '-moz-'
    ,'opera': '-o-'
    ,'w3': ''
    ,'webkit': '-webkit-'
  };
  var BEZIERS = {
    linear: '.25,.25,.75,.75'
    ,easeInQuad: '.55,.085,.68,.53'
    ,easeInCubic: '.55,.055,.675,.19'
    ,easeInQuart: '.895,.03,.685,.22'
    ,easeInQuint: '.755,.05,.855,.06'
    ,easeInSine: '.47,0,.745,.715'
    ,easeInExpo: '.95,.05,.795,.035'
    ,easeInCirc: '.6,.04,.98, .335'
    ,easeOutQuad: '.25,.46,.45,.94'
    ,easeOutCubic: '.215,.61,.355,1'
    ,easeOutQuart: '.165,.84,.44,1'
    ,easeOutQuint: '.23,1,.32,1'
    ,easeOutSine: '.39,.575,.565,1'
    ,easeOutExpo: '.19,1,.22,1'
    ,easeOutCirc: '.075,.82,.165,1'
    ,easeInOutQuad: '.455,.03,.515,.955'
    ,easeInOutCubic: '.645,.045,.355,1'
    ,easeInOutQuart: '.77,0,.175,1'
    ,easeInOutQuint: '.86,0.07,1'
    ,easeInOutSine: '.445,.05,.55,.95'
    ,easeInOutExpo: '1,0,0,1'
    ,easeInOutCirc: '.785,.135,.15,.86'
  };

  // TEMPLATES
  //

  /*!
   * [0]: vendor
   * [1]: animation name
   * [2]: keyframes
   */
  var KEYFRAME_TEMPLATE = [
    '@%skeyframes %s-keyframes {'
    ,'%s'
    ,'}'
  ].join('\n');

  /*!
   * [0] class name
   * [1] class attributes
   */
  var CLASS_BOILERPLATE = [
    '.%s {'
    ,'%s'
    ,'}'
  ].join('\n');

  // PROTOTYPE EXTENSIONS
  //

  /**
   * With `toCSS`, Rekapi can export your animations as CSS `@keyframes`.  `toCSS` depends on [`Rekapi.DOMActor`](../dom/rekapi.dom.actor.js.html).  This function only builds and returns a string of CSS, it has no other side effects.  To actually run a CSS `@keyframe` animation, see [`CSSRenderer`](/dist/doc/ext/css-animate/rekapi.css-animate.context.js.html#CSSRenderer) (which wraps this function).
   *
   * ## Exporting
   *
   * To create a CSS string:
   *
   * ```
   * var container = document.getElementById('container');
   * var animation = new Rekapi(container);
   *
   * var css = animation.toCSS();
   * ```
   *
   * Remember, all `toCSS` does is render a string.  The most useful thing to do with this string is to stick it into a `<style>` element somewhere on your page.  Continuing from  above:
   *
   * ```
   * var style = document.createElement('style');
   * style.innerHTML = css;
   * document.head.appendChild(style);
   * ```
   *
   * Please be aware that [`CSSRenderer`](/dist/doc/ext/css-animate/rekapi.css-animate.context.js.html#CSSRenderer) makes this process much simpler.
   *
   * ## `opts`
   *
   * You can specify some parameters for your CSS animation.  They are all optional. Just supply them in the `opts` parameter when calling `toCSS`:
   *
   *  - __vendors__ _(Array)_: Defaults to `['w3']`.  The browser vendors you want this CSS to support. Valid values are:
   *    - `'microsoft'`
   *    - `'mozilla'`
   *    - `'opera'`
   *    - `'w3'`
   *    - `'webkit'`
   *  - __fps__ _(number)_: Defaults to 30.  Defines the "resolution" of an exported animation.  CSS `@keyframes` are comprised of a series of explicitly defined keyframe steps, and more steps will allow for a more complex animation.  More steps will also result in a larger CSS string, and more time needed to generate the string.  There's no reason to go beyond 60, as the human eye cannot perceive motion smoother than that.
   *  - __name__ _(string)_: Define a custom name for your animation.  This becomes the class name targeted by the generated CSS.  If omitted, the value is the same as the CSS class that was added when the DOM element was used to initialize its `Rekapi.DOMActor`.
   *  - __isCentered__ _(boolean)_: If `true`, the generated CSS will contain `transform-origin: 0 0;`, which centers the DOM element along the path of motion.  If `false` or omitted, no `transform-origin` rule is specified and the element is aligned to the path of motion with its top-left corner.
   *  - __iterations__ _(number)_: How many times the generated animation should repeat.  If omitted, the animation will loop indefinitely.
   *
   * @param {Object} opts
   * @return {string}
   */
  Rekapi.prototype.toCSS = function (opts) {
    opts = opts || {};
    var animationCSS = [];

    _.each(this.getAllActors(), function (actor) {
      if (actor instanceof Rekapi.DOMActor) {
        animationCSS.push(actor.toCSS(opts));
      }
    });

    return animationCSS.join('\n');
  };

  /*!
   * Exports the CSS `@keyframes` for an individual Actor.
   * @param {Object} opts Same as opts for Rekapi.prototype.toCSS.
   * @return {string}
   */
  Rekapi.Actor.prototype.toCSS = function (opts) {
    opts = opts || {};
    var actorCSS = [];
    var animName = opts.name || this.getCSSName();
    var fps = opts.fps || DEFAULT_FPS;
    var steps = Math.ceil((this.rekapi.animationLength() / 1000) * fps);
    var combineProperties = !canOptimizeAnyKeyframeProperties(this);
    var actorClass = generateCSSClass(
        this, animName, combineProperties, opts.vendors, opts.iterations,
        opts.isCentered);
    var boilerplatedKeyframes = generateBoilerplatedKeyframes(
        this, animName, steps, combineProperties, opts.vendors);

    actorCSS.push(actorClass);
    actorCSS.push(boilerplatedKeyframes);

    return actorCSS.join('\n');
  };

  // UTILITY FUNCTIONS
  //

  /*!
   * @param {string} formatter
   * @param {[string]} args
   * @return {string}
   */
  var printf = Rekapi.util.printf = function (formatter, args) {
    var composedStr = formatter;
    _.each(args, function (arg) {
      composedStr = composedStr.replace('%s', arg);
    });

    return composedStr;
  };

  /*!
   * http://stackoverflow.com/a/3886106
   *
   * @param {number} number
   */
  function isInt (number) {
    return number % 1 === 0;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} animName
   * @param {number} steps
   * @param {boolean} combineProperties
   * @param {Array.<string>=} opt_vendors
   * @return {string}
   */
  function generateBoilerplatedKeyframes (
      actor, animName, steps, combineProperties, opt_vendors) {

    var trackNames = actor.getTrackNames();
    var cssTracks = [];

    if (combineProperties) {
      cssTracks.push(generateCombinedActorKeyframes(actor, steps));
    } else {
      _.each(trackNames, function (trackName) {
        cssTracks.push(
          generateActorKeyframes(actor, steps, trackName));
      });
    }

    var boilerplatedKeyframes = [];

    if (combineProperties) {
      boilerplatedKeyframes.push(applyVendorBoilerplates(
        cssTracks[0], (animName), opt_vendors));
    } else {
      _.each(trackNames, function (trackName, i) {
        boilerplatedKeyframes.push(applyVendorBoilerplates(
          cssTracks[i], (animName + '-' + trackName), opt_vendors));
      });
    }

    boilerplatedKeyframes = boilerplatedKeyframes.join('\n');

    return boilerplatedKeyframes;
  }

  /*!
   * @param {string} toKeyframes Generated keyframes to wrap in boilerplates
   * @param {string} animName
   * @param {Array.<string>} opt_vendors Vendor boilerplates to be applied.
   *     Should be any of the values in Rekapi.util.VENDOR_PREFIXES.
   * @return {string}
   */
  function applyVendorBoilerplates (toKeyframes, animName, opt_vendors) {
    opt_vendors = opt_vendors || ['w3'];
    var renderedKeyframes = [];

    _.each(opt_vendors, function (vendor) {
      var renderedChunk = printf(KEYFRAME_TEMPLATE,
          [VENDOR_PREFIXES[vendor], animName, toKeyframes]);
      var prefixedKeyframes =
          applyVendorPropertyPrefixes(renderedChunk, vendor);
      renderedKeyframes.push(prefixedKeyframes);
    });

    return renderedKeyframes.join('\n');
  }

  /*!
   * @param {string} keyframes
   * @param {vendor} vendor
   * @return {string}
   */
  function applyVendorPropertyPrefixes (keyframes, vendor) {
    var transformRegExp = new RegExp(TRANSFORM_TOKEN, 'g');
    var prefixedTransformKey = VENDOR_PREFIXES[vendor] + 'transform';
    var generalPrefixRegExp = new RegExp(VENDOR_TOKEN, 'g');
    var generalPrefixedKey = VENDOR_PREFIXES[vendor];
    var prefixedKeyframes = keyframes
        .replace(generalPrefixRegExp, generalPrefixedKey)
        .replace(transformRegExp, prefixedTransformKey);

    return prefixedKeyframes;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} animName
   * @param {boolean} combineProperties
   * @param {Array.<string>=} opt_vendors
   * @param {number|string=} opt_iterations
   * @param {boolean=} opt_isCentered
   * @return {string}
   */
  function generateCSSClass (
      actor, animName, combineProperties, opt_vendors, opt_iterations,
      opt_isCentered) {

    opt_vendors = opt_vendors || ['w3'];
    var classAttrs = [];
    var vendorAttrs;

    _.each(opt_vendors, function (vendor) {
      vendorAttrs = generateCSSAnimationProperties(
          actor, animName, vendor, combineProperties, opt_iterations,
          opt_isCentered);
      classAttrs.push(vendorAttrs);
    });

    var boilerplatedClass = printf(CLASS_BOILERPLATE
        ,[animName, classAttrs.join('\n')]);

    return boilerplatedClass;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} animName
   * @param {string} vendor
   * @param {boolean} combineProperties
   * @param {number|string=} opt_iterations
   * @param {boolean=} opt_isCentered
   * @return {string}
   */
  function generateCSSAnimationProperties (
      actor, animName, vendor, combineProperties, opt_iterations, opt_isCentered) {
    var generatedProperties = [];
    var prefix = VENDOR_PREFIXES[vendor];

    generatedProperties.push(generateAnimationNameProperty(
          actor, animName, prefix, combineProperties));
    generatedProperties.push(
        generateAnimationDurationProperty(actor, prefix));
    generatedProperties.push(generateAnimationDelayProperty(actor, prefix));
    generatedProperties.push(generateAnimationFillModeProperty(prefix));
    generatedProperties.push(generateAnimationTimingFunctionProperty(prefix));
    generatedProperties.push(generateAnimationIterationProperty(
        actor.rekapi, prefix, opt_iterations));

    if (opt_isCentered) {
      generatedProperties.push(generateAnimationCenteringRule(prefix));
    }

    return generatedProperties.join('\n');
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} animName
   * @param {string} prefix
   * @param {boolean} combineProperties
   * @return {string}
   */
  function generateAnimationNameProperty (
      actor, animName, prefix, combineProperties) {

    var animationName = printf('  %sanimation-name:', [prefix]);

    var tracks = actor.getTrackNames();

    if (combineProperties) {
      animationName += printf(' %s-keyframes;', [animName]);
    } else {
      _.each(tracks, function (trackName) {
        animationName += printf(' %s-%s-keyframes,', [animName, trackName]);
      });
      animationName = animationName.slice(0, animationName.length - 1);
      animationName += ';';
    }

    return animationName;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} animName
   * @return {string}
   */
  function generateAnimationDurationProperty (actor, prefix) {
    return printf('  %sanimation-duration: %sms;'
        ,[prefix, actor.getEnd() - actor.getStart()]);
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {number|string} delay
   * @return {string}
   */
  function generateAnimationDelayProperty (actor, prefix) {
    return printf('  %sanimation-delay: %sms;', [prefix, actor.getStart()]);
  }

  /*!
   * @param {string} prefix
   * @return {string}
   */
  function generateAnimationFillModeProperty (prefix) {
    return printf('  %sanimation-fill-mode: forwards;', [prefix]);
  }

  /*!
   * @param {string} prefix
   * @return {string}
   */
  function generateAnimationTimingFunctionProperty (prefix) {
    return printf('  %sanimation-timing-function: linear;', [prefix]);
  }

  /*!
   * @param {Rekapi} rekapi
   * @param {string} prefix
   * @param {number|string} opt_iterations
   * @return {string}
   */
  function generateAnimationIterationProperty (rekapi, prefix, opt_iterations) {
    var iterationCount;
    if (opt_iterations) {
      iterationCount = opt_iterations;
    } else {
      iterationCount = rekapi._timesToIterate === -1
        ? 'infinite'
        : rekapi._timesToIterate;
    }

    var ruleTemplate = '  %sanimation-iteration-count: %s;';

    return printf(ruleTemplate, [prefix, iterationCount]);
  }

  /*!
   * @param {string} prefix
   * @return {string}
   */
  function generateAnimationCenteringRule (prefix) {
    return printf('  %stransform-origin: 0 0;', [prefix]);
  }

  // OPTIMIZED GENERATOR FUNCTIONS
  //

  /*!
   * @param {Rekapi.KeyframeProperty} property
   * @return {boolean}
   */
  function canOptimizeKeyframeProperty (property) {
    var canOptimize = false;

    if (property.nextProperty) {
      var easingChunks = property.nextProperty.easing.split(' ');

      var i = 0, len = easingChunks.length;
      var previousChunk = easingChunks[0];
      var currentChunk;
      for (i; i < len; i++) {
        currentChunk = easingChunks[i];
        if (!(BEZIERS[currentChunk])
            || previousChunk !== currentChunk) {
          canOptimize = false;
          break;
        } else {
          canOptimize = true;
        }

        previousChunk = currentChunk;
      }
    }

    return canOptimize;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @return {boolean}
   */
  function canOptimizeAnyKeyframeProperties (actor) {
    return _.any(actor._keyframeProperties, canOptimizeKeyframeProperty);
  }

  /*!
   * @param {Rekapi.KeyframeProperty} property
   * @param {number} fromPercent
   * @param {number} toPercent
   * @return {string}
   */
  function generateOptimizedKeyframeSegment (
      property, fromPercent, toPercent) {

    var accumulator = [];
    var generalName = property.name;

    if (property.name === 'transform') {
      generalName = TRANSFORM_TOKEN;
    }

    var easingFormula = BEZIERS[property.nextProperty.easing.split(' ')[0]];
    var timingFnChunk = printf('cubic-bezier(%s)', [easingFormula]);

    var adjustedFromPercent = isInt(fromPercent) ?
        fromPercent : fromPercent.toFixed(2);
    var adjustedToPercent = isInt(toPercent) ?
        toPercent : toPercent.toFixed(2);

    accumulator.push(printf('  %s% {%s:%s;%sanimation-timing-function: %s;}',
          [adjustedFromPercent, generalName, property.value, VENDOR_TOKEN
          ,timingFnChunk]));
    accumulator.push(printf('  %s% {%s:%s;}',
          [adjustedToPercent, generalName, property.nextProperty.value]));

    return accumulator.join('\n');
  }

  // GENERAL-USE GENERATOR FUNCTIONS
  //

  /*!
   * @param {Rekapi.Actor} actor
   * @param {number} steps
   * @param {string} track
   * @return {string}
   */
  function generateActorKeyframes (actor, steps, track) {
    var accumulator = [];
    var actorEnd = actor.getEnd();
    var actorStart = actor.getStart();
    var actorLength = actor.getLength();
    var leadingWait = simulateLeadingWait(actor, track, actorStart);

    if (leadingWait) {
      accumulator.push(leadingWait);
    }

    var previousSegmentWasOptimized = false;
    _.each(actor._propertyTracks[track], function (prop, propName) {
      var fromPercent = calculateStepPercent(prop, actorStart, actorLength);
      var nextProp = prop.nextProperty;

      var toPercent, increments, incrementSize;
      if (nextProp) {
        toPercent = calculateStepPercent(nextProp, actorStart, actorLength);
        var delta = toPercent - fromPercent;
        increments = Math.floor((delta / 100) * steps) || 1;
        incrementSize = delta / increments;
      } else {
        toPercent = 100;
        increments = 1;
        incrementSize = 1;
      }

      var trackSegment;
      if (canOptimizeKeyframeProperty(prop)) {
        trackSegment = generateOptimizedKeyframeSegment(
            prop, fromPercent, toPercent);

        // If this and the previous segment are optimized, remove the
        // destination keyframe of the previous step.  The starting keyframe of
        // the newest segment makes it redundant.
        if (previousSegmentWasOptimized) {
          var accumulatorLength = accumulator.length;
          var previousTrackSegment = accumulator[accumulatorLength - 1];
          var optimizedPreviousTrackSegment =
              previousTrackSegment.split('\n')[0];
          accumulator[accumulatorLength - 1] = optimizedPreviousTrackSegment;
        }

        previousSegmentWasOptimized = true;
      } else {
        trackSegment = generateActorTrackSegment(
            actor, increments, incrementSize, actorStart, fromPercent, prop);

        if (previousSegmentWasOptimized) {
          trackSegment.shift();
        }

        if (trackSegment.length) {
          trackSegment = trackSegment.join('\n');
        }

        previousSegmentWasOptimized = false;
      }

      if (trackSegment.length) {
        accumulator.push(trackSegment);
      }
    });

    var trailingWait =
        simulateTrailingWait(actor, track, actorStart, actorEnd);

    if (trailingWait) {
      accumulator.push(trailingWait);
    }

    return accumulator.join('\n');
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {number} steps
   * @return {string}
   */
  function generateCombinedActorKeyframes (actor, steps) {
    return generateActorTrackSegment(
        actor, steps + 1, 100 / steps, 0, 0).join('\n');
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} track
   * @param {number} actorStart
   * @return {string|undefined}
   */
  function simulateLeadingWait (actor, track, actorStart) {
    var firstProp = actor._propertyTracks[track][0];

    if (firstProp.millisecond !== actorStart) {
      var fakeFirstProp = generateActorTrackSegment(
          actor, 1, 1, firstProp.millisecond, 0, firstProp);
      return fakeFirstProp.join('\n');
    }
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string} track
   * @param {number} actorStart
   * @param {number} actorEnd
   * @return {string|undefined}
   */
  function simulateTrailingWait (actor, track, actorStart, actorEnd) {
    var lastProp = _.last(actor._propertyTracks[track]);

    if (lastProp.millisecond !== actorEnd) {
      var fakeLastProp = generateActorTrackSegment(
          actor, 1, 1, actorStart, 100, lastProp);
      return fakeLastProp.join('\n');
    }
  }

  /*!
   * @param {Rekapi.KeyframeProperty} property
   * @param {number} actorStart
   * @param {number} actorLength
   * @return {number}
   */
  function calculateStepPercent (property, actorStart, actorLength) {
    return ((property.millisecond - actorStart) / actorLength) * 100;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {number} increments
   * @param {number} incrementSize
   * @param {number} actorStart
   * @param {number} fromPercent
   * @param {Rekapi.KeyframeProperty=} opt_fromProp
   * @return {Array.<string>}
   */
  function generateActorTrackSegment (
      actor, increments, incrementSize, actorStart, fromPercent,
      opt_fromProp) {

    var accumulator = [];
    var actorLength = actor.getLength();
    var i, adjustedPercent, stepPrefix;

    for (i = 0; i < increments; i++) {
      adjustedPercent = fromPercent + (i * incrementSize);
      actor.updateState(
          ((adjustedPercent / 100) * actorLength) + actorStart);
      stepPrefix = +adjustedPercent.toFixed(2) + '% ';

      if (opt_fromProp) {
        accumulator.push(
            '  ' + stepPrefix + serializeActorStep(actor, opt_fromProp.name));
      } else {
        accumulator.push('  ' + stepPrefix + serializeActorStep(actor));
      }
    }

    return accumulator;
  }

  /*!
   * @param {Rekapi.Actor} actor
   * @param {string=} opt_targetProp
   * @return {string}
   */
  function serializeActorStep (actor, opt_targetProp) {
    var serializedProps = ['{'];

    var propsToSerialize;
    if (opt_targetProp) {
      propsToSerialize = {};

      var currentPropState = actor.get()[opt_targetProp];
      if (typeof currentPropState !== 'undefined') {
        propsToSerialize[opt_targetProp] = currentPropState;
      }
    } else {
      propsToSerialize = actor.get();
    }

    var printVal;
    _.each(propsToSerialize, function (val, key) {
      printVal = val;
      var printKey = key;

      if (key === 'transform') {
        printKey = TRANSFORM_TOKEN;
      }

      serializedProps.push(printKey + ':' + printVal + ';');
    });

    serializedProps.push('}');
    return serializedProps.join('');
  }

  if (REKAPI_DEBUG) {
    Rekapi._private.toCSS = {
      'TRANSFORM_TOKEN': TRANSFORM_TOKEN
      ,'VENDOR_TOKEN': VENDOR_TOKEN
      ,'applyVendorBoilerplates': applyVendorBoilerplates
      ,'applyVendorPropertyPrefixes': applyVendorPropertyPrefixes
      ,'generateBoilerplatedKeyframes': generateBoilerplatedKeyframes
      ,'generateCSSClass': generateCSSClass
      ,'generateCSSAnimationProperties': generateCSSAnimationProperties
      ,'generateActorKeyframes': generateActorKeyframes
      ,'generateActorTrackSegment': generateActorTrackSegment
      ,'serializeActorStep': serializeActorStep
      ,'generateAnimationNameProperty': generateAnimationNameProperty
      ,'generateAnimationDurationProperty': generateAnimationDurationProperty
      ,'generateAnimationDelayProperty': generateAnimationDelayProperty
      ,'generateAnimationFillModeProperty': generateAnimationFillModeProperty
      ,'generateAnimationTimingFunctionProperty':
          generateAnimationTimingFunctionProperty
      ,'generateAnimationIterationProperty': generateAnimationIterationProperty
      ,'generateAnimationCenteringRule': generateAnimationCenteringRule
      ,'simulateLeadingWait': simulateLeadingWait
      ,'simulateTrailingWait': simulateTrailingWait
      ,'canOptimizeKeyframeProperty': canOptimizeKeyframeProperty
      ,'canOptimizeAnyKeyframeProperties': canOptimizeAnyKeyframeProperties
      ,'generateOptimizedKeyframeSegment': generateOptimizedKeyframeSegment
    };
  }

});

rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;
  var now = Rekapi.Tweenable.now;

  // CONSTANTS
  //

  // The timer to remove an injected style isn't likely to match the actual
  // length of the CSS animation, so give it some extra time to complete so it
  // doesn't cut off the end.
  var INJECTED_STYLE_REMOVAL_BUFFER_MS = 250;

  // PRIVATE UTILITY FUNCTIONS
  //

  Rekapi._contextInitHook.cssAnimate = function () {
    this.css = new CSSRenderer(this);
  };

  /*!
   * @return {string}
   */
  function getVendorPrefix () {
    var style = document.body.style;

    if ('-webkit-animation' in style) {
      return 'webkit';
    } else if ('-moz-animation' in style) {
      return 'mozilla';
    } else if ('-ms-animation' in style) {
      return 'microsoft';
    } else if ('-o-animation' in style) {
      return 'opera';
    } else if ('animation' in style) {
      return 'w3';
    }

    return '';
  }

  var styleID = 0;
  /*!
   * @param {string} css The css content that the <style> element should have.
   * @return {HTMLStyleElement} The unique ID of the injected <style> element.
   */
  function injectStyle (css) {
    var style = document.createElement('style');
    var id = 'rekapi-' + styleID++;
    style.id = id;
    style.innerHTML = css;
    document.head.appendChild(style);

    return style;
  }

  /*!
   * Fixes a really bizarre issue that only seems to affect Presto/Opera.  In
   * some situations, DOM nodes will not detect dynamically injected <style>
   * elements.  Explicitly re-inserting DOM nodes seems to fix the issue.  Not
   * sure what causes this issue.  Not sure why this fixes it.  Not sure if
   * this affects Blink-based Opera browsers.
   *
   * @param {Rekapi} rekapi
   */
  function forceStyleInjection (rekapi) {
    var dummyDiv = document.createElement('div');

    _.each(rekapi.getAllActors(), function (actor) {
      if (actor instanceof Rekapi.DOMActor) {
        var actorEl = actor.context;
        var actorElParent = actorEl.parentElement;

        actorElParent.replaceChild(dummyDiv, actorEl);
        actorElParent.replaceChild(actorEl, dummyDiv);
      }
    });

    dummyDiv = null;
  }

  // CSS RENDERER OBJECT
  //

  /**
   * The `CSSRenderer` module allows you to run a Rekapi animation as a CSS `@keyframe` animation.  Standard Rekapi animations are powered by JavaScript, but in many cases using CSS `@keyframes` is smoother.
   *
   * __Note!__ This is an experimental feature.  If you encounter any issues, please report them with the [Rekapi issue tracker](https://github.com/jeremyckahn/rekapi/issues?page=1&state=open).
   *
   * Advantages of playing an animation with CSS `@keyframes` instead of JavaScript:
   *
   *   - Smoother animations in modern browsers (particularly noticeable in Webkit and mobile browsers).
   *   - The JavaScript thread is freed from performing animation updates, resulting in more resources for other logic.
   *
   * Disadvantages of CSS `@keyframes`:
   *
   *   - No start/stop/goto control - once the animation runs, it runs from start to finish.
   *   - Prerending animations can take a non-trivial amount of time, so you may have to be clever with how to spend the cycles to do it.
   *   - Currently, no `Rekapi` [events](../../src/rekapi.core.js.html#on) can be bound to CSS animations.
   *
   * This module requires both the [`toCSS`](/dist/doc/ext/to-css/rekapi.to-css.js.html) and [`Rekapi.DOMActor`](/dist/doc/ext/dom/rekapi.dom.actor.js.html) modules (they are included in the standard Rekapi distribution).  Functionally, `CSSRenderer` works by prerendering a CSS animation and injecting it into the DOM.  You'll never have to call the `CSSRenderer` constructor explicitly, that is done for you when a Rekapi instance is initialized.
   *
   * An advantage of this module is that CSS animations are not always available, but JavaScript animations are.  Keyframes are defined the same way, but you can choose what method of animation is appropriate at runtime:
   *
   * ```
   *  var rekapi = new Rekapi();
   *  var actor = new Rekapi.DOMActor(document.getElementById('actor-1'));
   *
   *  rekapi.addActor(actor);
   *  actor.keyframe(0,    { left: '0px'   });
   *  actor.keyframe(1000, { left: '250px' }, 'easeOutQuad');
   *
   *  // Feature detect for @keyframe support
   *  if (rekapi.css.canAnimateWithCSS()) {
   *    rekapi.css.play();
   *  } else {
   *    rekapi.play();
   *  }
   * ```
   *
   * __[Example](/ext/css-animate/sample/play-many-actors.html)__
   *
   * @param {Rekapi} rekapi
   * @constructor
   */
  Rekapi.CSSRenderer = function (rekapi) {
    if (!Rekapi.DOMActor && !Rekapi.prototype.toCSS) {
      throw 'CSSRenderer requires the DOMActor and toCSS modules.';
    }

    this.rekapi = rekapi;

    // @private {number}
    this._playTimestamp = null;

    // @private {string}
    this._cachedCSS = null;

    // The HTMLStyleElement that gets injected into the DOM.
    // @private {HTMLStyleElement)
    this._styleElement = null;

    // @private {number}
    this._stopSetTimeoutHandle = null;

    rekapi.on('timelineModified', _.bind(function () {
      this._cachedCSS = null;
    }, this));

    return this;
  };
  var CSSRenderer = Rekapi.CSSRenderer;

  /**
   * Whether or not the browser supports CSS `@keyframe` animations.
   *
   * @return {boolean}
   */
  CSSRenderer.prototype.canAnimateWithCSS = function () {
    return !!getVendorPrefix();
  };

  /**
   * Prerender and cache CSS so that it is ready to be used when it is needed in the future.  The function signature is identical to [`CSSRenderer#play`](#play).  This is necessary to run a CSS animation and will be called for you if you don't call it manually, but calling this ahead of time (such as on page load) will prevent any perceived lag when a CSS animation starts.  The prerendered animation is cached for reuse until the timeline is modified (by adding, removing or modifying a keyframe).
   *
   * @param {number=} opt_iterations How many times the animation should loop.  This can be null or 0 if you want to loop the animation endlessly but also specify a value for opt_fps.
   * @param {number=} opt_fps How many @keyframes to prerender per second of the animation.  The higher this number, the smoother the CSS animation will be, but the longer it will take to prerender.  The default value is 30, and you should not need to go higher than 60.
   * @return {string} The prerendered CSS string.  You likely won't need this, as it is also cached internally.
   */
  CSSRenderer.prototype.prerender = function (opt_iterations, opt_fps) {
    return this._cachedCSS = this.rekapi.toCSS({
      'vendors': [getVendorPrefix()]
      ,'fps': opt_fps
      ,'iterations': opt_iterations
    });
  };

  /**
   * Play the Rekapi animation as a `@keyframe` animation.
   *
   * @param {number=} opt_iterations How many times the animation should loop.  This can be null or 0 if you want to loop the animation endlessly but also specify a value for opt_fps.
   * @param {number=} opt_fps How many @keyframes to prerender per second of the animation.  The higher this number, the smoother the CSS animation will be, but the longer it will take to prerender.  The default value is 30, and you should not need to go higher than 60.
   */
  CSSRenderer.prototype.play = function (opt_iterations, opt_fps) {
    if (this.isPlaying()) {
      this.stop();
    }

    var css = this._cachedCSS || this.prerender.apply(this, arguments);
    this._styleElement = injectStyle(css);
    this._playTimestamp = now();

    if (navigator.userAgent.match(/Presto/)) {
      forceStyleInjection(this.rekapi);
    }

    if (opt_iterations) {
      var animationLength = (opt_iterations * this.rekapi.animationLength());
      this._stopSetTimeoutHandle = setTimeout(
          _.bind(this.stop, this, true),
          animationLength + INJECTED_STYLE_REMOVAL_BUFFER_MS);
    }

    fireEvent(this.rekapi, 'play', _);
  };

  /**
   * Stop a CSS animation.  This also removes any `<style>` elements that were dynamically injected into the DOM.  This method sets inline styles on Actor elements to stay either in their target or current position.
   *
   * @param {boolean} opt_goToEnd If true, set the elements to their target position (in other words, skip to the end of the animation).  If false or omitted, set the Actor elements to stay in their current position.
   */
  CSSRenderer.prototype.stop = function (opt_goToEnd) {
    if (this.isPlaying()) {
      clearTimeout(this._stopSetTimeoutHandle);

      // Forces a style update in WebKit/Presto
      this._styleElement.innerHTML = '';

      document.head.removeChild(this._styleElement);
      this._styleElement = null;

      var updateTime;
      if (opt_goToEnd) {
        updateTime = this.rekapi.animationLength();
      } else {
        updateTime = (now() - this._playTimestamp)
            % this.rekapi.animationLength();
      }

      this.rekapi.update(updateTime);
      fireEvent(this.rekapi, 'stop', _);
    }
  };

  /**
   * Whether or not a CSS animation is running.
   *
   * @return {boolean}
   */
  CSSRenderer.prototype.isPlaying = function () {
    return !!this._styleElement;
  };

});

var rekapi = function (global, deps) {

  'use strict';

  // If `deps` is defined, it means that Rekapi is loaded via AMD.
  // Don't use global context in this case so that the global scope
  // is not polluted by the Rekapi object.
  var context = deps ? {} : global;

  var _ = (deps && deps.underscore) ? deps.underscore : context._;
  var Tweenable = (deps && deps.Tweenable) ?
      deps.Tweenable : context.Tweenable;

  rekapiCore(context, _, Tweenable);

  _.each(rekapiModules, function (module) {
    module(context);
  });

  return context.Rekapi;
};

if (typeof define === 'function' && define.amd) {
  var underscoreAlreadyInUse = (typeof _ !== 'undefined');

  // Expose Rekapi as an AMD module if it's loaded with RequireJS or similar.
  // Shifty and Underscore are set as dependencies of this module.
  //
  // The rekapi module is anonymous so that it can be required with any name.
  // Example: define(['vendor/rekapi.min'], function(Rekapi) { ... });
  define(['shifty', 'underscore'], function (Tweenable, Underscore) {
    var underscoreSupportsAMD = (Underscore != null);
    var deps = {  Tweenable: Tweenable,
                  // Some versions of Underscore.js support AMD, others don't.
                  // If not, use the `_` global.
                  underscore: underscoreSupportsAMD ? Underscore : _ };
    var Rekapi = rekapi({}, deps);

    if (REKAPI_DEBUG) {
      Rekapi.underscore_version = deps.underscore.VERSION;
    }

    if (!underscoreAlreadyInUse && underscoreSupportsAMD) {
      // Prevent Underscore from polluting the global scope.
      // This global can be safely removed since Rekapi keeps its own reference
      // to Underscore via the `deps` object passed earlier as an argument.
      this._ = undefined;
    }

    return Rekapi;
  });
} else {
  // Load Rekapi normally (creating a Rekapi global) if not using an AMD loader.

  // Note: `global` is not defined when running unit tests. Pass `this` instead.
  rekapi(this);
}

} (this));
