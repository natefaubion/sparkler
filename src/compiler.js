function compile(ast) {
  return compilePattern(astToTree(ast), environment({ refs: {} }), []);
}

function astToTree(ast) {
  var cases = ast.branches.map(function(b) { return [annotateLevels(b.branches[0], 0)] });
  var frame = ast.branches.map(function(b) { return [b.branches[1]] });
  var gr = groupRows(cases, [frame]);
  return Branch(ast.node, [transformCase(gr[0].node, gr[0].matrix, gr[0].stack)]);
}

function annotateLevels(ast, l) {
  ast.node.ann.level = l;
  if (ast.branches) {
    ast.branches.forEach(function(b) {
      annotateLevels(b, l + 1);
    });
  }
  return ast;
}

function transformCase(c, m, stack) {
  if (!stack.length) {
    return m.length
      ? Branch(c, m.reduce(concat))
      : Leaf(c);
  }

  var gr;

  if (!m.length) {
    gr = groupRows(stack[0], stack.slice(1));
  } else if (isMatrixType(c.value)) {
    gr = groupRows(scoreMatrix(normalizeMatrix(c, m)), stack);
  } else {
    gr = groupRows(m, stack);
  }

  var head = transformCase(gr[0].node, gr[0].matrix, gr[0].stack);
  var rest = gr[1].length && transformCase(c, gr[1], gr[2]).branches || [];
  var cons = [head].concat(rest);

  return Branch(c, matchStmt
                   ? mergeBranchesWithBacktrack(cons)
                   : mergeBranches(cons));
}

function groupRows(m, stack) {
  function rowHeadStack(r, s) {
    return r.length === 1 ? s : [[r.slice(1)]].concat(s);
  }

  var head = m[0];
  var rest = m.slice(1);
  var init = Group(head[0].node,
                   head[0].branches ? [head[0].branches] : [],
                   rowHeadStack(head, stackRow(stack, 0)));

  return rest.reduce(function(acc, r, i) {
    var g = acc[0];
    var c = r[0];
    if (!acc[1].length && canGroupCases(head[0], c)) {
      acc[0] = Group(mergeNodes(g.node, c.node),
                     c.branches ? g.matrix.concat([c.branches]) : g.matrix,
                     stackZip(g.stack, rowHeadStack(r, stackRow(stack, i + 1))));
    } else {
      acc[1].push(r);
      acc[2] = stackZip(acc[2], stackRow(stack, i + 1));
    }
    return acc;
  }, [init, [], []]);
}

function mergeBranches(bs) {
  return bs.reduceRight(function(acc, c) {
    if (acc.length && acc[0].node.equals(c.node)) {
      acc[0] = Branch(mergeNodes(c.node, acc[0].node),
                      c.branches.concat(acc[0].branches));
    } else {
      acc.unshift(c);
    }
    return acc;
  }, []);
}

function mergeBranchesWithBacktrack(bs) {
  return bs.reduceRight(function(acc, c, i) {
    var head = acc[0];
    if (head && c.node.equals(head.node)) {
      acc[0] = Branch(mergeNodes(c.node, head.node),
                      c.branches.concat(Branch(Ann(Backtrack(), {}), head.branches)));
    } else if (head) {
      acc[0] = Branch(c.node,
                      c.branches.concat(Branch(Ann(Backtrack(), {}), head.branches)));
    } else {
      acc.unshift(c);
    }
    return acc;
  }, []);
}

function mergeNodes(c1, c2) {
  return Ann(c1.value,
             extend({}, c1.ann, {
               idents: (c1.ann.idents || []).concat(c2.ann.idents || [])
             }));
}

function canGroupCases(c1, c2) {
  if (canGroup.hasOwnProperty(c1.node.value.tag)) {
    return canGroup[c1.node.value.tag](c1, c2);
  } else {
    return c1.node.equals(c2.node);
  }
}

var canGroup = {
  Arg: canGroupChild,
  Index: canGroupChild,
};

