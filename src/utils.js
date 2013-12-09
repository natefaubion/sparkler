function syntaxError(tok, err, info) {
  if (!err) err = 'Unexpected token';
  if (info) err += ' (' + info + ')';
  throwSyntaxError('sparkler', err, tok);
}

var refId = 0;

function makeRef(rhs, ctx) {
  if (!ctx) ctx = mac;
  var name = makeIdent('r' + (refId++), ctx);
  var stx = makeAssign(name, rhs, ctx);
  return {
    name: [name],
    stx: stx
  };
}

function makeAssign(name, rhs, ctx) {
  if (!ctx) ctx = mac;
  return _.flatten([
    makeKeyword('var', ctx), name, rhs ? [makePunc('=', ctx), rhs] : [], makePunc(';', ctx)
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

function indexOfRest(patt) {
  for (var i = 0; i < patt.children.length; i++) {
    if (patt.children[i].type === 'rest') return i;
  }
  return -1;
}

function joinPatterns(j, cs) {
  return cs.map(function(c) { return c.pattern }).join(j);
}

function joinRefs(refs) {
  if (!refs.length) return [];
  refs = _.flatten(intercalate(makePunc(','), refs.map(function(r) {
    return r.stx ? r.stx.slice(1, -1) : r.slice(1, -1);
  })));
  return [makeKeyword('var')].concat(refs, makePunc(';'));
}

function joinAlternates(alts) {
  if (alts.length === 1) return alts[0][2].token.inner;
  return alts.reduce(function(acc, alt, i) {
    if (i === alts.length - 1) {
      alt = [makeKeyword('else')].concat(alt[2]);
    } else if (i > 0) {
      alt = [makeKeyword('else')].concat(alt);
    }
    return acc.concat(alt);
  }, []);
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
    acc[n[0]] = n[1].name ? n[1].name[0] : n[1].stx[0];
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

function shouldStateBacktrack(args) {
  if (args.length === 1) return false;
  return shouldArgBacktrack(args[0]);
}

function shouldArgBacktrack(arg) {
  var patt = arg.pattern;
  var child = arg.children[0];
  if (patt === '$' || patt === '*' || patt === '...' ||
      child.type === 'literal' && !matchesToken(STRING, child.stx[0])) return false;
  return true;
}

function shouldCompileBacktrack(cases) {
  var len = cases.reduce(function(acc, c) {
    return c.args.children.length > acc ? c.args.children.length : acc;
  }, 0);

  for (var j = 0; j < len; j++) {
    var patts = [];
    for (var i = 0, c; c = cases[i]; i++) {
      var arg = c.args.children[j];
      if (arg && patts.indexOf(arg.pattern) > 0 && shouldArgBacktrack(arg)) {
        return true;
      }
      patts.unshift(arg ? arg.pattern : null);
    }
  }
  return false;
}
