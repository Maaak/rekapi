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
   * `Rekapi.Actor` does _not_ render to any context.  It is a base class.  Use the [`Rekapi.CanvasActor`](../renderers/canvas/rekapi.canvas.actor.js.html) or [`Rekapi.DOMActor`](../renderers/dom/rekapi.dom.actor.js.html) subclasses to render to the screen.  You can also make your own rendering subclass - see the source code for the aforementioned examples.
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
      ,'render': opt_config.render || noop
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
   * __Note:__ Internally, this creates [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s and places them on a "track."  These [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s are managed for you by the `Actor` APIs.
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
          millisecond, name, value, opt_easing[name]);

      this._addKeyframeProperty(newKeyframeProperty);
    }, this);

    if (this.rekapi) {
      recalculateAnimationLength(this.rekapi, _);
    }

    invalidatePropertyCache(this);

    return this;
  };

  /**
   * Gets the [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html) from an `Actor`'s [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html) track. Returns `undefined` if there were no properties found with the specified parameters.
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
   * Modify a specified [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html) stored on an `Actor`.  Essentially, this calls [`KeyframeProperty#modifyWith`](rekapi.keyframe-property.js.html#modifyWith) (passing along `newProperties`) and then performs some cleanup.
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
   * Augment the `value` or `easing` of the [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s at a given millisecond.  Any [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s omitted in `stateModification` or `opt_easing` are not modified.  Here's how you might use it:
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
   * Remove all [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s at a given millisecond in the animation.
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

  /*!
   * Associate a `Rekapi.KeyframeProperty` to this actor.  Augments the `Rekapi.KeyframeProperty` to maintain a link between the two objects.
   * @param {Rekapi.KeyframeProperty} keyframeProperty
   * @return {Rekapi.Actor}
   */
  Actor.prototype._addKeyframeProperty = function (keyframeProperty) {
    keyframeProperty.actor = this;
    this._keyframeProperties[keyframeProperty.id] = keyframeProperty;

    var name = keyframeProperty.name;
    var propertyTracks = this._propertyTracks;

    if (typeof this._propertyTracks[name] === 'undefined') {
      propertyTracks[name] = [keyframeProperty];
    } else {
      propertyTracks[name].push(keyframeProperty);
    }

    sortPropertyTracks(this);

    return this;
  };

  /*!
   * Calculate and set the `Actor`'s position at `millisecond` in the animation.
   *
   * @param {number} millisecond
   * @return {Rekapi.Actor}
   */
  Actor.prototype._updateState = function (millisecond) {
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
   * Export a serializable `Object` of this `Actor`'s timeline property tracks and [`Rekapi.KeyframeProperty`](rekapi.keyframe-property.js.html)s.
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