function canGroupChild(c1, c2) {
  return c1.node.equals(c2.node)
      && canGroupCases(c1.branches[0], c2.branches[0]);
}

function normalizeMatrix(c, m) {
  assert(isMatrixType(c.value), 'Unsupported matrix type: ' + c.value.tag);
  return normalize[c.value.tag](c, m);
}

function isMatrixType(n) {
  return normalize.hasOwnProperty(n.tag);
}

var normalize = {
  Obj        : normalizeObj,
  UnapplyObj : normalizeObj,
  Len        : normalizeNoop,
  LenMin     : normalizeNoop,
  Args: function(n, m) {
    var max = Math.max.apply(null, m.map(function(r) { return r.length }));
    return normalizeVarLen(max, Arg, m)
  }
};

function normalizeNoop(n, m) {
  return m;
}

function normalizeObj(n, m) {
  var layout = m.reduceRight(function(acc, r) {
    return r.reduce(function(a, c) {
      a[0][0].keys[c.node.value.key] = true;
      a[1][c.node.value.key] = true;
      return a;
    }, [[{ keys: {}, row: r }].concat(acc[0]), acc[1]]);
  }, [[], {}]);

  return layout[0].map(function(r) {
    Object.keys(layout[1]).forEach(function(k) {
      if (!r.keys[k]) r.row.push(Leaf(Ann(KeyNoop(k), {})));
    });
    return r.row.sort(sortObjKeys);
  });
}

function normalizeVarLen(len, ctr, m) {
  return m.map(function(r) {
    if (r.length >= len) {
      return r;
    } else {
      return r.concat(repeat(len - r.length, function(i) {
        return Leaf(Ann(ctr(r.length - i + 1), {}));
      }));
    }
  });
}

function sortObjKeys(a, b) {
  a = a.node.value.key;
  b = b.node.value.key;
  return a < b ? -1 : b < a ? 1 : 0;
}

function scoreMatrix(m) {
  var scores = m.map(function(c) {
    return c.map(scorePattern);
  });

  var ranks = [];
  for (var i = 0; i < scores[0].length; i++) {
    var s = 0;
    for (var j = 0; j < scores.length; j++) {
      if (scores[j][i] > 0) {
        s += scores[j][i];
      } else {
        break;
      }
    }
    for (var k = 0; k <= ranks.length; k++) {
      if (!ranks[k] || s > ranks[k][0]) {
        ranks.splice(k, 0, [s, i]);
        break;
      }
    }
  }

  return m.map(function(c) {
    return ranks.map(function(r) {
      return c[r[1]];
    });
  });
}

function scorePattern(p) {
  var t = p.node.value.tag;
  return t in score ? score[t].apply(score, p.args) : 1;
}

function scoreChild(n, bs) {
  return bs ? scorePattern(bs[0]) : 0;
}

var score = {
  Arg       : scoreChild,
  Index     : scoreChild,
  Wild      : constant(0),
  KeyNoop   : constant(0),
  IndexNoop : scoreChild,
};

function stackRow(stack, i) {
  return stack.map(function(f) {
    return [f[i]];
  });
}

function stackZip(s1, s2) {
  if (!s1.length) return s2;
  if (!s2.length) return s1;
  return s1.map(function(f, i) {
    return f.concat(s2[i]);
  });
}

function compilePattern(t, env, stack) {
  var n = t.node;
  var bs = t.branches;
  if (t.isBranch) {
    var c = branchCompilers[n.value.tag] || assert(false, 'Unexpected node: ' + n.value.tag);
    var r = stack[stack.length - 1];
    var cont = function(e, r2) {
      var s = stack.concat([r2 || r]);
      return bs.reduce(function(stx, b, i) {
        var l = b.node.ann.level;
        return stx.concat(compilePattern(b, e, s.slice(0, l)));
      }, []);
    };
    if (n.ann.idents && n.ann.idents.length) {
      env = n.ann.idents.reduce(function(e, id) {
        return e.stash(unwrapSyntax(id), r);
      }, env);
    }
    return c.apply(null, n.value.unapply().concat(n.ann, [r], env, cont, [bs]));
  } else {
    var c = leafCompilers[n.value.tag] || assert(false, 'Unexpected leaf: ' + n.value.tag);
    return c.apply(null, n.value.unapply().concat(n.ann, env));
  }
}

