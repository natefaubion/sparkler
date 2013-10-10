var assert = require('chai').assert;
require('../extend');

describe 'Extensions' {

  it 'should destructure Dates' {
    function go1 {
      case Date(y, m, d, ...) => [y, m, d]
    }
    function go2 {
      case Date{ time } => time
    }
    test 'unapply'    { go1(new Date(1955, 10, 5)) =>= [1955, 10, 5] }
    test 'unapplyObj' { go2(new Date(123456789)) === 123456789 }
  }

  it 'should destructure RegExps' {
    function go1 {
      case RegExp(p, f) => [p, f]
    }
    function go2 {
      case RegExp{pattern, flags: { 'i' }} => pattern
    }
    test 'unapply'    { go1(/foo/g) =>= ['foo', { g: true }] }
    test 'unapplyObj' { go2(/foo/i) === 'foo' }
  }

  it 'should match with applyTo' {
    function go {
      case { x } => x + 1
    }
    test 'object' {{ x: 2 }.applyTo(go) === 3 }
  }

  it 'should compose with orElse' {
    function go {
      case 42 => true
    }
    var total = go.orElse(function {
      case * => false
    })
    test 'throws'  { go(12) =!= TypeError }
    test 'catches' { total(12) === false }
  }
}
