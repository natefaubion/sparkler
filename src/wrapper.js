macro $sparkler__compile {
  case { $$mac $ctx $name { $body ... } } => {
    var ctx = #{ $ctx };
    var here = #{ here };
    var fnName = #{ $name };

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
      $sparkler__compile $ctx $name { $body ... }
    };
  }
  case { $ctx { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous { $body ... }
    }
  }
  case { _ } => {
    return #{ function }
  }
}

let match = macro {
  case { $ctx $op:expr { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op))
    }
  }
  case { $ctx ($op:expr) { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op))
    }
  }
  case { $ctx ($op:expr, $rest:expr (,) ...) { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op, $rest (,) ...))
    }
  }
  case { _ } => {
    return #{ match }
  }
}

export function;
export match;
