# Upgrading to Rekapi 1.0.0

There are several breaking changes in this release.  The most significant is that the globally-exposed object is renamed from `Kapi` to `Rekapi`, to match the name of the project.  It is recommended that you update your code, but in lieu of that you might be able to get away with this:

````javascript
window.Kapi = window.Rekapi;
````

If you are loading Rekapi as an AMD module, there is a good chance that you won't need to change any of your code in order to upgrade, since the object names provided by the loader are arbitrary.  In other words, this should still work:

````javascript
define(['rekapi'], function (Kapi) {
  // ...
});
````

Note that __all__ internal references to `Kapi` objects have been renamed from `kapi` to `rekapi` as well, so that might break your code regardless of how Rekapi was loaded.  To demonstrate:

````javascript
var rekapi = new Rekapi();
var actor = new Rekapi.Actor();
rekapi.add(actor);

rekapi === actor.rekapi; // <-- actor.rekapi used to be actor.kapi
````

## The `Rekapi` constructor signature has changed

Instead of a configuration object, `Rekapi` now expects the rendering context as the first and only parameter.  If you were providing `height` and `width` for canvas animations previously, you will now have to call those methods directly:

````
var rekapi = new Rekapi(document.createElement('canvas'));
rekapi.renderer.height(300);
rekapi.renderer.width(300);
````

## The `Rekapi.KeyframeProperty` constructor signature has changed

`Rekapi.KeyframeProperty` no longer accepts the owner actor via the constructor.  The link between the two objects is established by the new method, `Rekapi.Actor.prototype._addKeyframeProperty`.

## `Rekapi.Actor.prototype.updateState` is now private

This function wasn't useful as a public API, so it has been made private by convention.  It is still accessible as `Rekapi.Actor.prototype._updateState`, but it is suggested that you update the state of the `Rekapi` instance instead.

## `Rekapi.CanvasRenderer` instance is now called `renderer`

This was previously called `canvas`.  So:

````javascript
var rekapi = new Rekapi(document.createElement('canvas'));

// This used to be called `rekapi.canvas`.
rekapi.renderer instanceof Rekapi.CanvasRenderer; // true
````

## `Rekapi.CSSRenderer` instance is now called `renderer` and has different requirements

As you may suspect, this means that a Rekapi animation can no longer animate both DOM and Canvas actors.  This choice was made to simplify the API for common use cases.  The renderer to use for an animation is determined by the context that was provided to the Rekapi constructor.  CSS 3 animations require a non-canvas element as the context.  For simplicity, you can just provide the `<body>`:

````javascript
var rekapi = new Rekapi(document.body);

// ...

if (rekapi.renderer.canAnimateWithCSS()) {
  rekapi.renderer.play();
} else {
  rekapi.play();
}
````

### `Rekapi.CSSRenderer.prototype.play` is now called `Rekapi.CSSRenderer.prototype.animateWithCSS`

This is done to avoid confusion with `Rekapi.prototype.play` and also be more consistent with `Rekapi.CSSRenderer.prototype.canAnimateWithCSS`.

## `draw` is now `render`

`Rekapi.CanvasActor` now expects a function called `render` instead of `draw`.  `draw` is no longer recognized by Rekapi.  Both functions work identically, it is just a name change.  The related events `beforeDraw` and `afterDraw` are now `beforeRender` and `afterRender`, respectively.

## `context` is no longer a method

`context` is now stored as an "own" property for all objects that previously had a `context` method.  For canvas animations, the public `context` property, which is supplied via the `Rekapi` constuctor, is changed internally at setup time to reference its 2D drawing context.

# Upgrading to Rekapi 0.13.0

`Kapi.Actor.prototype.data` is now just property, not a getter/setter method.

# Upgrading to Rekapi 0.10.0

The Canvas extension APIs were reorganized.  Now instead of being attached
directly to the `Kapi` prototype, they are attached to a new `canvas` property
on each `Kapi` instance.  This is explained more in the Canvas README, but
here's an example of the change:

````javascript
var kapi = new Kapi();

// This won't work anymore!
kapi.setOrderFunction();

// This is the new way to do it.
kapi.canvas.setOrderFunction();
````

