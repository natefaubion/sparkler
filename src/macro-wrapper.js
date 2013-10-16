macro $sparkler__compile {
  case { $$mac $ctx $name ( $body ... ) } => {
    var ctx = #{ $ctx };
    var mac = #{ here };
    var fnName = #{ $name };
    var body = #{ $body ... };

    {{ MACRO }}

    if (matchesToken({ type: T.Identifier, value: 'backtrack' }, body[0])) {
      return compileBacktrack(parse(body.slice(1)));
    } else {
      return compileSimple(parse(body));
    }
  }
}

let function = macro {
  case { $ctx $name:ident { $body ... } } => {
    return #{
      $sparkler__compile $ctx $name ($body ...)
    };
  }
  case { $ctx { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous ($body ...)
    }
  }
  case { _ } => {
    return #{ function }
  }
}
