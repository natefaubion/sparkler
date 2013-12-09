// Compiler
// -------

// The compiler is written with continuations. Each pattern compiler takes an
// env and a continuation, with compilation being triggered by applying the
// env to the continuation. The env and continuation get passed down through
// the decision tree, and once we get to a "leaf" the env will have collected
// all the references we need to alias for the branch body. Code is then
// generated starting at the innermost leaf, getting subsequently wrapped as it
// works its way back up to the root.

// The env is (mostly) immutable since we have to do a lot of branching.
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

var TO_STR_REF = makeRef(#{ Object.prototype.toString });

var natives = {
  'Boolean'    : makeRef(#{ '[object Boolean]' }),
  'Number'     : makeRef(#{ '[object Number]' }),
  'String'     : makeRef(#{ '[object String]' }),
  'RegExp'     : makeRef(#{ '[object RegExp]' }),
  'Date'       : makeRef(#{ '[object Date]' }),
  'Array'      : makeRef(#{ '[object Array]' }),
  'Object'     : makeRef(#{ '[object Object]' }),
  'Function'   : makeRef(#{ '[object Function]' }),
  'Undefined'  : makeRef(#{ '[object Undefined]' }),
  'Null'       : makeRef(#{ '[object Null]' }),
  'Math'       : makeRef(#{ '[object Math]' }),
  'Arguments'  : makeRef(#{ '[object Arguments]' }),
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

function compile(cases) {
  return shouldCompileBacktrack(cases)
    ? compileBacktrack(cases)
    : compileSimple(cases);
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
      var $obj = $cls ... .unapplyObject($ref);
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
    letstx $loop ... = loop;
    return #{
      $rrefs ...
      $loop ...
      $bod ...
    }
  } else {
    letstx $rrefs ... = joinRefs([okRef].concat(restRefs));
    letstx $loop ... = loop;
    return #{
      $rrefs ...
      $loop ...
      if ($ok) { $bod ... }
    }
  }
}
