// Inferred Globals:
//   ctx = The original context of the code, so we can break hygiene.
//   mac = The context of the current macro.
//   args = The identifier of the function's arguments.
//   fnName = The name of the currently compiling function.

// State
// -----

// Used by the parser to consume syntax arrays. Note that this will exhaust the
// source array (ie, no copying).
function input(stx) {
  return {
    buffer: stx,
    peek: peek,
    take: take,
    takeAPeek: takeAPeek,
    put: put
  };

  function peek() {
    if (arguments.length === 0) {
      return [stx[0]];
    }
    if (typeof arguments[0] === 'number') {
      if (stx.length < arguments[0]) return;
      return stx.slice(0, arguments[0]);
    }
    var res = [];
    for (var i = 0, j = 0, t, a, m; i < arguments.length; i++) {
      a = arguments[i];
      t = stx[j++];
      if (!matchesToken(a, t)) return;
      res.push(t);
    }
    return res;
  }

  function take(len) {
    return stx.splice(0, len || 1);
  }

  function takeAPeek() {
    var res = this.peek.apply(this, arguments);
    if (res) return take(res.length);
  }

  function put(toks) {
    stx.unshift.apply(stx, toks);
  }
}

// Used by the compiler to track state. Each pattern compiler takes an
// environment with the data/references it needs. It is (mostly) immutable
// since we have to do a lot of branching.
function environment(vars) {
  var env = _.extend({
    set: set,
    addName: addName,
    addHead: addHead
  }, vars);

  return env;

  function set(mod) {
    return environment(_.extend({}, vars, mod));
  }

  // Whenever an identifier is encountered in a pattern, it's pushed onto the
  // name queue so we can make the references at the end of a branch.
  function addName(stx) {
    return set({
      names: vars.names.concat({ stx: stx })
    });
  }

  // Head references are global to the function being generated, so we just
  // mutate it.
  function addHead(name, stx) {
    if (!vars.head[name]) vars.head[name] = stx;
    return env;
  }
}

// Parser
// ------

var T        = parser.Token;
var EQ       = { type: T.Punctuator, value: '=' };
var GT       = { type: T.Punctuator, value: '>' };
var REST     = { type: T.Punctuator, value: '...' };
var COLON    = { type: T.Punctuator, value: ':' };
var AT       = { type: T.Punctuator, value: '@' };
var COMMA    = { type: T.Punctuator, value: ',' };
var PERIOD   = { type: T.Punctuator, value: '.' };
var WILDCARD = { type: T.Punctuator, value: '*' };
var UNDEF    = { type: T.Identifier, value: 'undefined' };
var VOID     = { type: T.Keyword,    value: 'void' };
var CASE     = { type: T.Keyword,    value: 'case' };
var IF       = { type: T.Keyword,    value: 'if' };
var FOR      = { type: T.Keyword,    value: 'for' };
var RETURN   = { type: T.Keyword,    value: 'return' };
var BRACKETS = { type: T.Delimiter,  value: '[]' };
var PARENS   = { type: T.Delimiter,  value: '()' };
var BRACES   = { type: T.Delimiter,  value: '{}' };
var IDENT    = { type: T.Identifier };
var BOOL     = { type: T.BooleanLiteral };
var NULL     = { type: T.NullLiteral };
var STRING   = { type: T.StringLiteral };
var NUMBER   = { type: T.NumericLiteral };