var branchCompilers = {
  Fun: function(len, ann, _, env, cont) {
    var env2 = env.set({
      argIdents: repeat(len, function(i) {
        return [makeIdent('a' + i, here)];
      })
    });

    letstx $name = unwrapSyntax(fnName) === 'anonymous' ? [] : fnName,
           $args = join(makePunc(',', here), env2.argIdents),
           $code = optimizeSyntax(cont(env2));

    if (matchArgs.length) {
      letstx $params = join(makePunc(',', here), matchArgs);
      return #{
        function $name ($args) { $code }.call(this, $params)
      }
    } else {
      return #{
        function $name ($args) { $code }
      }
    }
  },
  Match: function(len, ann, _, env, cont) {
    var bref = makeRef();
    var args = matchArgs.reduce(function(acc, a) {
      if (a.length === 1 && a[0].token.type === T.Identifier) {
        acc[0].push(a);
      } else {
        var ref = makeRef();
        acc[1] = makeAssign(null, ref[0], a).concat(acc[1]);
        acc[0].push(ref);
      }
      return acc;
    }, [[], []]);

    var env2 = env.set({ argIdents: args[0], backtrackRef: bref });
    var body = cont(env2);

    letstx $top = args[1],
           $ref = bref,
           $bod = optimizeSyntax(body);

    return #{
      var $ref = 1;
      $top
      $bod
    }
  },
  Args: compileNoop,
  Arg: function(i, ann, _, env, cont) {
    return cont(env, env.argIdents[i]);
  },
  Unit: function(ann, _, env, cont) {
    letstx $bod = cont(env);
    return #{
      if (arguments.length === 0) { $bod }
    }
  },
  Wild: compileNoop,
  Undef: function(ann, ref, env, cont) {
    letstx $ref = ref,
           $bod = cont(env);
    return #{
      if ($ref === void 0) { $bod }
    }
  },
  Lit: function(v, ann, ref, env, cont) {
    letstx $ref = ref,
           $lit = ann.stx,
           $bod = cont(env);
    return #{
      if ($ref === $lit) { $bod }
    }
  },
  Extractor: compileNoop,
  Inst: function(ann, ref, env, cont) {
    if (natives.hasOwnProperty(ann.name)) {
      letstx $test = natives[ann.name](ref, env),
             $bod = cont(env);
      return #{
        if ($test) { $bod }
      }
    } else {
      letstx $ref = ref,
             $cls = ann.extractor,
             $bod = cont(env);
      return #{
        if ($cls.hasInstance
            ? $cls.hasInstance($ref)
            : $ref instanceof $cls) { $bod }
      }
    }
  },
  Unapply: function(ann, ref, env, cont) {
    var ref2 = makeRef();
    letstx $ref = ref,
           $new = ref2,
           $ext = ann.extractor,
           $bod = cont(env, ref2);
    return #{
      var $new = $ext.unapply($ref);
      if ($new != null) { $bod }
    }
  },
  UnapplyObj: function(ann, ref, env, cont) {
    var ref2 = makeRef();
    letstx $ref = ref,
           $new = ref2,
           $ext = ann.extractor,
           $bod = cont(env, ref2);
    return #{
      var $new = $ext.unapplyObject($ref);
      if ($new != null) { $bod }
    }
  },
  Arr: function(ann, ref, env, cont) {
    letstx $test = natives.Array(ref, env),
           $bod = cont(env, ref);
    return #{
      if ($test) { $bod }
    }
  },
  Len: function(len, ann, ref, env, cont) {
    letstx $len = [makeValue(len, here)],
           $ref = ref,
           $bod = cont(env);
    return #{
      if ($ref.length === $len) { $bod }
    }
  },
  LenMin: function(len, ann, ref, env, cont) {
    letstx $len = [makeValue(len, here)],
           $ref = ref,
           $bod = cont(env);
    return #{
      if ($ref.length >= $len) { $bod }
    }
  },
  Index: function(i, ann, ref, env, cont, bs) {
    var index = i >= 0
      ? [makeValue(i, here)]
      : ref.concat(makePunc('.', here),
                   makeIdent('length', here),
                   makePunc('-', here),
                   makeValue(Math.abs(i), here));

    if (bs.length === 1 && bs[0].node.value.isWild) {
      if (!bs[0].node.ann.idents || !bs[0].node.ann.idents.length) {
        return cont(env);
      } else {
        return cont(env, ref.concat(makeDelim('[]', index, here)));
      }
    }

    var ref2 = makeRef();
    letstx $ref = ref,
           $ind = index,
           $new = ref2,
           $bod = cont(env, ref2);
    return #{
      var $new = $ref[$ind];
      $bod
    }
  },
  IndexNoop: compileNoop,
  Obj: function(ann, ref, env, cont) {
    var ref2 = makeRef();
    letstx $ref = ref,
           $new = ref2,
           $bod = cont(env, ref2);
    return #{
      if ($ref != null) {
        var $new = Object($ref);
        $bod
      }
    }
  },
  KeyIn: function(key, ann, ref, env, cont) {
    letstx $ref = ref,
           $key = [makeValue(key, here)],
           $bod = cont(env);
    if (ann.hasOwn) {
      return #{
        if ($ref.hasOwnProperty($key)) { $bod }
      }
    } else {
      return #{
        if ($key in $ref) { $bod }
      }
    }
  },
  KeyVal: function(key, ann, ref, env, cont, bs) {
    if (bs.length === 1 && bs[0].node.value.isWild) {
      if (!bs[0].node.ann.idents || !bs[0].node.ann.idents.length) {
        return cont(env);
      } else {
        return cont(env, ref.concat(makeDelim('[]', [makeValue(key, here)], here)));
      }
    }

    var ref2 = makeRef();
    letstx $ref = ref,
           $new = ref2,
           $key = [makeValue(key, here)],
           $bod = cont(env, ref2);
    return #{
      var $new = $ref[$key];
      $bod
    }
  },
  KeyNoop: compileNoop,
  Rest: function(pattern, names, ann, ref, env, cont) {
    var refs = ann.stashed.reduce(function(acc, id) {
      var k = unwrapSyntax(id.ident);
      if (!acc[2].hasOwnProperty(k)) {
        acc[0].push(id);
        acc[1].push(makeRef());
        acc[2][k] = true;
      }
      return acc;
    }, [[], [], {}]);

    var init = refs[1].length
      ? [makeKeyword('var', here)].concat(
          join(makePunc(',', here), refs[1].map(function(r) {
            return r.concat(makePunc('=', here), makeDelim('[]', [], here));
          })),
          makePunc(';', here))
      : [];

    var oref = makeRef(); // ok
    var iref = makeRef(); // i
    var sref = makeRef(); // stop
    var lref = makeRef(); // loop
    var aref = ann.argRest ? [makeIdent('arguments', here)] : ref;
    var start = [makeValue(ann.start, here)];
    var stop = withSyntax($a = aref) {
      if (!ann.stop) {
        return #{ $a.length };
      } else {
        letstx $stop = [makeValue(Math.abs(ann.stop), here)];
        return #{ $a.length - $stop };
      }
    };

    var end = Leaf(Ann(RestEnd(), { stashed: refs[0], refs: refs[1] }));
    var g = groupRows([[annotateLevels(pattern, 1)]], [[[end]]], 1)[0];
    var t = transformCase(g.node, g.matrix, g.stack, 1);
    var s = compilePattern(t, environment({ refs: {} }), [void 0, lref]);

    var env2 = ann.stashed.reduce(function(e, id, i) {
      return e.stash(unwrapSyntax(id.ident), refs[1][i]);
    }, env);

    letstx $init = init,
           $oref = oref,
           $aref = aref,
           $iref = iref,
           $lref = lref,
           $sref = sref,
           $start = start,
           $stop = stop,
           $inner = s,
           $bod = cont(env2);
    return #{
      $init
      var $oref = 1;
      for (var $iref = $start, $sref = $stop, $lref; $iref < $sref; $iref++) {
        $lref = $aref[$iref];
        $inner
        $oref--;
        break;
      }
      if ($oref) { $bod }
    }
  },
  Guard: function(ann, _, env, cont) {
    var names = ann.stashed.reduce(function(acc, id) {
      var k = unwrapSyntax(id.ident);
      acc[k] = env.retrieve(k);
      return acc;
    }, {});

    letstx $test = replaceIdents(ann.stx, names),
           $bod = cont(env);
    return #{
      if ($test) { $bod }
    }
  },
  Backtrack: function(ann, _, env, cont) {
    letstx $bod = cont(env),
           $ref = env.backtrackRef;
    return #{
      if ($ref) { $bod }
    }
  }
};

