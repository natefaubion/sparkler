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

macro compile {
  case { $$mac $ctx $star:star $name ($args ...) { $body ... } } => {
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

macro star {
  rule { * }
  rule {}
}

let function = macro {
  case { $ctx $star:star $name:ident { $body ... } } => {
    return #{
      compile $ctx $star $name () { $body ... }
    };
  }
  case { $ctx $star:star { $body ... } } => {
    return #{
      compile $ctx $star anonymous () { $body ... }
    }
  }
  case { _ } => {
    return #{ function }
  }
}

let match = macro {
  case { $ctx ($op:expr, $rest:expr (,) ...) { $body ... } } => {
    return #{
      compile $ctx anonymous (($op) $(($rest)) ...) { $body ... }
    }
  }
  case { $ctx ($op:expr) { $body ... } } => {
    return #{
      compile $ctx anonymous (($op)) { $body ... }
    }
  }
  case { $ctx $op:expr { $body ... } } => {
    return #{
      compile $ctx anonymous (($op)) { $body ... }
    }
  }
  case { _ } => {
    return #{ match }
  }
}

export function;
export match;
