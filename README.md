sparkler
========

Sparkler is a pattern matching engine for JavaScript built using
[sweet.js](https://github.com/mozilla/sweet.js) macros, so it looks and feels
like native syntax. It has no runtime dependencies and compiles down to simple
`if`s and `for`s.

Here's a small slice of what you can do with it:

```js
function myPatterns {
  // Match literals
  case 42 => 'The meaning of life'

  // Tag checking for JS types using Object::toString
  case a @ String => 'Hello ' + a

  // Array destructuring
  case [...front, back] => back.concat(front)

  // Object destructuring
  case { foo: 'bar', x, 'y' } => x

  // Custom extractors
  case Email{ user, domain: 'foo.com' } => user

  // Rest arguments
  case (a, b, ...rest) => rest

  // Rest patterns (mapping a pattern over many values)
  case [...{ x, y }] => _.zip(x, y)

  // Guards
  case x @ Number if x > 10 => x
}
```

You can see a slew of more examples in the
[pattern spec file](https://github.com/natefaubion/sparkler/blob/master/test/patterns.sjs)

Install
-------

    npm install -g sweet.js
    npm install sparkler
    sjs -m sparkler/macros myfile.js

How Does It Work?
-----------------

Sparkler overloads the `function` keyword as a macro (don't worry, all your old
functions will still work) but implements a slightly different syntax. There's
no argument list after the name or function keyword. Instead the function body
is just a set of `case`s with ES6 style arrow-lambdas.

```js
function myFunc {
  // Single arguments don't need parens and simple expression 
  // bodies get an implicit `return`.
  case a @ String => 'Hello ' + a

  // Add parens and braces if you need more.
  case (x, y, z) => {
    return x + y + z;
  }
}
```

You can also do this with anonymous functions:

```js
DB.getResource('123', function {
  case (null, resp) => complete(resp)
  case (err) => handleError(err)
})
```

If a case doesn't match a `TypeError('No match')` is thrown.

Branch Optimization
-------------------

Sparkler doesn't just try each case one at a time until one passes. That would
be really inefficient. Instead, it builds up a tree of patterns to try. Take
something like this:

```js
function expensiveExtraction {
  case (MyExtractor(x, y, z), 1) => doThis()
  case (MyExtractor(x, y, z), *) => doThat()
}
```

Let's say `MyExtractor` is really expensive. Since these two cases share the
same root argument, they are grafted together. `MyExtractor` is only called
once, even if the first case fails in its second argument.

Argument Length
---------------

In JavaScript, you can call a function with any number of arguments. Arguments
that are not provided are just set to `undefined`. Sparkler preserves this
behavior, so you have to be careful combining ambiguous cases.

```js
function ambiguous {
  case (a)       => 1
  case (a, b)    => 2
  case (a, b, c) => 3
}
```

The above function will __always__ return `3` no matter how many arguments you
call it with. This is because all the argument cases share the same branching
(of doing nothing). It basically gets compiled to this:

```js
function ambiguous(arg1, arg2, arg3) {
  // The longest case on a branch gets compiled first.
  var a = arg1, b = arg2, c = arg3;
  return 3;

  var a = arg1, b = arg2;
  return 2;

  var a = arg1;
  return 1;
}
```

And then optimized to this:

```js
function ambiguous(arg1, arg2, arg3) {
  var a = arg1, b = arg2, c = arg3;
  return 3;
}
```

If you want to match on specific argument length, you need to add a guard to
your case.

```js
function argCheck {
  // Using arguments.length
  case (a, b, c) if arguments.length == 3 => 1
  // Or matching undefined
  case (a, b, undefined) => 2
  case (a) => 1
}
```

The only time Sparkler is strict with argument length is with the empty
parameter list `()`. It will check that `arguments.length` is zero. This is so
you can do stuff like this:

```js
Foo.prototype = {
  // jQuery-style getter/setter
  val: function {
    case () => this._val
    case (val) => {
      this._val = val;
      return this;
    }
  }
}
```

If you want a catch-all, you should use a wildcard (`*`) instead.

Custom Extractors
-----------------

You can match on your own types by implementing a simple protocol. Let's build
a simple extractor that parses emails from strings:

```js
var Email = {
  // Factor out a matching function that we'll reuse.
  match: function {
    case x @ String => x.match(/(.+)@(.+)/)
    case *          => null
  },

  // `hasInstance` is called on bare extractors.
  hasInstance: function(x) {
    return !!Email.match(x);
  },

  // `unapply` is called for array-like destructuring.
  unapply: function(x) {
    var m = Email.match(x);
    if (m) {
      return [m[1], m[2]];
    }
  },

  // `unapplyObj` is for object-list destructuring.
  unapplyObj: function(x) {
    var m = Email.match(x);
    if (m) {
      return {
        user: m[1],
        domain: m[2]
      };
    }
  }
};
```

Now we can use it in case arguments:

```js
function doStuffWithEmails {
  // Calls `unapplyObj`
  case Email{ domain: 'foo.com' } => ...
  
  // Calls 'unapply'
  case Email('foo', *) => ...

  // Calls `hasInstance`
  case Email => ...
}
```

If you don't implement `hasInstance`, Sparkler will fall back to a simple
`instanceof` check.

### adt.js

[Adt.js](https://github.com/natefaubion/adt.js) is a library that implements
the extractor protocol out of the box, and even has its own set of macros for
defining data-types.

```js
$data Tree {
  Empty,
  Node {
    value : *,
    left  : Tree,
    right : Tree
  }
}

function treeFn {
  case Empty => 'empty'
  case Node{ value @ String } => 'string'
}
```

Optional Extensions
-------------------

Sparkler also provides a small library that extends some of the native types
with convenient functions.

```js
require('sparkler/extend');

// Date destructuring
function dateStuff {
  case Date{ month, year } => ...
}

// RegExp destructuring
function regexpStuff {
  case RegExp{ flags: { 'i' }} => ...
}

// Infix matching with `applyTo`
List.prototype.map = function(fn) {
  return this.applyTo(function {
    case Nil => Nil
    case Cons(x, xs) => Cons(fn(x), xs.map(fn))
  })
}

// Partial-function composition with `orElse`
function partial {
  case Foo => 'foo'
}

var total = partial.orElse(function {
  case * => 'anything'
})
```

`applyTo` and `orElse` are added to prototypes safely using `defineProperty`
and aren't enumerable.

***

### Author

Nathan Faubion (@natefaubion)

### License

MIT
