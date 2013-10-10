let describe = macro {
  rule { $name { $body ... } } => {
    describe($name, function() { $body ... });
  }
}

let it = macro {
  rule { $name { $body ... } } => {
    it($name, function() { $body ... });
  }
}

let fn = macro {
  rule { { $body ... } } => {
    function(){ $body ... }
  }
}

let test = macro {
  rule { $desc { $a:expr =>= $b:expr } } => {
    assert.deepEqual($a, $b, $desc);
  }
  rule { $desc { $a:expr =!= $b:ident ( $str ) } } => {
    assert.throws(function(){ $a }, $b, $str, $desc);
  }
  rule { $desc { $a:expr =!= $b:ident } } => {
    assert.throws(function(){ $a }, $b, null, $desc);
  }
  rule { $desc { $a:expr } } => {
    assert($a, $desc);
  }
}
