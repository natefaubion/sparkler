var T          = parser.Token;
var EQ         = { type: T.Punctuator, value: '=' };
var ARROW      = { type: T.Punctuator, value: '=>' };
var REST       = { type: T.Punctuator, value: '...' };
var COLON      = { type: T.Punctuator, value: ':' };
var AT         = { type: T.Punctuator, value: '@' };
var COMMA      = { type: T.Punctuator, value: ',' };
var PERIOD     = { type: T.Punctuator, value: '.' };
var WILDCARD   = { type: T.Punctuator, value: '*' };
var SCOLON     = { type: T.Punctuator, value: ';' };
var UNDEF      = { type: T.Identifier, value: 'undefined' };
var VOID       = { type: T.Keyword,    value: 'void' };
var CASE       = { type: T.Keyword,    value: 'case' };
var VAR        = { type: T.Keyword,    value: 'var' };
var IF         = { type: T.Keyword,    value: 'if' };
var ELSE       = { type: T.Keyword,    value: 'else' };
var FOR        = { type: T.Keyword,    value: 'for' };
var RETURN     = { type: T.Keyword,    value: 'return' };
var CONTINUE   = { type: T.Keyword,    value: 'continue' };
var BRACKETS   = { type: T.Delimiter,  value: '[]' };
var PARENS     = { type: T.Delimiter,  value: '()' };
var BRACES     = { type: T.Delimiter,  value: '{}' };
var IDENT      = { type: T.Identifier };
var BOOL       = { type: T.BooleanLiteral };
var NULL       = { type: T.NullLiteral };
var STRING     = { type: T.StringLiteral };
var NUMBER     = { type: T.NumericLiteral };
var PUNC       = { type: T.Punctuator };

function parse(stx) {
  var inp = input(stx);
  var cases = [];
  var patts = [];
  var i = 0;

  while (inp.length) {
    var list = scanArgumentList(inp);
    var first = list[0];
    var guard = scanGuard(inp);
    var body = scanCaseBody(inp);
    var inp2 = input(list, { idents: [] });
    var args = parseArgumentList(inp2);

    if (!guard.length) {
      if (patts.some(function(p) { return p.equals(args) })) {
        syntaxError(first, 'Duplicate case');
      } else {
        patts.push(args);
      }
    }

    body.forEach(function(b) {
      b.userCode = true;
    });

    cases.push(args.unapply(function(v, bs) {
      var b = Leaf(Ann(Body(), { stx: body, stashed: inp2.state.idents }));
      var g = guard.length
        ? Branch(Ann(Guard(), { stx: guard, stashed: inp2.state.idents }), [b])
        : b;
      return Branch(Ann(Case(), { index: i++ }), [Branch(v, bs), g]);
    }));
  }

  var len = Math.max.apply(null, cases.map(function(c) {
    return c.branches[0].node.ann.length;
  }));

  cases.forEach(function(c) {
    c.branches[0].node.ann.length = len;
  });

  return Branch(Ann(Fun(len), {}), cases);
}

function scanArgumentList(inp) {
  var res = inp.takeAPeek(PARENS);
  if (res) {
    if (inp.peek(IF) || inp.peek(ARROW)) return res[0].expose().token.inner;
    if (inp.peek(EQ)) syntaxError(inp.take(), null, 'maybe you meant =>');
    throw syntaxError(inp.take());
  }

  res = [];
  while (inp.length) {
    if (inp.peek(IF) || inp.peek(ARROW)) return res;
    if (inp.peek(EQ)) syntaxError(inp.take(), null, 'maybe you meant =>');
    if (inp.peek(COMMA)) syntaxError(inp.take(), null, 'multiple parameters require parens');
    res.push(inp.take()[0]);
  }
  if (res.length) syntaxError(res[res.length - 1], 'Case body required');
  else syntaxError(tok, 'Argument list required');
}

function scanGuard(inp) {
  var tok = inp.takeAPeek(IF);
  if (!tok) return [];

  var res = [];
  while (inp.length) {
    if (inp.peek(ARROW)) {
      if (!res.length) syntaxError(tok, 'Guard required');
      return res;
    }
    res.push(inp.take()[0]);
  }
  if (res.length) syntaxError(res[res.length - 1], 'Case body required');
  else syntaxError(tok, 'Guard required');
}

