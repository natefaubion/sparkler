let letstx = macro {
  case { $mac $id:ident $punc = $rhs:expr } => {
    var mac = #{ $mac };
    var id  = #{ $id };
    var val = #{ $val };
    var arg = #{ $($rhs) };
    var punc = #{ $punc };

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
      makePunc('.'),
      makeIdent('patternEnv'),
      makeDelim('[]', [makeValue(id[0].token.value)]),
      makePunc('='),
      makeDelim('{}', [
        makeIdent('level'), makePunc(':'), makeValue(1), makePunc(','),
        makeIdent('match'), makePunc(':'), makeDelim('()', #{
          (function(exp) {
            return exp.length
              ? exp.map(function(t) { return { level: 0, match: [t] } })
              : [{ level: 0, match: [] }];
          })
        }), makeDelim('()', arg)
      ])
    ];
  }
  case { $mac $id:ident = $rhs:expr } => {
    var mac = #{ $mac };
    var id  = #{ $id };
    var val = #{ $val };
    var arg = #{ $($rhs) };

    if (id[0].token.value[0] !== '$') {
      throw new SyntaxError('Syntax identifiers must start with $: ' + 
                            id[0].token.value);
    }

    return [
      makeIdent('match', mac),
      makePunc('.'),
      makeIdent('patternEnv'),
      makeDelim('[]', [makeValue(id[0].token.value)]),
      makePunc('='),
      makeDelim('{}', [
        makeIdent('level'), makePunc(':'), makeValue(0), makePunc(','),
        makeIdent('match'), makePunc(':'), arg[0]
      ])
    ];
  }
}