function parse(stx) {
  var inp = input(stx);
  var cases = [];
  var patts = {};
  while (inp.buffer.length) {
    var list = scanArgumentList(inp);
    var guard = scanGuard(inp);
    var body = scanCaseBody(inp);
    var args = parseArgumentList(input(list));

    if (patts.hasOwnProperty(args.pattern)) {
      syntaxError(null, 'Duplicate argument case: (' + args.pattern + ')');
    } else {
      patts[args.pattern] = true;
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
  var tok = inp.takeAPeek(CASE);
  if (!tok) syntaxError(inp.take(), 'expected case');

  var res = inp.takeAPeek(PARENS);
  if (res) {
    if (inp.peek(IF) || inp.peek(EQ, GT)) return res[0].token.inner;
    if (inp.peek(EQ)) syntaxError(inp.take(), 'maybe you meant =>');
    throw syntaxError(inp.take());
  }

  res = [];
  while (inp.buffer.length) {
    if (inp.peek(IF) || inp.peek(EQ, GT)) return res;
    if (inp.peek(EQ)) syntaxError(inp.take(), 'maybe you meant =>');
    if (inp.peek(COMMA)) syntaxError(inp.take(), 'multiple parameters require parens');
    res.push(inp.take()[0]);
  }
  syntaxError([], 'case body required');
}

function scanGuard(inp) {
  var res = inp.takeAPeek(IF);
  if (!res) return [];

  res = [];
  while (inp.buffer.length) {
    if (inp.peek(EQ, GT)) return res;
    res.push(inp.take()[0]);
  }
  syntaxError([], 'case body required');
}

function scanCaseBody(inp) {
  inp.take(2);
  var res = inp.takeAPeek(BRACES);
  if (res) {
    if (inp.peek(CASE) || !inp.buffer.length) {
      // We need to expose the block, otherwise all the inner tokens will lose
      // their context and vars won't get renamed/resolved correctly.
      return forceReturn(res[0].expose().token.inner);
    }
    syntaxError(inp.take(), 'maybe you meant case');
  }

  res = [];
  while (inp.buffer.length) {
    if (inp.peek(CASE)) break;
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
  while (inp.buffer.length) {
    if (toks = inp.takeAPeek({ type: T.Keyword }, PARENS, RETURN)) {
      res = res.concat(toks);
    } else if (toks = inp.takeAPeek(RETURN)) {
      needsReturn = false;
      res.push(toks[0]);
    } else {
      res.push(inp.take()[0]);
    }
  }
  if (needsReturn) res.push(makeKeyword('return'));
  return res;
}

function parseArgumentList(inp) {
  return inp.buffer.length
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
  if (res) return $rest(parsePattern(inp) || $wildcard());
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
      inp.put(stx.reverse());
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
      syntaxError(inp.take(), 'not a pattern');
    }

    return $key(key);
  }
}

function parseBinder(inp) {
  var res = inp.takeAPeek({ type: T.Identifier }, AT);
  if (res) {
    var patt = parsePattern(inp);
    if (patt) return $binder([res[0]], patt);
    syntaxError(inp.take(), 'not a pattern');
  }
}

function parseIdentifier(inp) {
  var res = inp.takeAPeek({ type: T.Identifier });
  if (res) return $identifier(res);
}

function commaSeparated(parser, inp, cb) {
  var all = [], res;
  while (inp.buffer.length) {
    res = parser(inp);
    if (res && !cb || res && cb(res, inp)) {
      all.push(res);
      inp.takeAPeek(COMMA);
    } else if (!res) {
      syntaxError(inp.take(), 'maybe you meant ,');
    }
  }
  return all;
}

function multiRestCallback() {
  var count = 0;
  return function(res, inp) {
    if (res.type === 'rest' && count++) {
      syntaxError('...', 'multiple ...s are not allowed');
    }
    return true;
  }
}

function syntaxError(tok, info) {
  var name = fnName[0].token.value === 'anonymous'
    ? 'anonymous function'
    : '`' + fnName[0].token.value + '`';

  var err;

  if (!tok) {
    err = '(sparkler macro) ' + info;
  } else if (!tok.length) {
    err = '(sparkler macro) Unexpected end of input in ' + name;
    if (info) err += ' (' + info + ')';
  } else {
    var str = _.isString(tok) 
      ? tok 
      : tok[0].token.type === T.Delimiter
        ? tok[0].token.value[0]
        : tok[0].token.value;

    err = '(sparkler macro) Unexpected token in ' + name;
    err += ': ' + str;
    if (info) err += ' (' + info + ')';
  }

  throw new SyntaxError(err);
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
  var val = stx[0].token.value;
  return {
    type: 'literal',
    pattern: stx[0].token.type === T.NullLiteral ? val : JSON.stringify(val),
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
    if (x.pattern.indexOf('...') === 0 && i !== args.length - 1)
      syntaxError('...', 'rest arguments are only allowed at the end')
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

function $rest(patt) {
  return {
    type: 'rest',
    pattern: '...' + patt.pattern,
    children: [patt]
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

function joinPatterns(j, cs) {
  return cs.map(function(c) {
    return c.pattern;
  }).join(j);
}

// Compiler
// --------

function compile(cases) {
  // Collect all the identifier names so we can zip them up with the refs
  // created during compilation.
  cases.forEach(function(c) {
    c.names = findIdents(c.args.children).map(function(i) {
      return i.name;
    });
  });

  // Get the length of the longest case so we can create the argument
  // references in our function declaration.
  var argCount = cases.reduce(function(acc, c) {
    // Empty argument lists and wildcards don't touch the arguments so we
    // can bail.
    if (!c.args.pattern || c.args.pattern === '*') return acc;

    var count = c.args.children.length;
    var hasRest = _.any(c.args.children, function(a) {
      return a.children[0].type === 'rest';
    });
    if (hasRest) count -= 1;
    return count > acc ? count : acc;
  }, 0);

  var argNames = [];
  while (argCount--) {
    argNames.unshift(makeIdent('a' + argCount, mac));
  }

  var env = environment({
    cases: cases,
    head: {},
    names: [],
    argNames: argNames,
    // Level represents the branch level, or the index of the current
    // function argument.
    level: 0
  });

  var branches = optimizeBranches(cases);
  var body = compileBranches(branches, env);
  var err  = #{ throw new TypeError('No match') };
  var head = joinRefs(_.values(env.head));

  letstx $name ... = fnName[0].token.value === 'anonymous' ? [] : fnName;
  letstx $args ... = intercalate(makePunc(','), argNames);
  letstx $code ... = optimizeSyntax(head.concat(body).concat(err));
  return #{
    function $name ... ($args ...) {
      $code ...
    }
  }
}

// Takes an array of { args, body } case objects and turns it into an optimized
// decision tree. Each argument node ends up with a `branches` attribute
// representing the next possible paths to take. If two argument nodes share
// the same pattern they can be grafted together.
function optimizeBranches(cases) {
  var branches = cases.map(function(c) {
    var patts = c.args.children;
    var last = patts[patts.length - 1];

    // Cases can have the same branching, but different guards. So if there is
    // a guard we need to queue them up.
    if (c.guard.length) {
      last.guards = [{ guard: c.guard, body: c.body, names: c.names }];
    } else {
      last.body = c.body;
      last.names = c.names;
    }

    return patts.reduceRight(function(acc, patt) {
      patt.branches = [acc];
      return patt;
    });
  });

  function graft(bs) {
    for (var i = 1; i < bs.length; i++) {
      for (var j = 0; j < i; j++) {
        if (bs[i].pattern === bs[j].pattern) {
          if (bs[i].branches) {
            if (!bs[j].branches) bs[j].branches = [];
            bs[j].branches = bs[j].branches.concat(bs[i].branches);
          } else if (bs[i].guards) {
            if (!bs[j].guards) bs[j].guards = [];
            bs[j].guards = bs[j].guards.concat(bs[i].guards);
          } else {
            bs[j].body = bs[i].body;
            bs[j].names = bs[i].names;
          }
          bs.splice(i, 1);
          i--;
        }
      }
    }
    bs.forEach(function(b) {
      if (b.branches) graft(b.branches);
    });
    return bs;
  }

  return graft(branches);
}

var compilers = {
  'argument'   : compileArgument,
  'unit'       : compileUnit,
  'wildcard'   : compileWildcard,
  'undefined'  : compileUndefined,
  'literal'    : compileLiteral,
  'identifier' : compileIdentifier,
  'binder'     : compileBinder,
  'extractor'  : compileExtractor,
  'object'     : compileObject,
  'keyValue'   : compileKeyValue,
  'key'        : compileKey,
  'unapply'    : compileArray,
  'array'      : compileArray,
  'rest'       : compileRest,
};

function compileBranches(branches, env) {
  return branches.reduce(function(acc, b) {
    return acc.concat(compileBranch(b, env));
  }, []);
}

// The compiler is written with continuations. Each pattern compiler takes an
// env and a continuation, with compilation being triggered by applying the
// env to the continuation. The env and continuation get passed down through
// the decision tree, and once we get to a "leaf" the env will have collected
// all the references we need to alias for the branch body. Code is then
// generated starting at the innermost leaf, getting subsequently wrapped as it
// works its way back up to the root.

function compileBranch(patt, env) {
  return compilePattern(patt, env, function (env2) {
    var branchBody, guardBody, pattBody, names;

    if (patt.branches) {
      branchBody = compileBranches(patt.branches, env2);
    }

    if (patt.guards) {
      guardBody = patt.guards.reduceRight(function(rest, g) {
        var names = _.zip(g.names, env2.names);
        var body = joinRefs(names.reduceRight(nameReducer, [])).concat(g.body);
        var guard = [makeKeyword('if'), makeDelim('()', replaceIdents(g.guard, names)), 
          makeDelim('{}', body)];
        return guard.concat(rest);
      }, []);
    }

    if (patt.body) {
      names = _.zip(patt.names, env2.names);
      // We wrap the body in a block so we can easily optimize away code after
      // it that can never be run. The block will be unwrapped in the
      // optimization phase.
      pattBody = joinRefs(names.reduceRight(nameReducer, []))
        .concat(wrapBlock(patt.body));
    } 

    return (branchBody  || [])
      .concat(guardBody || [])
      .concat(pattBody  || []);
  });

  function nameReducer(bod, n) {
    var id = makeIdent(n[0], ctx);
    return [makeAssign(id, n[1].stx)].concat(bod);
  }
}

function compilePattern(patt, env, cont) {
  return compilers[patt.type](patt, env, cont);
}

function compileArgument(patt, env, cont) {
  var child = patt.children[0];
  if (child.type === 'rest') {
    var childEnv = env.set({
      ref: { name: #{ arguments }},
      start: env.level,
      stop: 0,
      level: env.level + 1
    });
    return compilePattern(child, childEnv, cont);
  }
  
  else {
    var ref = makeArgument(env.level, env);
    var childEnv = env.set({ ref: ref, level: env.level + 1 });
    var bod = compilePattern(child, childEnv, cont);
    // If the reference is from a declared function argument instead of from
    // `arguments` indexing, it won't have assignment syntax. Also, if it's a
    // wildcard, it doesn't need a reference.
    return ref.stx && patt.pattern !== '*' ? ref.stx.concat(bod) : bod;
  }
}

function compileUnit(patt, env, cont) {
  letstx $bod ... = cont(env);
  return #{
    if (arguments.length === 0) { $bod ...  }
  }
}

function compileWildcard(patt, env, cont) {
  return cont(env);
}

function compileUndefined(patt, env, cont) {
  letstx $bod ... = cont(env);
  letstx $ref = env.ref.name;
  return #{
    if ($ref === void 0) { $bod ... }
  }
}

function compileLiteral(patt, env, cont) {
  letstx $bod ... = cont(env);
  letstx $ref = env.ref.name;
  letstx $lit = patt.stx;
  return #{
    if ($ref === $lit) { $bod ... }
  }
}

function compileIdentifier(patt, env, cont) {
  env = env.addName(env.ref.name);
  return cont(env);
}

function compileBinder(patt, env, cont) {
  env = env.addName(env.ref.name);
  return compilePattern(patt.children[0], env, cont);
}

function compileExtractor(patt, env, cont) {
  var child = patt.children && patt.children[0];
  var clsName = patt.stx[patt.stx.length - 1].token.value;

  if (child && child.type === 'unapply') {
    var arrRef = makeRef();
    var childEnv = env.set({ ref: arrRef });
    letstx $bod ... = compilePattern(child, childEnv, cont);
    letstx $cls ... = patt.stx;
    letstx $arr = arrRef.name;
    letstx $ref = env.ref.name;
    return #{
      var $arr = $cls ... .unapply($ref);
      $bod ...
    }
  }
  
  else if (child && child.type === 'object') {
    var objRef = makeRef();
    var childEnv = env.set({ hasOwn: true, ref: objRef });
    letstx $bod ... = compilePattern(child, childEnv, cont);
    letstx $cls ... = patt.stx;
    letstx $obj = objRef.name;
    letstx $ref = env.ref.name;
    return #{
      var $obj = $cls ... .unapplyObj($ref);
      $bod ...
    }
  }
  
  else if (patt.stx.length === 1 && natives[clsName]) {
    env = env
      .addHead('toStr', TO_STR_REF)
      .addHead(clsName, natives[clsName]);
    letstx $bod ... = cont(env);
    letstx $toStr = TO_STR_REF.name;
    letstx $natStr = natives[clsName].name;
    letstx $ref = env.ref.name;
    return #{
      if ($toStr.call($ref) === $natStr) { $bod ... }
    }
  }

  else if (patt.stx.length === 1 && clsName === 'NaN') {
    env = env
      .addHead('toStr', TO_STR_REF)
      .addHead(clsName, natives.Number);
    letstx $bod ... = cont(env);
    letstx $toStr = TO_STR_REF.name;
    letstx $natStr = natives.Number.name;
    letstx $ref = env.ref.name;
    return #{
      if ($toStr.call($ref) === $natStr && $ref !== +$ref) { $bod ... }
    }
  }
  
  else {
    letstx $bod ... = cont(env);
    letstx $cls ... = patt.stx;
    letstx $ref = env.ref.name;
    return #{
      if ($cls ... .hasInstance
          ? $cls ... .hasInstance($ref)
          : $ref instanceof $cls ...) { $bod ... }
    }
  }
}