function scanCaseBody(inp) {
  inp.take(1);
  var res = inp.takeAPeek(BRACES);
  if (res) {
    inp.takeAPeek(COMMA);
    return forceReturn(res[0].expose().token.inner);
  }

  // TODO: rewrite with getExpr as this can lead to hard-to-decipher errors.
  res = [];
  while (inp.length) {
    if (inp.takeAPeek(COMMA)) break;
    res.push(inp.take(1)[0]);
  }

  return prependReturn(res);
}

function parseArgumentList(inp) {
  if (!inp.length) {
    return Branch(Ann(Args(), { length: 0 }),
                  [Branch(Ann(Arg(0), {}),
                          [Leaf(Ann(Unit(), {}))])]);
  }
  var len = 0;
  var args = parseRestPatterns(inp).map(function(p, i, ps) {
    if (p.node.value.isRest) {
      if (i === ps.length - 1) {
        p.node.ann.argRest = true;
        p.node.ann.start = i;
      } else {
        syntaxError(p.args[1].stx, 'Rest arguments are only allowed at the end');
      }
    } else {
      len++;
    }
    return Branch(Ann(Arg(i), {}), [p]);
  });
  return Branch(Ann(Args(), { length: len }), args);
}

function parseRestPatterns(inp) {
  return commaSeparated(parseRestPattern, inp, multiRestCallback());
}

function parseRestPattern(inp) {
  return parseRest(inp) || parsePattern(inp);
}

function parsePattern(inp) {
  return parseWildcard(inp)
      || parseUndefined(inp)
      || parseLiteral(inp)
      || parseArray(inp)
      || parseObject(inp)
      || parseExtractor(inp)
      || parseBinder(inp)
      || parseIdentifier(inp);
}

function parseRest(inp) {
  var res = inp.takeAPeek(REST);
  if (res) {
    var len = inp.state.idents.length;
    var patt = parsePattern(inp);
    var idents = inp.state.idents.slice(len);
    var names = idents.map(unwrapSyntax);
    return Leaf(Ann(Rest(patt || Leaf(Ann(Wild(), {})), names),
                    { stx: res, stashed: inp.state.idents.slice(len) }));
  }
}

function parseWildcard(inp) {
  var res = inp.takeAPeek(WILDCARD);
  if (res) return Leaf(Ann(Wild(), { stx: res }));
}

function parseUndefined(inp) {
  var res = inp.takeAPeek(VOID);
  if (res) {
    // TODO: rewrite with getExpr. This only assumes one token, but void can
    // take an expression.
    if (!inp.peek(PUNC)) {
      return Leaf(Ann(Undef(), { stx: res.concat(inp.take(1)) }));
    }
  }
  res = inp.takeAPeek(UNDEF);
  if (res) return Leaf(Ann(Undef(), { stx: res }));
}

function parseLiteral(inp) {
  var stx = inp.peek(1);
  if (matchesToken(NULL, stx) || matchesToken(NUMBER, stx) ||
      matchesToken(STRING, stx) || matchesToken(BOOL, stx)) {
    var res = inp.take(1);
    return Leaf(Ann(Lit(unwrapSyntax(res)), { stx: res }));
  }
}

function parseExtractor(inp) {
  var stx = [], tok;
  while (tok = inp.peek()) {
    if (stx.length === 0 && matchesToken(IDENT, tok) ||
        stx.length && matchesToken(IDENT, stx[0]) && matchesToken(PERIOD, tok) ||
        stx.length && matchesToken(IDENT, tok) && matchesToken(PERIOD, stx[0])) {
      stx.unshift(inp.take()[0]);
    } else break;
  }

  if (stx.length) {
    if (matchesToken(PERIOD, stx[0])) syntaxError(stx[0]);
    var name = stx[0].token.value;
    if (name[0].toUpperCase() === name[0] &&
        name[0] !== '$' && name[0] !== '_') {
      var ext = parseUnapply(inp) || parseUnapplyObj(inp) || Leaf(Ann(Inst(), {}));
      var nameStr = stx.reverse().map(unwrapSyntax).join('');
      extend(ext.node.ann, { extractor: stx, name: nameStr });
      return Branch(Ann(Extractor(nameStr), { stx: stx }), [ext]);
    } else {
      inp.back(stx.length);
    }
  }
}

