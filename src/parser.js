// Parser
// ------

var T        = parser.Token;
var EQ       = { type: T.Punctuator, value: '=' };
var ARROW    = { type: T.Punctuator, value: '=>' };
var REST     = { type: T.Punctuator, value: '...' };
var COLON    = { type: T.Punctuator, value: ':' };
var AT       = { type: T.Punctuator, value: '@' };
var COMMA    = { type: T.Punctuator, value: ',' };
var PERIOD   = { type: T.Punctuator, value: '.' };
var WILDCARD = { type: T.Punctuator, value: '*' };
var SCOLON   = { type: T.Punctuator, value: ';' };
var UNDEF    = { type: T.Identifier, value: 'undefined' };
var VOID     = { type: T.Keyword,    value: 'void' };
var CASE     = { type: T.Keyword,    value: 'case' };
var VAR      = { type: T.Keyword,    value: 'var' };
var IF       = { type: T.Keyword,    value: 'if' };
var ELSE     = { type: T.Keyword,    value: 'else' };
var FOR      = { type: T.Keyword,    value: 'for' };
var RETURN   = { type: T.Keyword,    value: 'return' };
var CONTINUE = { type: T.Keyword,    value: 'continue' };
var BRACKETS = { type: T.Delimiter,  value: '[]' };
var PARENS   = { type: T.Delimiter,  value: '()' };
var BRACES   = { type: T.Delimiter,  value: '{}' };
var IDENT    = { type: T.Identifier };
var BOOL     = { type: T.BooleanLiteral };
var NULL     = { type: T.NullLiteral };
var STRING   = { type: T.StringLiteral };
var NUMBER   = { type: T.NumericLiteral };

// For consuming syntax arrays.
function input(stx) {
  var pos = 0;
  var inp = {
    length: stx.length,
    buffer: stx,
    peek: peek,
    take: take,
    takeAPeek: takeAPeek,
    back: back,
    rest: rest
  };

  return inp;

  function peek() {
    if (arguments.length === 0) {
      return [stx[pos]];
    }
    if (typeof arguments[0] === 'number') {
      if (inp.length < arguments[0]) return;
      return stx.slice(pos, pos + arguments[0]);
    }
    var res = [];
    for (var i = 0, j = pos, t, a, m; i < arguments.length; i++) {
      a = arguments[i];
      t = stx[j++];
      if (!matchesToken(a, t)) return;
      res.push(t);
    }
    return res;
  }

  function take(len) {
    var res = stx.slice(pos, pos + (len || 1));
    pos += len || 1;
    inp.length -= len || 1;
    return res;
  }

  function takeAPeek() {
    var res = peek.apply(null, arguments);
    if (res) return take(res.length);
  }

  function back(len) {
    pos -= len || 1;
    inp.length += len || 1;
  }

  function rest() {
    return stx.slice(pos);
  }
}

function parse(stx) {
  var inp = input(stx);
  var cases = [];
  var patts = {};
  while (inp.length) {
    var list = scanArgumentList(inp);
    var first = list[0]; // Keep around in case of error.
    var guard = scanGuard(inp);
    var body = scanCaseBody(inp);
    var args = parseArgumentList(input(list));

    // Cases can have the same arguments but different guards.
    if (!guard.length) {
      if (patts.hasOwnProperty(args.pattern)) {
        syntaxError(first, 'Duplicate argument case: (' + args.pattern + ')');
      } else {
        patts[args.pattern] = true;
      }
    }

    cases.push({
      args: args,
      guard: guard,
      body: body.map(function(b) {
        // We don't want to optimize user code at the end, so we mark it as
        // such to avoid it.
        b.userCode = true;
        return b;
      })
    });
  }
  return cases;
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

  res = [];
  while (inp.length) {
    if (inp.takeAPeek(COMMA)) break;
    res.push(inp.take(1)[0]);
  }

  return prependReturn(res);
}

