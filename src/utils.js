function input(stx, state) {
  var pos = 0;
  var inp = {
    length: stx.length,
    buffer: stx,
    peek: peek,
    take: take,
    takeAPeek: takeAPeek,
    back: back,
    rest: rest,
    state: state || {},
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
    if (len == null) len = 1;
    var res = stx.slice(pos, pos + len);
    pos += len;
    inp.length -= len;
    return res;
  }

  function takeAPeek() {
    var res = peek.apply(null, arguments);
    if (res) return take(res.length);
  }

  function back(len) {
    if (len == null) len = 1;
    pos -= len;
    inp.length += len;
  }

  function rest() {
    return stx.slice(pos);
  }
}

function environment(vars) {
  var env = _.extend({
    set: set,
    stash: stash,
    retrieve: retrieve
  }, vars);

  return env;

  function set(mod) {
    return environment(extend({}, vars, mod));
  }

  function stash(k, v) {
    assert(v, 'Expected value for ' + k);
    var spec = {};
    spec[k] = v;

    return set({
      refs: extend({}, vars.refs, spec)
    });
  }

  function retrieve(k) {
    assert(vars.refs.hasOwnProperty(k), 'Ref does not exist for ' + k);
    return vars.refs[k];
  }
}

function equals(x, y) {
  if (x && x.equals) {
    return x.equals(y);
  }
  if (Array.isArray(x)) {
    return arrayEquals(x, y);
  }
  return x === y;
}

function arrayEquals(x, y) {
  if (!Array.isArray(y) || x.length !== y.length) {
    return false;
  }
  for (var i = 0; i < x.length; i++) {
    if (!equals(x[i], y[i])) {
      return false;
    }
  }
  return true;
}

function extend(o) {
  for (var i = 1; i < arguments.length; i++) {
    var a = arguments[i];
    var k = Object.keys(a);
    for (var j = 0; j < k.length; j++) {
      o[k[j]] = a[k[j]];
    }
  }
  return o;
}

function constant(x) {
  return function() {
    return x;
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failure: ' + msg);
}

function concat(x, y) {
  return x.concat(y);
}

function repeat(len, f) {
  if (!len) return [];
  var res = Array(len);
  for (var i = 0; i < len; i++) res[i] = f(i);
  return res;
}

function join(j, arr) {
  if (!arr.length) return [];
  return arr.reduce(function(a, b) {
    return a.concat(j, b);
  });
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

function syntaxError(tok, err, info) {
  if (!err) err = 'Unexpected token';
  if (info) err += ' (' + info + ')';
  throwSyntaxError('sparkler', err, tok);
}

var refId = 0;

function makeRef(ctx) {
  if (!ctx) ctx = here;
  return [makeIdent('r' + (refId++), ctx)];
}

function makeAssign(ident, rhs, ctx) {
  if (!ctx) ctx = here;
  return [makeKeyword('var', ctx), ident].concat(
    rhs ? [makePunc('=', ctx)].concat(rhs) : [],
    makePunc(';', ctx)
  );
}

function replaceIdents(guard, names) {
  function traverse(arr) {
    var stx = [];
    for (var i = 0, s; s = arr[i]; i++) {
      if (s.token.type === T.Delimiter) {
        var clone = cloneSyntax(s);
        s.token.inner = traverse(s.token.inner);
        stx.push(s);
      } else if (s.token.type === T.Identifier && 
                 names.hasOwnProperty(s.token.value)) {
        stx.push.apply(stx, names[s.token.value]);
      } else {
        stx.push(s);
      }
    }
    return stx;
  }
  return traverse(guard);
}

// HACK! Sweet.js needs to expose syntax cloning to macros
function cloneSyntax(stx) {
  function F(){}
  F.prototype = stx.prototype;
  F.prototype.constructor = stx.prototype.constructor;
  var s = new F();
  extend(s, stx);
  s.token = extend({}, s.token);
  return s;
}

// DEBUG
// -----

// function stxToString(stx) {
//   return stx.map(unwrapSyntax).join(' ');
// }

// function stripAnn(t) {
//   if (t && t.ann) {
//     if (t.ann.stx) t.ann.stx = stxToString(t.ann.stx);
//     if (t.ann.extractor) t.ann.extractor = stxToString(t.ann.extractor);
//     if (t.ann.idents) t.ann.idents = t.ann.idents.map(stxToString);
//     if (t.ann.stashes) t.ann.stashed = t.ann.stashed.map(stxToString);
//   }
//   if (t && t.node) {
//     stripAnn(t.node);
//   }
//   if (t && t.branches) {
//     t.branches.map(stripAnn);
//   }
//   return t;
// }

// var _inspect = require('util').inspect;
// var inspect = function(x, y) { return _inspect(x, null, y || 1000) };
