macro (->) {
  rule infix { $a:ident | { $body ... } } => {
    function($a) { $body ... }
  }
  rule infix { ($a:ident (,) ...) | { $body ... } } => {
    function($a (,) ...) { $body ... }
  }
  rule infix { $a:ident | $body:expr } => {
    function($a) { return $body }
  }
  rule infix { ($a:ident (,) ...) | $body:expr } => {
    function($a (,) ...) { return $body }
  }
}

macro $sparkler__compile {
  case { $$mac $ctx $name ($args ...) { $body ... } } => {
    var ctx = #{ $ctx };
    var here = #{ here };
    var fnName = #{ $name };
    var matchStmt = false;
    var matchArgs = #{ $args ... }.map(function(a) {
      return a.expose().token.inner[0].expose().token.inner;
    });

    //= utils.js
    //= data.js
    //= optimize.js
    //= parser.js
    //= compiler.js

    return compile(parse(#{ $body ... }));
  }
}

let function = macro {
  case { $ctx $name:ident { $body ... } } => {
    return #{
      $sparkler__compile $ctx $name () { $body ... }
    };
  }
  case { $ctx { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous () { $body ... }
    }
  }
  case { _ } => {
    return #{ function }
  }
}

let match = macro {
  case { $ctx ($op:expr, $rest:expr (,) ...) { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous (($op) $(($rest)) ...) { $body ... }
    }
  }
  case { $ctx ($op:expr) { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous (($op)) { $body ... }
    }
  }
  case { $ctx $op:expr { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous (($op)) { $body ... }
    }
  }
  case { _ } => {
    return #{ match }
  }
}

export function;
export match;
