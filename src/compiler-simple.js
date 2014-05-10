// The simple compiler can do basic branch optimization (merging consecutive
// cases that have identical patterns) but does not do full backtracking. It
// consequently generates much simpler and easier to follow code.

function compileSimple(cases) {
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
    argNames.unshift(makeIdent('a' + argCount, here));
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
  letstx $args ... = intercalate(makePunc(',', here), argNames);
  letstx $code ... = optimizeSyntax(head.concat(body).concat(err));
  return #{
    function $name ... ($args ...) {
      $code ...
    }
  }
}

// Takes an array of { args, body } case objects and turns it into an
// optimized decision tree. Each argument node ends up with a `branches`
// attribute representing the next possible paths to take. If two argument
// nodes share the same pattern they can be grafted together.
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
      for (var j = i - 1; j >= 0; j--) {
        if (bs[i].pattern === bs[j].pattern &&
            !(!bs[j].branches &&
              (bs[j].pattern === '$' ||
               bs[j].pattern === '*'))) {
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
        } else break;
      }
    }
    bs.forEach(function(b) {
      if (b.branches) graft(b.branches);
    });
    return bs;
  }

  return graft(branches);
}

function compileBranches(branches, env) {
  return branches.reduce(function(acc, b) {
    return acc.concat(compileBranch(b, env));
  }, []);
}

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
        var guard = [makeKeyword('if', here), makeDelim('()', replaceIdents(g.guard, names), here), 
          makeDelim('{}', body, here)];
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
