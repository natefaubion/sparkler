let letstx = macro {
  case { $mac $id:ident $punc = $rhs:expr } => {
    var mac = #{ $mac };
    var id  = #{ $id };
    var val = #{ $val };
    var arg = #{ $($rhs) };
    var punc = #{ $punc };
    var here = #{ here };

    if (punc[0].token.type !== parser.Token.Punctuator ||
        punc[0].token.value !== '...') {
      throw new SyntaxError('Unexpected token: ' + punc[0].token.value +
                            ' (expected ...)');
    }

    if (id[0].token.value[0] !== '$') {
      throw new SyntaxError('Syntax identifiers must start with $: ' + 
                            id[0].token.value);
    }

    return [
      makeIdent('match', mac),
      makePunc('.', here),
      makeIdent('patternEnv', here),
      makeDelim('[]', [makeValue(id[0].token.value, here)], here),
      makePunc('=', here),
      makeDelim('{}', [
        makeIdent('level', here), makePunc(':', here), makeValue(1, here), makePunc(',', here),
        makeIdent('match', here), makePunc(':', here), makeDelim('()', #{
          (function(exp) {
            return exp.length
              ? exp.map(function(t) { return { level: 0, match: [t] } })
              : [{ level: 0, match: [] }];
          })
        }, here), makeDelim('()', arg, here)
      ], here)
    ];
  }
  case { $mac $id:ident = $rhs:expr } => {
    var mac = #{ $mac };
    var id  = #{ $id };
    var val = #{ $val };
    var arg = #{ $($rhs) };
    var here = #{ here };

    if (id[0].token.value[0] !== '$') {
      throw new SyntaxError('Syntax identifiers must start with $: ' + 
                            id[0].token.value);
    }

    return [
      makeIdent('match', mac),
      makePunc('.', here),
      makeIdent('patternEnv', here),
      makeDelim('[]', [makeValue(id[0].token.value, here)], here),
      makePunc('=', here),
      makeDelim('{}', [
        makeIdent('level', here), makePunc(':', here), makeValue(0, here), makePunc(',', here),
        makeIdent('match', here), makePunc(':', here), arg[0]
      ], here)
    ];
  }
}
