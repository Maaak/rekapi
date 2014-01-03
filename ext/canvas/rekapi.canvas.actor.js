rekapiModules.push(function (context) {

  'use strict';

  var Rekapi = context.Rekapi;
  var _ = Rekapi._;

  /**
   * Constructor for rendering Actors to a `<canvas>`.  Extends [`Rekapi.Actor`](../../src/rekapi.actor.js.html).  Valid options for `opt_config` are the same as those for [`Rekapi.Actor`](../../src/rekapi.actor.js.html), with the following additions:
   *
   *  - __render__ _(function(CanvasRenderingContext2D, Object))_: A function that renders something to a canvas.
   *
   * _Note_: `context` is inherited from the `Rekapi` instance if it is not provided here.
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


  /*!
   * @param {Object} opt_context
   * @return {Object}
   */
  CanvasActor.prototype.context = function (opt_context) {
    if (opt_context) {
      this._context = opt_context;
    }

    return this._context && this._context.getContext('2d');
  };


  /**
   * Move this `Rekapi.CanvasActor` to a different layer in the `Rekapi` instance that it belongs to.  This returns `undefined` if the operation was unsuccessful.  This is just a wrapper for [moveActorToLayer](rekapi.canvas.context.js.html#moveActorToLayer).
   * @param {number} layer
   * @return {Rekapi.Actor|undefined}
   */
  CanvasActor.prototype.moveToLayer = function (layer) {
    return this.rekapi.canvas.moveActorToLayer(this, layer);
  };
});
