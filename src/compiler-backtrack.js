// The backtracking compiler generates a while loop with a state machine. The
// case structure is analyzed and collected into a series of states identified
// by their pattern and argument position. Each state can then cache their
// computation.

function compileBacktrack(cases) {
  var argLen  = 0;
  var nameLen = 0;

  var stateId = 1;
  var stateIdMap = {};
  var states = {};

  // We collect the states based upon their argument position and their
  // normalized pattern.
  function getStateId(arg, argN) {
    var key = argN + ':' + arg.pattern;
    if (!stateIdMap.hasOwnProperty(key)) {
      stateIdMap[key] = stateId;
      states[stateId] = [];
      stateId++;
    }
    return stateIdMap[key];
  }

  cases.forEach(function(c, i) {
    var names = [];
    var len = c.args.children.length;
    var last = c.args.children[c.args.children.length - 1];
    if (last.children[0] === 'rest') len--;

    c.args.children.forEach(function(arg, j) {
      var id = getStateId(arg, j);
      var nextArg = c.args.children[j + 1];
      var nextCase = cases[i + 1];
      var argNames = findIdents(arg.children);

      arg.offset = names.length;
      arg.level = j;
      arg.case = i + 1; // 1-based rather than 0, because
      arg.succ = nextArg  ? getStateId(nextArg, j + 1) : 0;
      arg.fail = nextCase ? getStateId(nextCase.args.children[0], 0) : 0;

      if (!nextArg) {
        arg.body = c.body;
        arg.guard = c.guard;
      }

      states[id].push(arg);
      names = names.concat(argNames);
    });

    if (len > argLen) argLen = len;
    if (names.length > nameLen) nameLen = names.length;
    last.names = names.map(function(n) {
      return n.name;
    });
  });

  var argNames = [];
  var nameRefs = [];
  while (argLen--) argNames.unshift(makeIdent('a' + argLen, mac));
  while (nameLen--) nameRefs.push(makeRef());

  var stx = [];
  var env = environment({
    head: {},
    argNames: argNames,
    nameRefs: nameRefs,
    backRefs: [],
  });

  var stxStates = _.map(states, function(patts, id) {
    return compileState(parseInt(id), patts, env);
  });

  letstx $name ... = fnName[0].token.value === 'anonymous' ? [] : fnName;
  letstx $args ... = intercalate(makePunc(','), argNames);
  letstx $head ... = joinRefs(_.values(env.head));
  letstx $refs ... = joinRefs(nameRefs.concat(env.backRefs));
  letstx $code ... = optimizeSyntax(joinAlternates(stxStates));
  return #{
    function $name ... ($args ...) {
      var s = 1, c = 1;
      $head ...
      $refs ...
      while (true) {
        $code ...
      }
      throw new TypeError('No match');
    }
  }
}

function compileState(id, patts, env) {
  var pattBody, succBody, failBody;

  // Factor out common code between patterns that need backtracking, and those
  // that don't. This compiles the successful matches for the current state.
  function compileSucc(patt, body) {
    // If we are at the end of a case, zip up the references and include the
    // user code.
    if (patt.body) {
      var names = _.zip(patt.names, env.nameRefs.slice(0, patt.names.length));
      var code  = names.reduce(function(acc, pair) {
        return acc.concat(makeKeyword('var'), makeIdent(pair[0], ctx),
          makePunc('='), pair[1].name, makePunc(';'));
      }, []).concat(patt.body);

      if (patt.guard.length) {
        letstx $guard ... = replaceIdents(patt.guard, names);
        letstx $refBod ... = body;
        letstx $caseBod ... = code;
        body = #{
          $refBod ...
          if ($guard ...) {
            $caseBod ...
          }
        }
      } else {
        body = body.concat(code);
      }
    }
    
    // Go to the next state.
    else {
      letstx $nextState = [makeValue(patt.succ)];
      body = body.concat(#{
        s = $nextState;
        continue;
      });
    }

    letstx $caseBod ... = body;
    letstx $currCase = [makeValue(patt.case)];
    return #{
      if (c === $currCase) {
        $caseBod ...
      }
    }
  }

  // Setup the environment for compiling the pattern.
  var childEnv = env.set({
    level: patts[0].level,
    names: []
  });

  // We only need backtracking if there is more than one pattern for a given
  // state. Backtracking is done by having a cache value. If it is `undefined`,
  // a match has not been attempted. Otherwise, it will be an array. If the
  // array is empty, the match attempt failed. If the array has a length, it
  // succeeded and will be filled with `name` values.
  if (shouldStateBacktrack(patts)) {
    var backRef = makeRef();
    var nameLen = 0; // How many name refs were gathered.

    // Add the back reference to the env so we can declare them at the
    // beginning of the function. Mutation is OK here.
    env.backRefs.push(backRef);

    pattBody = compilePattern(patts[0], childEnv, function(env2) {
      nameLen = env2.names.length;

      // If we have names, we need to push them onto the array cache.
      // Otherwise we need to just set the length to `1` to mark success.
      if (nameLen) {
        return env2.names.reduce(function(acc, name, i) {
          return acc.concat(backRef.name, makeDelim('[]', [makeValue(i)]),
            makePunc('='), name.stx, makePunc(';'));
        }, []);
      } else {
        return backRef.name.concat(makePunc('.'), makeIdent('length'),
          makePunc('='), makeValue(1), makePunc(';'));
      }
    });

    letstx $bod ... = pattBody;
    letstx $back = backRef.name;
    pattBody = #{
      if (!$back) {
        $back = [];
        $bod ...
      }
    };
    succBody = joinAlternates(patts.map(function(patt) {
      var refs = env.nameRefs.slice(patt.offset, patt.offset + nameLen);
      var body = refs.reduce(function(acc, ref, i) {
        return acc.concat(ref.name, makePunc('='), backRef.name,
          makeDelim('[]', [makeValue(i)]), makePunc(';'));
      }, []);
      return compileSucc(patt, body);
    }));

    letstx $bod ... = succBody;
    succBody = #{
      if ($back.length) {
        $bod ...
      }
    };
  }

  // If we don't need backtracking, we can bake the success cases into the
  // pattern match.
  else {
    succBody = [];
    pattBody = compilePattern(patts[0], childEnv, function(env2) {
      return joinAlternates(patts.map(function(patt) {
        var refs = env.nameRefs.slice(patt.offset, patt.offset + env2.names.length);
        var body = _.zip(refs, env2.names).reduce(function(acc, pair) {
          return acc.concat(pair[0].name, makePunc('='), pair[1].stx, makePunc(';'));
        }, []);
        return compileSucc(patt, body);
      }));
    });
  }

  // What we need to do when the pattern match fails. If we have no fail case
  // to jump to, we just break out of the while loop which will then trigger
  // a match error.
  failBody = joinAlternates(patts.map(function(patt) {
    letstx $currCase = [makeValue(patt.case)];
    if (!patt.fail) {
      return #{
        if (c === $currCase) {
          break;
        }
      }
    } else {
      letstx $nextCase = [makeValue(patt.case + 1)];
      letstx $nextState = [makeValue(patt.fail)];
      return #{
        if (c === $currCase) {
          s = $nextState, c = $nextCase;
        }
      }
    }
  }));

  letstx $bod ... = pattBody.concat(succBody).concat(failBody);
  letstx $id = [makeValue(id)];
  return #{
    if (s === $id) {
      $bod ...
    }
  }
}