function matchesToken(tmpl, t) {
  if (t && t.length === 1) t = t[0];
  if (!t || tmpl.type && t.token.type !== tmpl.type 
         || tmpl.value && t.token.value !== tmpl.value) return false;
  return true;
}

function prependReturn(stx) {
  if (matchesToken({ type: T.Keyword, value: 'return' }, stx[0])) {
    return stx;
  }
  var ret = makeKeyword('return', stx[0])
  return [ret].concat(stx);
}

function forceReturn(stx) {
  var needsReturn = true;
  var inp = input(stx);
  var res = [], toks;
  while (inp.length) {
    if (toks = inp.takeAPeek({ type: T.Keyword }, PARENS, RETURN)) {
      res = res.concat(toks);
    } else if (toks = inp.takeAPeek(RETURN)) {
      needsReturn = false;
      res.push(toks[0]);
    } else {
      res.push(inp.take()[0]);
    }
  }
  if (needsReturn) res.push(makeKeyword('return', here));
  return res;
}

function parseArgumentList(inp) {
  return inp.length
    ? $arguments(parseRestPatterns(inp).map($argument))
    : $arguments([$unit()]);
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
  if (res) return $rest(res, parsePattern(inp) || $wildcard());
}

function parseWildcard(inp) {
  var res = inp.takeAPeek(WILDCARD);
  if (res) return $wildcard(res);
}

function parseUndefined(inp) {
  var res = inp.takeAPeek(VOID);
  if (res) {
    var stx = inp.peek(1);
    if (stx[0].token.type !== T.Punctuator) {
      inp.take(1);
      return $undefined(res);
    }
  }
  res = inp.takeAPeek(UNDEF);
  if (res) return $undefined(res);
}

function parseLiteral(inp) {
  var stx = inp.peek(1);
  if (matchesToken(NULL, stx) || matchesToken(NUMBER, stx) ||
      matchesToken(STRING, stx) || matchesToken(BOOL, stx)) {
    return $literal(inp.take(1));
  }
}

function parseExtractor(inp) {
  // Extractors are allowed to be part of an object path, so we have to consume
  // the entire path, alternating between identifiers and periods.
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
      var ext = parseUnapply(inp) || parseObject(inp);
      return $extractor(stx.reverse(), ext);
    } else {
      inp.back(stx.length);
    }
  }
}

function parseArray(inp) {
  var stx = inp.takeAPeek(BRACKETS);
  if (stx) {
    var inp2 = input(stx[0].token.inner);
    return $array(parseRestPatterns(inp2));
  }
}

function parseUnapply(inp) {
  var stx = inp.takeAPeek(PARENS);
  if (stx) {
    var inp2 = input(stx[0].token.inner);
    return $unapply(parseRestPatterns(inp2));
  }
}

function parseObject(inp) {
  var stx = inp.takeAPeek(BRACES);
  if (stx) {
    var inp2 = input(stx[0].token.inner);
    return $object(commaSeparated(parseObjectPattern, inp2));
  }
}

function parseObjectPattern(inp) {
  var res = parseBinder(inp);
  if (res) return $key(res);

  var tok = inp.takeAPeek({ type: T.Identifier }) ||
            inp.takeAPeek({ type: T.StringLiteral });

  if (tok) {
    var key = tok[0].token.type === T.Identifier
      ? $identifier(tok)
      : $literal(tok)

    if (inp.takeAPeek(COLON)) {
      var patt = parsePattern(inp);
      if (patt) return $keyValue(key, patt);
      syntaxError(inp.take(), null, 'not a pattern');
    }

    return $key(key);
  }
}

function parseBinder(inp) {
  var res = inp.takeAPeek({ type: T.Identifier }, AT);
  if (res) {
    var patt = parsePattern(inp);
    if (patt) return $binder([res[0]], patt);
    syntaxError(inp.take(), null, 'not a pattern');
  }
}