function compileObject(patt, env, cont) {
  var primRef = env.ref;
  env = env.set({ ref: makeRef() });

  cont = patt.children.reduceRight(function(c, p) {
    return function() {
      return compilePattern(p, env, function(e) {
        env = env.set({ names: e.names });
        return c(env);
      });
    };
  }, cont);

  letstx $bod ... = cont(env);
  letstx $ref = primRef.name;
  letstx $box = env.ref.name;
  return #{
    if ($ref != null) {
      var $box = Object($ref);
      $bod ...
    }
  }
}

function makeObjectCheck(ref, key, bod, env) {
  letstx $bod ... = bod;
  letstx $key = key;
  letstx $ref = ref;
  if (env.hasOwn) {
    return #{
      if ($ref.hasOwnProperty($key)) { $bod ... }
    }
  } else {
    return #{
      if ($key in $ref) { $bod ... }
    }
  }
}

function compileKeyValue(patt, env, cont) {
  var key = [makeValue(patt.stx[0].token.value)];
  var ref = makeRef([env.ref.name, makeDelim('[]', key)]);

  var childEnv = env.set({ ref: ref, hasOwn: false });
  var bod = ref.stx.concat(compilePattern(patt.children[0], childEnv, cont));

  return makeObjectCheck(env.ref.name, key, bod, env);
}

