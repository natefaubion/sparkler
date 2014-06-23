## 0.3.3 (2014-6-22)

* Fixed bug with function calls in guards
* Fixed `match` case ordering.
* Updated for Sweet.js 0.6.1

## 0.3.2 (2014-6-18)

* Fixed bug with backtracking in match statements

## 0.3.1 (2014-6-18)

* `match` statement form that supports early return, break, and continue.
* Pattern bindings may be prefixed with `var`, `let`, or `const`.
* Bugfixes

## 0.3.0 (2014-6-15)

* Compiler completely rewritten with way better case optimizer
* Removed "backtracking" compiler which was just a memoizing compiler and
  hideous.
* `match` can take multiple arguments
* Fixed some edge case bugs

## 0.2.1 (2014-5-19)

* Preserve `this` in match expressions

## 0.2.0 (2014-5-10)

* The `case` keyword is no longer required. Cases are separated by commas.
* The `match` keyword is no longer infix.
* In a set of ambiguous cases, the longest case is no longer run. It now
  correctly runs the first case.

## 0.1.6 (2014-1-11)

* Update for sweet.js 0.4.x
* Remove `applyTo` method in favor of `match` infix macro

## 0.1.5 (2013-12-13)

* Fix `letstx` scope so as not to interfere with new builtin `letstx`

## 0.1.4 (2013-12-9)

* Update for sweet.js 0.3.x
* Change `unapplyObj` to `unapplyObject`

## 0.1.3 (2013-10-19)

* Automatic backtracking detection

## 0.1.2 (2013-10-15)

* Backtracking support
* Minor bugfixes

## 0.1.1 (2013-10-13)

* Fix for match order bug due to optimization

## 0.1.0 (2013-10-09)

* Initial release
