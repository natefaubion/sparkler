var assert = require('chai').assert;
require('../extend');

describe 'Extensions' {

  it 'should destructure Dates' {
    function go1 {
      Date(y, m, d, ...) => [y, m, d]
    }
    function go2 {
      Date{ time } => time
    }
    test 'unapply'    { go1(new Date(1955, 10, 5)) =>= [1955, 10, 5] }
    test 'unapplyObj' { go2(new Date(123456789)) === 123456789 }
  }

  it 'should destructure RegExps' {
    function go1 {
      RegExp(p, f) => [p, f]
    }
    function go2 {
      RegExp{pattern, flags: { 'i' }} => pattern
    }
    test 'unapply'    { go1(/foo/g) =>= ['foo', { g: true }] }
    test 'unapplyObj' { go2(/foo/i) === 'foo' }
  }

  it 'should compose with orElse' {
    function go {
      42 => true
    }
    var total = go.orElse(function {
      * => false
    })
    test 'throws'  { go(12) =!= TypeError }
    test 'catches' { total(12) === false }
  }
}
