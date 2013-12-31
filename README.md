# Rekapi - Keyframes for JavaScript

Rekapi is a keyframe animation library for JavaScript.  It gives you an API
for:

* Defining keyframe-based animations
* Controlling animation playback

Rekapi does not perform any rendering.  However, it does expose a common
interface for implementing your own rendering methods.

Rekapi has two dependencies:
[Underscore](https://github.com/documentcloud/underscore) and
[Shifty](https://github.com/jeremyckahn/shifty).

Rekapi has been tested in and supports:

* Modern HTML5 browsers
* IE 7/8 (9 probably works; has not been tested)
* Node.js

If you have any questions about Rekapi, please post them to the [Google
Group](https://groups.google.com/forum/?fromgroups#!forum/rekapi).  Also, check
out the [Getting Started Guide
](https://github.com/jeremyckahn/rekapi/blob/master/docs/getting_started.md).

Please note:  Rekapi is a rewrite of
[Kapi](https://github.com/jeremyckahn/kapi). Rekapi is very similar to Kapi,
but they are not identical.  Rekapi is not a drop-in replacement for Kapi.
Kapi is no longer maintained, so Rekapi is a better choice for your projects.
Kapi and Rekapi were written by the same author.

The API may change somewhat before reaching 1.0.  __[See how to upgrade from
older versions.
](https://github.com/jeremyckahn/rekapi/blob/master/docs/upgrading.md)__.

## What is keyframing?

Keyframing is an animation technique for defining states at specific points in
time. Keyframing allows you to declaratively define the points at which the the
animation changes - all of the frames that exist between those points are
interpolated for you.  It is a powerful way to construct a complex animation.

## How do I use Rekapi?

Using Rekapi boils down to four steps:

* Define one or more `Rekapi.Actor` base objects (generally referred to as
  "actors")
* Instantiate and add the actors to a `Rekapi` instance
* Define keyframe states for the `Rekapi.Actor`s
* Play the animation

## `Rekapi`

The `Rekapi` Object  manages the state and playback of an animation.  An
instance of `Rekapi` acts as a conductor for the various actors associated with
it.

## `Rekapi.Actor`

The actors are the individual visual components of an animation.  A circle
moving from left to right is an actor.  A square that moves up and down is
another, separate actor.  Actors are represented by the `Rekapi.Actor` Object
and its subclasses.

## Playback control APIs

There are playback control methods built into the `Rekapi` Object.  These
methods include `play()`, `pause()` and `stop()`.  See [the API
documentation](http://rekapi.com/dist/doc/src/rekapi.core.js.html) for a full
list of the available methods.

## Rendering contexts

Rekapi works by passing state data from the animation to the actors each frame.
The actors then render the data according to their context.  Rekapi treats
rendering contexts generically, and you can create new ones as needed.  The
standard Rekapi distribution includes rendering contexts for the DOM and
`<canvas>`.

A rendering context does two things:  It attaches methods to
`Rekapi.prototype`, and it subclasses `Rekapi.Actor`.  This is how Rekapi
renders `<canvas>` and DOM actors: The respective renderers create
`Rekapi.CanvasActor` and `Rekapi.DOMActor`.

The `Rekapi.Actor` base class only works with raw state data, it doesn't render
anything visually.  Use `Rekapi.DOMActor` and `Rekapi.CanvasActor` to render to
the screen.  `Rekapi.Actor` is useful if the provided subclasses are too
high-level for your needs.  Don't be afraid to subclass `Rekapi.Actor`.

## AMD

You can optionally load Rekapi as an
[AMD](https://github.com/amdjs/amdjs-api/wiki/AMD) module by using a loader
such as [RequireJS](http://requirejs.org). This prevents the creation a global
`Rekapi` variable.

Caution: You can only require `rekapi.js` or `rekapi.min.js` as AMD modules.
`rekapi-underscore-shifty.min.js` will expose the `Rekapi`, `Tweenable` and `_`
Objects globally.

Here is an example of how you can use Rekapi with RequireJS:

````javascript
// This example assumes that there is a `lib` directory in your project
require.config({
  paths: {
    shifty: "lib/shifty",
    underscore: "lib/underscore.min",
    rekapi: "lib/rekapi"
  }
});

// Dependencies (Underscore and Shifty) are automatically loaded.
require(['rekapi'], function(Rekapi) {
  var kapi = new Rekapi();
});
````

## Node

Rekapi can be used in Node.js.  This can be useful for generating keyframe
data.  Usage is the same as in the browser.  Loading the code requires the
[r.js](https://github.com/jrburke/r.js/blob/master/dist/r.js) script and looks
a lot ike the AMD approach above:

````javascript
var requirejs = require('requirejs');
requirejs.config({
  paths: {
    shifty: "dist/shifty.min",
    underscore: "dist/underscore-min",
    rekapi: "dist/rekapi"
  }
});

requirejs(['rekapi'], function(Rekapi) {
  var rekapi = new Rekapi();
});
````

## Core contributors

* [Franck Lecollinet](https://github.com/sork)