function compileKey(patt, env, cont) {
  var child = patt.children[0];

  if (child.type === 'literal') {
    return makeObjectCheck(env.ref.name, child.stx, cont(env), env);
  }

  var key = [makeValue(child.name)];
  var ref = makeRef([env.ref.name, makeDelim('[]', key)]);
  
  var childEnv = env.set({ ref: ref, hasOwn: false });
  var bod = ref.stx.concat(compilePattern(child, childEnv, cont));

  return makeObjectCheck(env.ref.name, [makeValue(child.name)], bod, env);
}

function indexOfRest(patt) {
  for (var i = 0; i < patt.children.length; i++) {
    if (patt.children[i].type === 'rest') return i;
  }
  return -1;
}

function compileArray(patt, env, cont) {
  env = env
    .addHead('toStr', TO_STR_REF)
    .addHead('Array', natives.Array)
    .set({ start: 0 });

  var len = patt.children.length;
  var restIndex = indexOfRest(patt);
  var hasRest = restIndex >= 0;
  if (hasRest) len -= 1;

  if (len >= 0) {
    cont = patt.children.reduceRight(function(c, p) {
      return function(e) {
        var ref, env2;

        if (p.type === 'rest') {
          var stop = -1;
          if (restIndex === 0) stop = len;
          if (restIndex < len) stop = len - restIndex;
          env2 = env.set({ stop: stop });
        }
        
        else {
          var start = env.start < 0
            ? env.ref.name.concat(makePunc('.'), makeIdent('length'), 
                makePunc('-'), makeValue(Math.abs(env.start)))
            : [makeValue(env.start)];
          ref = makeRef([env.ref.name, makeDelim('[]', start)]);
          env2 = env.set({ ref: ref, start: e.start + 1 });
        }

        var bod = compilePattern(p, env2, function(e) {
          env = env.set({ start: e.start, names: e.names });
          return c(e);
        });

        return ref ? ref.stx.concat(bod) : bod;
      }
    }, cont);

    // We don't need to check array length in the case that a rest pattern is
    // applied over an entire array.
    if (hasRest && len > 0 || !hasRest) {
      cont = function(c) {
        return function() {
          var op = hasRest ? #{ >= } : #{ === };
          letstx $bod ... = c(env);
          letstx $ref = env.ref.name;
          letstx $len = [makeValue(len)];
          letstx $op  = op;
          return #{
            if ($ref.length $op $len) { $bod ... }
          }
        }
      }(cont);
    }
  }

  letstx $bod ... = cont(env);
  letstx $toStr = TO_STR_REF.name;
  letstx $arrStr = natives.Array.name;
  letstx $ref = env.ref.name;
  return #{
    if ($toStr.call($ref) === $arrStr) { $bod ... }
  }
}

