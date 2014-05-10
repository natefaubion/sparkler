var assert = require('chai').assert;

// Custom operators in `test` blocks:
//   =>= Deep equals
//   =!= Throws exception (lhs will be wrapped in a function)

describe 'Case patterns' {

  // Wildcard
  // --------
  
  it 'should match anything for wildcards' {
    function go {
      (1, 2) => 1,
      (1, *) => 2 
    }
    test 'match'    { go(1, 2) === 1 }
    test 'wildcard' { go(1, 5) === 2 }
  }

  // Literals
  // --------

  it 'should match literals' {
    function go {
      42        => 42,
      true      => true,
      'foo'     => 'foo',
      null      => null,
      undefined => undefined
    }
    test 'numbers'   { go(42) === 42 }
    test 'booleans'  { go(true) === true }
    test 'strings'   { go('foo') === 'foo' }
    test 'null'      { go(null) === null }
    test 'undefined' { go(undefined) === undefined }
  }

  // Builtins
  // --------

  it 'should match builtin types' {
    function go {
      Boolean   => 'boolean',
      NaN       => 'nan',
      Number    => 'number',
      String    => 'string',
      RegExp    => 'regexp',
      Date      => 'date',
      Array     => 'array',
      Object    => 'object',
      Function  => 'function',
      Undefined => 'undefined',
      Null      => 'null',
      Math      => 'math',
      Arguments => 'arguments',
    }
    test 'Boolean'   { go(true) === 'boolean' }
    test 'Nan'       { go(0/0) === 'nan' }
    test 'Number'    { go(42) === 'number' }
    test 'String'    { go('foo') === 'string' }
    test 'RegExp'    { go(/foo/) === 'regexp' }
    test 'Date'      { go(new Date()) === 'date' }
    test 'Array'     { go([]) === 'array' }
    test 'Object'    { go({}) === 'object' }
    test 'Function'  { go(go) === 'function' }
    test 'Undefined' { go(void 0) === 'undefined' }
    test 'Null'      { go(null) === 'null' }
    test 'Math'      { go(Math) === 'math' }
    test 'Arguments' { go(fn { return arguments }()) === 'arguments' }
  }

  // Identifiers
  // -----------

  it 'should match identifiers' {
    function go1 { x => x }
    function go2 { _x => _x }
    function go3 { $x => $x }
    test 'x'  { go1(1) === 1 }
    test '_x' { go2(2) === 2 }
    test '$x' { go3(3) === 3 }
  }

  // Binders
  // -------

  it 'should match binder patterns' {
    function go {
      x @ 1 => x,
      y @ String => y,
      z @ [1, 2, 3] => z
    }
    test 'literals' { go(1) === 1 }
    test 'types'    { go('foo') === 'foo' }
    test 'destruct' { go([1, 2, 3]) =>= [1, 2, 3] }
  }

  // Arrays
  // ------

  it 'should destructure array literals strictly' {
    function go {
      [x] => x,
      [*, x] => x,
      [*, *, x] => x
    }
    test 'length == 1' { go([1]) === 1 }
    test 'length == 2' { go([1, 2]) === 2 }
    test 'length == 3' { go([1, 2, 3]) === 3 }
    test 'no match'    { go([1, 2, 3, 4]) =!= TypeError }
  }

  it 'should collect array rest values' {
    function go1 {
      [...a, b, c] => [a, b, c]
    }
    function go2 {
      [a, ...b, c] => [a, b, c]
    }
    function go3 {
      [a, b, ...c] => [a, b, c]
    }
    test 'head' { go1([1, 2, 3, 4]) =>= [[1, 2], 3, 4] }
    test 'mid'  { go2([1, 2, 3, 4]) =>= [1, [2, 3], 4] }
    test 'tail' { go3([1, 2, 3, 4]) =>= [1, 2, [3, 4]] }
  }

  // Objects
  // -------

  it 'should destructure object literals loosely' {
    function go {
      { x: 1 }   => true,
      { 'a': 2 } => true
    }
    test 'only 1 key' { go({ x: 1 }) }
    test 'many keys'  { go({ x: 1, y: 2, z: 3 }) }
    test 'no keys'    { go({}) =!= TypeError }
    test 'string key' { go({ a: 2 }) }
  }

  it 'should bring object identifier keys into scope' {
    function go {
      { x, y, z } => x + y + z
    }
    test 'ident key' { go({ x: 'x', y: 'y', z: 'z' }) === 'xyz' }
  }

  it 'should bring object binder keys into scope' {
    function go {
      { a @ String } => a
    }
    test 'binder key' { go({ a: 'a' }) === 'a' }
    test 'binder key match error' { go({ a: 42 }) =!= TypeError }
  }

  it 'should check object for a key when using a plain key string' {
    function go {
      { 'x', y } => y
    }
    test 'key is there'   { go({ x: 1, y: 'y' }) === 'y' }
    test 'key isnt there' { go({ y: 'y' }) =!= TypeError }
  }

  it 'should box primitive values when destructuring objects' {
    function go {
      x @ { toString: Function } => x.toString()
    }
    test 'success' { go(42) === '42' }
  }

  // Extractors
  // ----------

  var Digits = {
    hasInstance: function {
      a @ Number if a < 1000 => true,
      * => false
    },
    unapply: function(x) {
      if (Digits.hasInstance(x)) {
        return Math.floor(x).toString().split('').map(parseFloat);
      }
    },
    unapplyObject: function(x) {
      var ds = Digits.unapply(x);
      if (ds) {
        return {
          hundreds: ds[0],
          tens: ds[1],
          ones: ds[2]
        };
      }
    }
  };

  var deep = {
    namespace: {
      Digits: Digits
    }
  };

  function Foo() {}

  it 'should call hasInstance for bare extractors' {
    function go {
      Digits => true,
      *      => false
    }
    test 'success' { go(100) }
    test 'failure' { !go(1001) }
  }

  it 'should fallback to instanceof for bare extractors' {
    function go {
      Foo => true,
      *   => false
    }
    test 'success' { go(new Foo()) }
    test 'failure' { !go(12) }
  }

  it 'should call unapply for array-like destructuring' {
    function go {
      Digits(h, t, o) => [h, t, o]
    }
    test 'success' { go(345) =>= [3, 4, 5] }
    test 'failure' { go(1001) =!= TypeError }
  }

  it 'should call unapplyObject for object-like destructuring' {
    function go {
      Digits{ hundreds: h, tens: t, ones: o } => [h, t, o]
    }
    test 'success' { go(345) =>= [3, 4, 5] }
    test 'failure' { go(1001) =!= TypeError }
  }

  it 'should call extractors within a deep namespace' {
    function go {
      deep.namespace.Digits => true
    }
    test 'success' { go(345) }
  }

  // Arguments
  // ---------

  it 'should allow multiple arguments' {
    function go {
      (x, y, z) => x + y + z
    }
    test 'success' { go('x', 'y', 'z') === 'xyz' }
  }

  it 'should match argument length loosely' {
    function go {
      (x, y, z) => x + y + z
    }
    test 'success' { go('x', 'y') === 'xyundefined' }
  }

  it 'should match unit strictly' {
    function go {
      () => true
    }
    test 'success' { go() }
    test 'failure' { go(1) =!= TypeError }
  }

  it 'should match on the first successful case when ambiguous' {
    function go {
      (a)    => 1,
      (a, b) => 2
    }
    test 'success' { go(1) === 1 }
  }

  it 'should collect rest argument values' {
    function go {
      (a, b, ...c) => [a, b, c]
    }
    test 'success' { go(1, 2, 3, 4) =>= [1, 2, [3, 4]] }
    test 'empty'   { go(1, 2) =>= [1, 2, []] }
  }

  // Rest Patterns
  // -------------

  it 'should map patterns when combined with rest' {
    function go {
      [...Number] => true,
      *           => false
    }
    test 'success' { go([1, 2, 3]) }
    test 'failure' { !go([1, 2, '3']) }
  }

  it 'should allow and collect nested rest patterns' {
    function go {
      [...[heads, ...tails]] => [heads, tails]
    }
    test 'success' {
      go([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]) =>= [
        [1, 4, 7],
        [
          [2, 3],
          [5, 6],
          [8, 9],
        ]
      ]
    }
  }

  // Backtracking
  // ------------

  it 'should only call a pattern once with backtracking' {
    var count = 0;
    var Backtrack = {
      unapply: function(x) {
        count++;
        return [x];
      }
    };

    function go {
      (Backtrack(1), 1) => 1,
      ('foo'       , 2) => 2,
      (Backtrack(1), 3) => 3
    }

    go(1, 3);
    test 'backtrack' { count === 1 }
  }

  // Match keyword
  // -------------

  it 'should support the infix match keyword' {
    function go(test) {
      return match test {
        x @ Number => x.toString(),
        * => null
      }
    }

    test 'success' { go(42) === '42' && go(true) === null }
  }

  // Regressions
  // -----------

  it 'should preserve case order in lieu of grafting' {
    function go {
      (*,     false, true ) => 1,
      (false, true,  *    ) => 2,
      (*,     *,     false) => 3,
      (*,     *,     true ) => 4
    }
    test 'success' { go(false, true, false) === 2 }
  }
}
