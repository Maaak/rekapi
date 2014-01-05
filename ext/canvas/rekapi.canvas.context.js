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
  Rekapi.prototype._contextInitHook.canvas = function () {
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