function compileRest(patt, env, cont) {
  var child = patt.children[0];
  var start = env.start;
  var stop  = env.stop;

  // Invert the start position so the next pattern will be offset from the end.
  env = env.set({ start: -stop });

  // Empty rest patterns have no effect, so we don't need to do anything for
  // them except change the start position for the next pattern.
  if (child.type === 'wildcard') {
    return cont(env);
  }

  var okRef  = makeRef(makeValue(true)); // Whether the pattern matches for every item.
  var iRef   = makeRef(); // The current index in the loop.
  var lenRef = makeRef(); // The length of iteration.
  var inRef  = makeRef(); // The current item.

  // Rest refs are the arrays where values are collected. The root rest pattern
  // won't have this initialized yet.
  var isRootRest = !env.restRefs;
  if (isRootRest) env.restRefs = [];

  // When compiling a rest pattern, we are essentially forking the compilation
  // process, so we need to reset the environment for the child. When the
  // continuation is forced, we will be able to see what names were added to
  // the environment and collect their values into an array.
  var childEnv = env.set({ 
    ref: inRef, 
    names: [], 
    restRefs: []
  });

  var loopBody = compilePattern(child, childEnv, function(env2) {
    function reducer(acc, n) {
      var ref = makeRef(makeDelim('[]', []));
      env.restRefs.push(ref);

      // Array push code: ref[ref.length] = val
      return acc.concat(ref.name,
        makeDelim('[]', ref.name.concat(makePunc('.'), makeIdent('length'))), 
        makePunc('='), n.name || n.stx, makePunc(';'));
    }

    var stx = env2.names.reduceRight(reducer, []);
    if (env2.restRefs) stx = env2.restRefs.reduceRight(reducer, stx);
    return stx.concat(#{ continue; });
  });

  var restRefs = env.restRefs.map(function(r) {
    if (isRootRest) env = env.addName(r.name);
    return r.stx;
  });

  // Generates the code that calculates where to stop looping.
  var stopRef = env.ref.name.concat(makePunc('.'), makeIdent('length'));
  if (stop > 0) stopRef.push(makePunc('-'), makeValue(stop));

  letstx $bod ... = cont(env);
  letstx $loopBod ... = loopBody;
  letstx $start = [makeValue(start)];
  letstx $stop  = [makeDelim('()', stopRef)];
  letstx $ok    = okRef.name;
  letstx $i     = iRef.name;
  letstx $len   = lenRef.name;
  letstx $in    = inRef.name;
  letstx $ref   = env.ref.name;

  var loop = #{
    for (var $i = $start, $len = $stop, $in; $i < $len; $i++) {
      $in = $ref[$i];
      $loopBod ...
      $ok = false;
      break;
    }
  };

  // Rest patterns with identifiers never fail so we can remove the `ok` guard
  // on the body.
  if (child.type === 'identifier') {
    letstx $rrefs ... = joinRefs(restRefs);
    letstx $loop ... = loop
    return #{
      $rrefs ...
      $loop ...
      $bod ...
    }
  } else {
    letstx $rrefs ... = joinRefs([okRef].concat(restRefs));
    letstx $loop ... = loop
    return #{
      $rrefs ...
      $loop ...
      if ($ok) { $bod ... }
    }
  }
}