function parseIdentifier(inp) {
  var res = inp.takeAPeek({ type: T.Identifier });
  if (res) return $identifier(res);
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
    if (res.type === 'rest' && count++) {
      syntaxError(res.stx, 'Multiple ...s are not allowed');
    }
    return true;
  }
}

// Nodes
// -----

// Each node returns a normalized pattern so we can do easy comparisons during
// the branch optimization phase.

function $wildcard() {
  return { 
    type: 'wildcard',
    pattern: '*'
  };
}

function $undefined() {
  return { 
    type: 'undefined', 
    pattern: 'undefined'
  };
}

function $literal(stx) {
  var val  = stx[0].token.value;
  var type = stx[0].token.type;
  return {
    type: 'literal',
    pattern: type === T.BooleanLiteral || 
             type === T.NullLiteral ? val : JSON.stringify(val),
    stx: stx
  };
}

function $extractor(name, extractor) {
  var namePatt = name.reduce(function(acc, n) {
    return acc + n.token.value;
  }, '');
  return {
    type: 'extractor',
    pattern: namePatt + (extractor ? extractor.pattern : ''),
    stx: name,
    children: extractor && [extractor]
  };
}

function $arguments(args) {
  // Since argument length isn't strict, rest arguments are only allowed at the
  // trailing end of the argument list.
  args.forEach(function(x, i) {
    if (x.pattern.indexOf('...') === 0 && i !== args.length - 1) {
      syntaxError(x.children[0].stx, 'Rest arguments are only allowed at the end');
    }
  });
  return {
    type: 'arguments',
    pattern: joinPatterns(',', args),
    children: args
  };
}

function $argument(patt) {
  return {
    type: 'argument',
    pattern: patt.pattern,
    children: [patt]
  };
}

function $rest(stx, patt) {
  return {
    type: 'rest',
    pattern: '...' + patt.pattern,
    children: [patt],
    stx: stx
  };
}

function $array(items) {
  return {
    type: 'array',
    pattern: '[' + joinPatterns(',', items) + ']',
    children: items
  };
}

function $unapply(items) {
  return {
    type: 'unapply',
    pattern: '(' + joinPatterns(',', items) + ')',
    children: items
  };
}

function $object(items) {
  // Sort the keys since their order does not matter to execution. This will
  // allow two argument nodes that destructure the same keys, but in different
  // orders, to still be grafted together.
  items = _.sortBy(items, function(i) {
    return i.pattern;
  });
  return {
    type: 'object',
    pattern: '{' + joinPatterns(',', items) + '}',
    children: items
  };
}

function $keyValue(key, value) {
  // `key` can be an identifier or string literal. If it's an identifier we
  // need to normalize it to a quoted string.
  var pattern = key.type === 'literal'
    ? key.pattern
    : JSON.stringify(key.name)

  return {
    type: 'keyValue',
    pattern: pattern + ':' + value.pattern,
    stx: key.stx,
    children: [value]
  };
}

function $key(key) {
  // `key` can be a binder, identifier, or string literal.
  var pattern = key.type === 'literal'
    ? key.pattern + ':*'
    : JSON.stringify(key.name) + ':' + key.pattern;

  return {
    type: 'key',
    pattern: pattern,
    children: [key]
  };
}

function $binder(ident, patt) {
  return {
    type: 'binder',
    pattern: '$@' + patt.pattern,
    name: ident[0].token.value,
    stx: ident,
    children: [patt] 
  };
}

function $identifier(ident) {
  return {
    type: 'identifier',
    // All identifiers have the same pattern, because they represent the exact
    // same logic. For example:
    //
    //     function {
    //       case (a, 12) => a + 12
    //       case (b, 42) => b + 42
    //     }
    // 
    // Here, `a` and `b` represent the same branch logic. Their name only
    // matters to the function body.
    pattern: '$',
    name: ident[0].token.value,
    stx: ident
  };
}

function $unit() {
  return {
    type: 'unit',
    pattern: '',
    children: []
  };
}