var leafCompilers = {
  Body: function(ann, env) {
    var refs = join([], ann.stashed.map(function(id) {
      return makeAssign(id.keyword, id.ident, env.retrieve(unwrapSyntax(id.ident)));
    }));

    letstx $bod = refs.concat(ann.stx),
           $user = [makeIdent(USERCODE.value, here)];

    if (matchStmt && !ann.last) {
      letstx $ref = env.backtrackRef;
      return #{
        if ($ref--) { $user { $bod } }
      }
    } else {
      return #{
        $user { $bod }
      }
    }
  },
  RestEnd: function(ann, env) {
    var refs = join([], ann.stashed.map(function(id, i) {
      letstx $arr = ann.refs[i],
             $ref = env.retrieve(unwrapSyntax(id.ident));
      return #{
        $arr[$arr.length] = $ref;
      }
    }));

    letstx $refs = refs;
    return #{
      $refs
      continue;
    }
  },
  NoMatch: function(ann, env) {
    return #{
      throw new TypeError('No match');
    }
  }
};

function compileNoop() {
  var cont = arguments[arguments.length - 2];
  var env  = arguments[arguments.length - 3];
  return cont(env);
}

var natives = {
  Boolean   : typeofAndObjTag('boolean', 'Boolean'),
  Number    : typeofAndObjTag('number', 'Number'),
  String    : typeofAndObjTag('string', 'String'),
  Function  : typeofAndObjTag('function', 'Function'),
  RegExp    : objTag('RegExp'),
  Date      : objTag('Date'),
  Math      : objTag('Math'),
  Object    : objTag('Object'),

  Array: function(ref, env) {
    letstx $ref = ref;
    return #{ Array.isArray
              ? Array.isArray($ref)
              : Object.prototype.toString.call($ref) === '[object Array]' };
  },
  NaN: function(ref, env) {
    letstx $ref = ref;
    return #{ Number.isNaN
              ? Number.isNaN($ref)
              : typeof $ref === 'number' && $ref !== +$ref };
  }
}

function typeofAndObjTag(type, tag) {
  return function(ref, env) {
    letstx $type = [makeValue(type, here)],
           $str = [makeValue('[object ' + tag + ']', here)],
           $ref = ref;
    return #{ typeof $ref === $type ||
              Object.prototype.toString.call($ref) === $str };
  }
}

function objTag(tag) {
  return function(ref, env) {
    letstx $str = [makeValue('[object ' + tag + ']', here)],
           $ref = ref;
    return #{ Object.prototype.toString.call($ref) === $str };
  }
}