var refId = 0;

function makeRef(rhs, ctx) {
  if (!ctx) ctx = mac;
  var name = makeIdent('r' + (refId++), ctx);
  var stx = rhs && makeAssign(name, rhs, ctx);
  return {
    name: [name],
    stx: stx
  };
}

var TO_STR_REF = makeRef(#{ Object.prototype.toString });

var natives = {
  'Boolean'   : makeRef(#{ '[object Boolean]' }),
  'Number'    : makeRef(#{ '[object Number]' }),
  'String'    : makeRef(#{ '[object String]' }),
  'RegExp'    : makeRef(#{ '[object RegExp]' }),
  'Date'      : makeRef(#{ '[object Date]' }),
  'Array'     : makeRef(#{ '[object Array]' }),
  'Object'    : makeRef(#{ '[object Object]' }),
  'Function'  : makeRef(#{ '[object Function]' }),
  'Undefined' : makeRef(#{ '[object Undefined]' }),
  'Null'      : makeRef(#{ '[object Null]' }),
  'Math'      : makeRef(#{ '[object Math]' }),
  'Arguments' : makeRef(#{ '[object Arguments]' }),
}

function makeAssign(name, rhs, ctx) {
  if (!ctx) ctx = mac;
  return _.flatten([
    makeKeyword('var', ctx), name, makePunc('=', ctx), rhs, makePunc(';', ctx)
  ]);
}

function makeArgument(i, env, ctx) {
  if (env.argNames.length) {
    return { name: [env.argNames[i]] };
  }

  var index = i < 0
    ? [makeIdent('arguments'), makePunc('.'), makeIdent('length'), 
       makePunc('-'), makeValue(Math.abs(i))]
    : [makeValue(i)];

  return makeRef([makeIdent('arguments'), makeDelim('[]', index, ctx)]);
}

function joinRefs(refs) {
  if (!refs.length) return [];
  refs = _.flatten(intercalate(makePunc(','), refs.map(function(r) {
    return r.stx ? r.stx.slice(1, -1) : r.slice(1, -1);
  })));
  return [makeKeyword('var')].concat(refs, makePunc(';'));
}

function findIdents(patt) {
  return patt.reduce(function(a, p) {
    if (p.type === 'identifier' || p.type === 'binder') a = a.concat(p);
    if (p.children) a = a.concat(findIdents(p.children));
    return a;
  }, []);
}

function replaceIdents(guard, names) {
  names = names.reduce(function(acc, n) {
    acc[n[0]] = n[1].stx[0];
    return acc;
  }, {});

  function traverse(arr) {
    for (var i = 0, s; s = arr[i]; i++) {
      if (s.token.type === T.Delimiter) traverse(s.token.inner);
      if (s.token.type === T.Identifier && 
          names.hasOwnProperty(s.token.value)) {
        arr.splice(i, 1, names[s.token.value]);
      }
    }
    return arr;
  }

  return traverse(guard);
}

function wrapBlock(toks) {
  if (matchesToken(BRACES, toks[0])) {
    return toks;
  }
  return [makeDelim('{}', toks)];
}

function intercalate(x, a) {
  var arr = [];
  for (var i = 0; i < a.length; i++) {
    if (i > 0) arr.push(x);
    arr.push(a[i]);
  }
  return arr;
}

// Syntax Optimization
// -------------------

function optimizeSyntax(stx) {
  var inp = input(stx);
  var res = [];
  var toks, opt;
  while (inp.buffer.length) {
    if (inp.peek()[0].userCode) {
      res.push(inp.take()[0]);
    } else if (toks = inp.takeAPeek({ type: T.Keyword }, PARENS, BRACES)) {
      if (matchesToken(IF, toks[0])) {
        opt = optimizeIfs(toks);
      } else if (matchesToken(FOR, toks[0])) {
        opt = optimizeFors(toks);
      } else {
        opt = toks;
      }
      res = res.concat(opt);
    } else if (toks = inp.takeAPeek(BRACES)) {
      res = res.concat(optimizeSyntax(toks[0].token.inner));
      break;
    } else {
      res.push(inp.take()[0]);
    }
  }
  return res;
}

function optimizeIfs(stx) {
  var pred  = stx[1];
  var block = stx[2];
  var inner = input(optimizeSyntax(block.token.inner));
  var toks  = inner.takeAPeek(IF, PARENS, BRACES);
  if (toks && inner.buffer.length === 0) {
    pred.token.inner = pred.token.inner.concat(makePunc('&&'), toks[1]);
    stx[2] = toks[2];
  } else if (toks) {
    block.token.inner = toks.concat(inner.buffer);
  } else {
    block.token.inner = inner.buffer;
  }
  return stx;
}

function optimizeFors(stx) {
  var inner = optimizeSyntax(stx[2].token.inner);
  for (var i = 0, t; t = inner[i]; i++) {
    if (matchesToken({ type: T.Keyword, value: 'continue' }, t)) {
      inner = inner.slice(0, i);
      break;
    }
  }
  stx[2].token.inner = inner;
  return stx;
}