Some of the Canvas extension methods have also been cleaned up to avoid
redundancy.  Assuming the `kapi` instance from above, here's all of the
methods:

  * `kapi.renderer.height()`
  * `kapi.renderer.width()`
  * `kapi.canvas.clear()`
  * `kapi.canvas.context()`
  * `kapi.canvas.moveActorToLayer()`
  * `kapi.canvas.setOrderFunction()`
  * `kapi.canvas.unsetOrderFunction()`

This version also removes draw order exporting functionality (in
`Kapi.prototype.exportTimeline`).

# Upgrading to Rekapi 0.9.13

`Kapi.prototype.redraw()` was removed.  You can still use
`Kapi.prototype.update()` (with no parameters) to achieve the same effect.

# Upgrading to Rekapi 0.9.6

The build process has changed.  Rekapi now uses UglifyJS and Node.js to
generate the binaries, not the Google Closure Compiler.  Please the README for
instructions on compiling.

# Upgrading to Rekapi 0.9.0

Version 0.8.x had lots of API changes, but 0.9.x should be much more stable.
However, there are some differences from older versions.

  * `Kapi.Actor` now receives the `update` constructor parameter to specify the
  function that processes the per-frame state data instead of `render`.  The
  analagous parameter for `Kapi.CanvasActor` is now `draw`.  `Kapi.DOMActor`
  doesn't need any such parameter.
  * Methods moved from core to the Canvas extension:
    * kapi.redraw
    * kapi.moveActorToLayer
    * kapi.setOrderFunction
    * kapi.unsetOrderFunction
    * actor.moveToLayer
  * Methods removed:
    * kapi.render
  * Method name changes
    * kapi.calculateActorPositions -> kapi.update
    * kapi.lastPositionRendered -> kapi.lastPositionUpdated
    * actor.calculatePosition -> actor.updateState
  * Actor draw ordering functionality was moved to the Canvas extension.

# Upgrading to Rekapi 0.8.17

Renamed `bind` to `on` and `unbind` to `off`.

# Upgrading to Rekapi 0.8.16

All event names removed the "on" prefix with proper camelCasing.  So,
"onAnimationComplete" is now "animationComplete," for example.

# Upgrading to Rekapi 0.8.5

All hide/show functionality has been __removed__.

# Upgrading to Rekapi 0.8.4

The keyframe model has __changed__.  It works much more like the `@keyframe`
CSS3 spec (but not identically).  With the new model, missing keyframe
properties are not copied from the previous keyframe.  If you want a
property to "wait" at a given value, you now need to declare that value at
every keyframe which the property should wait. So if your code looked like:

````javascript
actor.keyframe(0, {
  x: 10,
  y: 10
}).keyframe(1000, {
  x: 20
}).keyframe(2000, {
  x: 30,
  y: 20
});
````

It should now look like:

````javascript
actor.keyframe(0, {
  x: 10,
  y: 10
}).keyframe(1000, {
  x: 20,
  y: 10 // This property was manually copied from the previous keyframe!
}).keyframe(2000, {
  x: 30,
  y: 20
});
````

...In order to work the same.  The behavior of `Kapi.Actor.prototype.wait` has
also changed to sensibly match this new keyframe model.  It works basically the
same as before, except that now it implicitly fills in any missing keyframe
properties of the millisecond that is extended.  This is done so that all
properties can be properly paused.  In other words, when you call `wait()` on
an actor, all properties are paused for the duration of the wait.

# Upgrading to Rekapi 0.8.2

Rounding functionality was removed.  Passing `doRoundNumbers` to the `Kapi`
constructor will do nothing.

# Upgrading to Rekapi 0.8.1

The `draw` method that gets passed into the `Kapi.Actor` constructor (and its
subclasses) is now called `render`.  __Using `draw` instead of `render` will
break.__

# Upgrading to Rekapi 0.8.0

The API changed a bit for 0.8.0, as a result of issue #9.  Upgrading shouldn't
be too difficult, there are just a few changes you need to make to use it.

## Canvas animations

  1.  You need replace `Kapi.Actor` with `Kapi.CanvasActor`.
  2.  `Kapi.prototype.canvas_style` no longer exists.
  3.  All methods that began with `canvas_` are now camelCase.

## DOM animations

  1.  You don't need to have a container element or pass anything into the
  `Kapi` constructor.  No changes are made to the Actor DOM element's parent.

