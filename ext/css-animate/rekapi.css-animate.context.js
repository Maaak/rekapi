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

  /*!
   * @param {Rekapi} rekapi
   */
  Rekapi._rendererInitHook.cssAnimate = function (rekapi) {
    var context = rekapi.context;

    // Node.nodeType 1 is an ELEMENT_NODE.
    // https://developer.mozilla.org/en-US/docs/Web/API/Node.nodeType
    if (context.nodeType === 1 &&
        context.nodeName.toLowerCase() !== 'canvas') {
      rekapi.renderer = new CSSRenderer(rekapi);
    }
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
   * An advantage of this module is that CSS animations are not always available, but JavaScript animations are.  Keyframes are defined the same way, but you can choose what method of animation is appropriate at runtime:
   *
   * ```
   *  var rekapi = new Rekapi(document.body);
   *  var actor = new Rekapi.DOMActor(document.getElementById('actor-1'));
   *
   *  rekapi.addActor(actor);
   *  actor.keyframe(0,    { left: '0px'   });
   *  actor.keyframe(1000, { left: '250px' }, 'easeOutQuad');
   *
   *  // Feature detect for @keyframe support
   *  if (rekapi.renderer.canAnimateWithCSS()) {
   *    rekapi.renderer.animateWithCSS();
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
   * Prerender and cache CSS so that it is ready to be used when it is needed in the future.  The function signature is identical to [`CSSRenderer#animateWithCSS`](#play).  This is necessary to run a CSS animation and will be called for you if you don't call it manually, but calling this ahead of time (such as on page load) will prevent any perceived lag when a CSS animation starts.  The prerendered animation is cached for reuse until the timeline is modified (by adding, removing or modifying a keyframe).
   *
   * @param {number=} opt_iterations How many times the animation should loop.  This can be null or 0 if you want to loop the animation endlessly but also specify a value for opt_fps.
   * @param {number=} opt_fps How many @keyframes to prerender per second of the animation.  The higher this number, the smoother the CSS animation will be, but the longer it will take to prerender.  The default value is 30, and you should not need to go higher than 60.
   * @return {string} The prerendered CSS string.  You likely won't need this, as it is also cached internally.
   */
  CSSRenderer.prototype.prerender = function (opt_iterations, opt_fps) {
    return this._cachedCSS = this.toString({
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
  CSSRenderer.prototype.animateWithCSS = function (opt_iterations, opt_fps) {
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

  // CSSRenderer.prototype.toString CODE
  //

  // CONSTANTS
  //

  var DEFAULT_FPS = 30;
  var TRANSFORM_TOKEN = 'TRANSFORM';
  var VENDOR_TOKEN = 'VENDOR';
  var VENDOR_PREFIXES = {
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
  Rekapi.CSSRenderer.prototype.toString = function (opts) {
    opts = opts || {};
    var animationCSS = [];

    _.each(this.rekapi.getAllActors(), function (actor) {
      if (actor instanceof Rekapi.DOMActor) {
        animationCSS.push(getActorCSS(actor, opts));
      }
    });

    return animationCSS.join('\n');
  };

  /*!
   * Creates the CSS `@keyframes` for an individual actor.
   * @param {Rekapi.Actor} actor
   * @param {Object} opts Same as opts for Rekapi.prototype.toCSS.
   * @return {string}
   */
  function getActorCSS (actor, opts) {
    opts = opts || {};
    var actorCSS = [];
    var animName = opts.name || actor.getCSSName();
    var fps = opts.fps || DEFAULT_FPS;
    var steps = Math.ceil((actor.rekapi.animationLength() / 1000) * fps);
    var combineProperties = !canOptimizeAnyKeyframeProperties(actor);
    var actorClass = generateCSSClass(
        actor, animName, combineProperties, opts.vendors, opts.iterations,
        opts.isCentered);
    var boilerplatedKeyframes = generateBoilerplatedKeyframes(
        actor, animName, steps, combineProperties, opts.vendors);

    actorCSS.push(actorClass);
    actorCSS.push(boilerplatedKeyframes);

    return actorCSS.join('\n');
  }

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
      actor._updateState(
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
    Rekapi._private.cssRenderer = {
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
      ,'getActorCSS': getActorCSS
    };
  }
});
