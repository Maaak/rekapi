You can use Rekapi to render to `<canvas>`.  This extension does two things:

  1. Subclasses `Rekapi.Actor` as `Rekapi.CanvasActor`.
  2. Attaches an instance of `Rekapi.CanvasRenderer` to each instance of
     `Rekapi`, named `canvas`, at initialization time.  So:

````javascript
// With the Rekapi <canvas> extension loaded
var rekapi = new Rekapi();
rekapi.canvas instanceof Rekapi.CanvasRenderer; // true
````


# Rekapi Object additions


### Events

This extension adds some new events you can bind to with `Rekapi.on`.

  * __beforeDraw__: Fires just before an actor is drawn to the screen.
  * __afterDraw__: Fires just after an actor is drawn to the screen.


# Rekapi.CanvasRenderer


### context

````javascript
/**
 * @returns {CanvasRenderingContext2D}
 */
Rekapi.CanvasRenderer.prototype.context ()
````

Retrieve the 2d context of the `<canvas>` that is set as the `Rekapi`
instance's context.  This is needed for any and all canvas rendering
operations.  It is also provided to a `CanvasActor`'s `draw` method, so you
mostly won't need to call it directly.  Note that this is differet from the
normal `Rekapi.prototype.context` method, as it does slightly more logic to
retrieve the actual `<canvas>` rendering context, not the DOM element.  See the
[MDN](https://developer.mozilla.org/en/Drawing_Graphics_with_Canvas) for more
info on the `<canvas>` context.


### height, width

````javascript
/**
 * @param {number=} opt_height
 * @returns {number}
 */
Rekapi.CanvasRenderer.prototype.height (opt_height)

/**
 * @param {number=} opt_width
 * @returns {number}
 */
Rekapi.CanvasRenderer.prototype.width (opt_width)
````

These methods get and optionally set their respective dimensions on the canvas.


### clear

````javascript
/**
 * @returns {Rekapi}
 */
Rekapi.CanvasRenderer.prototype.clear ()
````

Erase the canvas.


### setOrderFunction

````javascript
/**
 * @param {function(Rekapi.CanvasActor, number)} sortFunction
 * @return {Rekapi}
 */
Rekapi.CanvasRenderer.prototype.setOrderFunction (sortFunction)
````

Set a function that defines the draw order of the `CanvasActor`s.  This is
called each frame before the `CanvasActor`s are drawn.  The following example
assumes that all `CanvasActor`s are circles that have a `radius` property.  The
circles will be drawn in order of the value of their `radius`, from smallest to
largest.  This has the effect of layering larger circles on top of smaller
circles, giving a sense of perspective.

````javascript
rekapi.canvas.setOrderFunction(function (actor) {
  return actor.get().radius;
});
````

__[Example](../docs/examples/canvas_set_order_function.html)__


### unsetOrderFunction

````javascript
/**
 * @return {Rekapi}
 */
Rekapi.CanvasRenderer.prototype.unsetOrderFunction ()
````

Remove the sort order function set by `setOrderFunction`.  Draw order defaults
back to the order in which `CanvasActors` were added.

__[Example](../docs/examples/canvas_unset_order_function.html)__


### moveActorToLayer

````javascript
/**
 * @param {Rekapi.Actor} actor
 * @param {number} layer
 * @return {Rekapi|undefined}
 */
Rekapi.CanvasRenderer.prototype.moveActorToLayer (actor, layer)
````

Move a `CanvasActor` around in the layer list.  Each layer has one
`CanvasActor`, and `CanvasActor`s are drawn in order of their layer.  Lower
layers (starting with 0) are drawn earlier.  If `layer` is higher than the
number of layers (which can be found with `actorCount()`) or lower than 0, this
method will return `undefined`.

__[Example](../docs/examples/canvas_move_actor_to_layer.html)__


===


# Rekapi.CanvasActor

````javascript
/**
 * @param {Object=} opt_config
 *   @param {Object=} context
 *   @param {function=} setup
 *   @param {function(CanvasRenderingContext2D, Object)=} draw
 *   @param {function=} teardown
 * @constructor
 * @extends Rekapi.Actor
 */
Rekapi.CanvasActor = function (element)
````

Note: `context` is inherited from the `Rekapi` instance that a
`Rekapi.CanvasActor` is added to if it is not provided to this constructor.


### moveToLayer

````javascript
/**
 * @param {number} layer
 * @returns {Rekapi.Actor|undefined}
 */
Rekapi.CanvasActor.prototype.moveToLayer (layer)
````

Move this `CanvasActor` to a different layer in the `Rekapi` instance that it
belongs to.  This returns `undefined` if the operation was unsuccessful.  The
method just calls `Rekapi.CanvasRenderer.prototype.moveActorToLayer`.