function parseArrayLike(delim, ctr, inp) {
  var stx = inp.takeAPeek(delim);
  if (stx) {
    var inp2 = input(stx[0].expose().token.inner, inp.state);
    var inner = parseRestPatterns(inp2)
    var len = arrayLen(inner);

    var withIndex = inner.reduce(function(acc, p, i, arr) {
      var ann = {}, pann, stop, node;
      if (p.node.value.isRest) {
        if (i === 0) {
          stop = -(arr.length - 1);
        } else if (i === arr.length - 1) {
          stop = 0;
        } else {
          stop = -(arr.length - i - 1);
        }
        extend(p.node.ann, { start: i, stop: stop });
        node = Ann(IndexNoop(acc[0] + 1), ann);
      } else {
        stop = acc[0] + 1;
        node = Ann(Index(acc[0]), ann);
      }
      return [stop, acc[1].concat(Branch(node, [p]))];
    }, [0, []]);

    return Branch(Ann(ctr(), {}), [Branch(len, withIndex[1])]);
  }
}

function parseArray(inp) {
  return parseArrayLike(BRACKETS, Arr, inp);
}

function parseUnapply(inp) {
  return parseArrayLike(PARENS, Unapply, inp);
}

function parseObjectLike(ctr, inp) {
  var stx = inp.takeAPeek(BRACES);
  if (stx) {
    var inp2 = input(stx[0].expose().token.inner, inp.state);
    var inner = commaSeparated(parseObjectPattern, inp2);
    return Branch(Ann(ctr(), {}), inner);
  }
}

function parseUnapplyObj(inp) {
  var res = parseObjectLike(UnapplyObj, inp);
  if (res) {
    res.branches.forEach(function(b) {
      b.node.ann.hasOwn = true;
    });
    return res;
  }
}

function parseObject(inp) {
  return parseObjectLike(Obj, inp);
}

function parseObjectPattern(inp) {
  var res = parseBinder(inp);
  if (res) {
    var ann = res.node.ann;
    var name = unwrapSyntax(ann.idents[0]);
    return Branch(Ann(KeyIn(name), ann),
                  [Branch(Ann(KeyVal(name), ann), [res])]);
  }
  var tok = inp.takeAPeek(IDENT) || inp.takeAPeek(STRING);
  if (tok) {
    var name = unwrapSyntax(tok);
    var ann = { stx: tok };
    if (inp.takeAPeek(COLON)) {
      var patt = parsePattern(inp);
      if (patt) {
        return Branch(Ann(KeyIn(name), ann),
                      [Branch(Ann(KeyVal(name), ann), [patt])]);
      }
      syntaxError(inp.take(), null, 'not a pattern');
    }
    if (matchesToken(IDENT, tok)) {
      inp.state.idents.push(tok[0]);
      return Branch(Ann(KeyIn(name), ann),
                    [Branch(Ann(KeyVal(name), ann),
                            [Leaf(Ann(Wild(), { idents: [tok[0]] }))])]);
    }
    return Leaf(Ann(KeyIn(name), ann));
  }
}

function parseBinder(inp) {
  var res = inp.takeAPeek(IDENT, AT);
  if (res) {
    var patt = parsePattern(inp);
    if (patt) {
      inp.state.idents.push(res[0]);
      patt.node.ann.idents = [res[0]];
      return patt;
    }
    syntaxError(inp.take(), null, 'not a pattern');
  }
}

function parseIdentifier(inp) {
  var res = inp.takeAPeek({ type: T.Identifier });
  if (res) {
    inp.state.idents.push(res[0]);
    return Leaf(Ann(Wild(), { idents: [res[0]] }));
  }
}

function commaSeparated(parser, inp, cb) {
  var all = [], res;
  while (inp.length) {
    res = parser(inp);
    if (res && !cb || res && cb(res, inp)) {
      all.push(res);
      if (!inp.takeAPeek(COMMA) && inp.length) {
        syntaxError(inp.take(), null, 'maybe you meant ,');
      }
    } else if (!res) {
      syntaxError(inp.take());
    }
  }
  return all;
}

function multiRestCallback() {
  var count = 0;
  return function(res, inp) {
    return res.unapply(function(v, ann) {
      if (v.tag === 'Rest' && count++) {
        syntaxError(ann.stx, 'Multiple ...s are not allowed');
      }
      return true;
    });
  }
}

function arrayLen(bs) {
  var ctr = bs.reduce(function(ctr, b) {
    return b.node.value.isRest
      ? [LenMin, ctr[1]]
      : [ctr[0], ctr[1] + 1]
  }, [Len, 0]);
  return Ann(ctr[0](ctr[1]), {});
}
