# Getting started

Although Rekapi is renderer-agnostic, it's most straightforward to start off by
making a simple `<canvas>` animation.  The first step is to make a new `Rekapi`
instance.  Canvas animations require a `<canvas>` element to render to, which
gets passed to the `Rekapi` constructor:

````javascript
var canvas = document.getElementsByTagName('canvas')[0];
var rekapi = new Rekapi({
    'context': canvas
  });
````

You now have a `Rekapi` instance, but it won't do terribly much until you
define and add some Actors.

## Defining Actors

Here's the boilerplate for a canvas actor:

````javascript
var actor = new Rekapi.CanvasActor({

  // Called every frame.  Receives a reference to the canvas context, and the
  // actor's state.
  'draw': function (context, state) {

  }

});
````

Continuing from before, here's a sample implementation for a canvas actor:

````javascript
var canvas = document.getElementsByTagName('canvas')[0];
var rekapi = new Rekapi({
    'context': canvas
  });

var actor = new Rekapi.CanvasActor({
  // Draws a circle.
  'draw': function (context, state) {
    context.beginPath();
    context.arc(
      state.x || 50,
      state.y || 50,
      state.radius || 50,
      0,
      Math.PI*2,
      true);
    context.fillStyle = state.color || '#f0f';
    context.fill();
    context.closePath();
  }
});
````

The actor's `draw` method can be whatever you want, so don't focus too much on
what function is actually doing here.  The idea is that the `context` and
`state` parameters are provided by `rekapi` on every screen update, and then
rendered to the `<canvas>` by the actor's `draw` method.

Now that you have an actor instance, you just need to add it to `rekapi`:

````javascript
rekapi.addActor(actor);
````

Now you can define some keyframes.

## Defining keyframes

A keyframe is a way of saying "At a given point in time, the actor should have
a particular state."  Start off by giving `actor` a starting keyframe:

````javascript
actor.keyframe(0, {
    x: 50,
    y: 50
  });
````

`keyframe` is a method that takes two to three parameters - the first is how
many milliseconds into the animation this keyframe is going start, and the
second is an Object whose properties define the state that the actor should
have.  The optional third parameter is a string that specifies which
[Shifty](https://github.com/jeremyckahn/shifty) easing formula to use -
"linear" is the default.  The previous snippet says, "at zero milliseconds into
the animation, place `actor` at `x` 50, and `y` 50.  Continuing with that,
animate it to another point on the canvas:

````javascript
actor.keyframe(0, {
    x: 50,
    y: 50
  })
  .keyframe(1000, {
    x: 200,
    y: 100
  }, 'easeOutExpo');
````

The animation defined here will last one second, as the final `keyframe` is
set at 1000 milliseconds.  It will have a nice `easeOutExpo` ease applied to
it, as you can see in the third parameter.  Individual tweens (that is,
keyframed animation segments) get their easing curves from the keyframe they
are animating to, not animating from.

Rekapi inherits all of [Shifty's easing
functions](https://github.com/jeremyckahn/shifty/blob/master/src/shifty.formulas.js).

## Playing the animation

So now you've set up a sweet animation - run it and see what it looks like.
Continuing from before:

````javascript
rekapi.play();
````

And the animation will just loop continuously.  You can also pass a `number` to
`play()` to define how many times to play before stopping, like so:

````javascript
rekapi.play(3);
````

This will play the animation three times and stop.  When an animation stops, it
will just sit at the last frame that was rendered.  You can control the
animation playback with `rekapi.pause()` and `rekapi.stop()`.

## All together

Copy/paste/save this onto your computer to see a simple Rekapi animation:

````html
<!DOCTYPE html>
<html>
<head>
  <script src="https://raw.github.com/jeremyckahn/rekapi/master/dist/rekapi-underscore-shifty.min.js"></script>
</head>
<body>
  <canvas></canvas>
  <script>
  var canvas = document.getElementsByTagName('canvas')[0],
      rekapi = new Rekapi({
        'context': canvas
      });

  var actor = new Rekapi.CanvasActor({
    // Draws a circle.
    'draw': function (context, state) {
      context.beginPath();
      context.arc(
        state.x || 50,
        state.y || 50,
        state.radius || 50,
        0,
        Math.PI*2,
        true);
      context.fillStyle = state.color || '#f0f';
      context.fill();
      context.closePath();
    }
  });

  rekapi.addActor(actor);

  actor.keyframe(0, {
      x: 50,
      y: 50
    })
    .keyframe(1000, {
      x: 200,
      y: 100
    }, 'easeOutExpo');

  rekapi.play();

  </script>
</body>
</html>
````
