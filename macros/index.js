macro $sparkler__compile {
  case { $$mac $ctx $name { $body ... } } => {
    var ctx = #{ $ctx };
    var here = #{ here };
    var fnName = #{ $name };

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
    function cloneSyntax(stx) {
      function F(){}
      F.prototype = stx.prototype;
      F.prototype.constructor = stx.prototype.constructor;
      var s = new F();
      extend(s, stx);
      s.token = extend({}, s.token);
      return s;
    }
    function Data(t, args) {
      this.tag  = t;
      this.args = args;
    }
    Data.prototype = {
      unapply: function(f) {
        return f ? f.apply(null, this.args) : this.args.slice();
      },
      equals: function(that) {
        return equalsTag.call(this, that)
            && this.args.every(function(a, i) { return equals(a, that.args[i]) });
      }
    };
    function data(t, fs, proto) {
      var D = function(){};
      D.prototype = Data.prototype;
      var Ctr = function(args) {
        Data.call(this, t, args);
      };
      Ctr.prototype = new D();
      Ctr.prototype.constructor = Ctr;
      Ctr.prototype['is' + t] = true;
      extend(Ctr.prototype, proto || {});
      fs.forEach(function(f, i) {
        Object.defineProperty(Ctr.prototype, f, {
          writeable: false,
          configurable: false,
          get: function() {
            return this.args[i];
          }
        });
      });
      var arity = fs.length;
      return arity === 0 ? function() { return new Ctr([]) }
           : arity === 1 ? function(x) { return new Ctr([x]) }
           : arity === 2 ? function(x, y) { return new Ctr([x, y]) }
           : function() {
               var args = Array(arguments.length);
               for (var i = 0; i < arguments.length; i++) {
                 args[i] = arguments[i];
               }
               return new Ctr(args);
             };
    }
    var Fun        = data('Fun',        ['length']);
    var Args       = data('Args',       []);
    var Arr        = data('Arr',        []);
    var Unapply    = data('Unapply',    []);
    var UnapplyObj = data('UnapplyObj', []);
    var Obj        = data('Obj',        []);
    var Wild       = data('Wild',       []);
    var Undef      = data('Undef',      []);
    var Unit       = data('Unit',       []);
    var Inst       = data('Inst',       []);
    var Lit        = data('Lit',        ['lit']);
    var Extractor  = data('Extractor',  ['name']);
    var Arg        = data('Arg',        ['index']);
    var Len        = data('Len',        ['length']);
    var LenMin     = data('LenMin',     ['length']);
    var Index      = data('Index',      ['index']);
    var IndexNoop  = data('IndexNoop',  ['index']);
    var KeyVal     = data('KeyVal',     ['key']);
    var KeyIn      = data('KeyIn',      ['key']);
    var KeyNoop    = data('KeyNoop',    ['key']);
    var Rest       = data('Rest',       ['pattern', 'names']);
    var RestEnd    = data('RestEnd',    []);
    var Case       = data('Case',       []);
    var Guard      = data('Guard',      [], { equals: constant(false) });
    var Body       = data('Body',       [], { equals: constant(false) });
    var Branch     = data('Branch',     ['node', 'branches']);
    var Leaf       = data('Leaf',       ['node']);
    var Ann        = data('Ann',        ['value', 'ann'], { equals: equalsFst });
    var Group      = data('Group',      ['node', 'matrix', 'stack']);
    var Frame      = data('Frame',      ['matrix', 'level'], { concat: frameConcat });
    function frameConcat(b) {
      assert(this.level === b.level, 'Frame levels must match');
      return Frame(this.matrix.concat(b.matrix), this.level);
    }
    function equalsTag(that) {
      return that && that.tag === this.tag;
    }
    function equalsFst(that) {
      return equalsTag.call(this, that) && equals(this.args[0], that.args[0]);
    }
    function optimizeSyntax(stx) {
      var inp = input(stx);
      var res = [];
      var toks, opt;
      while (inp.length) {
        if (inp.peek()[0].userCode) {
          res.push(inp.take()[0]);
        } else if (toks = inp.takeAPeek({ type: T.Keyword }, PARENS, BRACES)) {
          if (matchesToken(IF, toks[0])) {
            opt = optimizeIfs(toks);
          } else if (matchesToken(FOR, toks[0])) {
            opt = optimizeFors(toks);
          } else {
            toks[2].token.inner = optimizeSyntax(toks[2].token.inner);
            opt = toks;
          }
          res = res.concat(opt);
        } else if (toks = inp.takeAPeek(BRACES)) {
          res = res.concat(optimizeSyntax(toks[0].token.inner));
          break;
        } else if (toks = inp.takeAPeek(CONTINUE)) {
          res.push(toks[0]);
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
      if (toks && inner.length === 0) {
        pred.token.inner = [makeDelim('()', pred.token.inner, pred), makePunc('&&', here), toks[1]];
        stx[2] = toks[2];
      } else if (toks) {
        block.token.inner = toks.concat(inner.rest());
      } else {
        block.token.inner = inner.rest();
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
    function compile(ast) {
      return compilePattern(astToTree(ast), environment({ refs: {} }), []);
    }
    function astToTree(ast) {
      var level = 2;
      var cases = ast.branches.map(function(b) { return [b.branches[0]] });
      var frame = ast.branches.map(function(b) { return [b.branches[1]] });
      var gr = groupRows(cases, [Frame(frame, 0)], level);
      return Branch(ast.node, [transformCase(gr[0].node, gr[0].matrix, gr[0].stack, level)]);
    }
    function transformCase(c, m, stack, level) {
      c.ann.level = level;
      if (!stack.length) {
        return m.length
          ? Branch(c, m.reduce(concat))
          : Leaf(c);
      }
      var nl = level + 1;
      var gr;
      if (!m.length) {
        nl = stack[0].level;
        gr = groupRows(stack[0].matrix, stack.slice(1), stack[0].level);
      } else if (isMatrixType(c.value)) {
        gr = groupRows(scoreMatrix(normalizeMatrix(c, m)), stack, level);
      } else {
        gr = groupRows(m, stack, level);
      }
      var head = transformCase(gr[0].node, gr[0].matrix, gr[0].stack, nl);
      var rest = gr[1].length && transformCase(c, gr[1], gr[2], level).branches || [];
      return Branch(c, [head].concat(rest).reduceRight(function(acc, c) {
        if (acc.length && acc[0].node.equals(c.node)) {
          acc[0] = Branch(mergeNodes(c.node, acc[0].node), c.branches.concat(acc[0].branches));
        } else {
          acc.unshift(c);
        }
        return acc;
      }, []));
    }
    function groupRows(m, stack, level) {
      function rowHeadStack(r, s) {
        return r.length === 1 ? s : [Frame([r.slice(1)], level)].concat(s);
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
          var n = mergeNodes(g.node, c.node);
          var m = c.branches ? g.matrix.concat([c.branches]) : g.matrix;
          var s = stackZip(g.stack, rowHeadStack(r, stackRow(stack, i + 1)));
          acc[0] = Group(n, m, s);
        } else {
          acc[1].push(r);
          acc[2] = stackZip(acc[2], stackRow(stack, i + 1));
        }
        return acc;
      }, [init, [], []]);
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
        return Frame([f.matrix[i]], f.level);
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
          return bs.reduce(function(stx, b) {
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
        var body = cont(env2);
        var err = #{ throw new TypeError('No match') };
        letstx $name = unwrapSyntax(fnName) === 'anonymous' ? [] : fnName,
               $args = join(makePunc(',', here), env2.argIdents),
               $code = optimizeSyntax(body.concat(err));
        return #{ 
          function $name ($args) { $code }
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
          var k = unwrapSyntax(id);
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
        var oref = makeRef(); 
        var iref = makeRef(); 
        var sref = makeRef(); 
        var lref = makeRef(); 
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
        var g = groupRows([[pattern]], [Frame([[end]], 0)], 1)[0];
        var t = transformCase(g.node, g.matrix, g.stack, 1);
        var s = compilePattern(t, environment({ refs: {} }), [void 0, lref]);
        var env2 = ann.stashed.reduce(function(e, id, i) {
          return e.stash(unwrapSyntax(id), refs[1][i]);
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
          var $oref = true;
          for (var $iref = $start, $sref = $stop, $lref; $iref < $sref; $iref++) {
            $lref = $aref[$iref];
            $inner
            $oref = false;
            break;
          }
          if ($oref) { $bod }
        }
      },
      Guard: function(ann, _, env, cont) {
        var names = ann.stashed.reduce(function(acc, id) {
          var k = unwrapSyntax(id);
          acc[k] = env.retrieve(k);
          return acc;
        }, {});
        letstx $test = replaceIdents(ann.stx, names),
               $bod = cont(env);
        return #{
          if ($test) { $bod }
        }
      }
    };
    var leafCompilers = {
      Body: function(ann, env) {
        var refs = join([], ann.stashed.map(function(id) {
          return makeAssign(id, env.retrieve(unwrapSyntax(id)));
        }));
        return makeDelim('{}', refs.concat(ann.stx), here);
      },
      RestEnd: function(ann, env) {
        var refs = join([], ann.stashed.map(function(id, i) {
          letstx $arr = ann.refs[i],
                 $ref = env.retrieve(unwrapSyntax(id));
          return #{
            $arr[$arr.length] = $ref;
          }
        }));
        letstx $refs = refs;
        return #{
          $refs
          continue;
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

    return compile(parse(#{ $body ... }));
  }
}

let function = macro {
  case { $ctx $name:ident { $body ... } } => {
    return #{
      $sparkler__compile $ctx $name { $body ... }
    };
  }
  case { $ctx { $body ... } } => {
    return #{
      $sparkler__compile $ctx anonymous { $body ... }
    }
  }
  case { _ } => {
    return #{ function }
  }
}

let match = macro {
  case { $ctx $op:expr { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op))
    }
  }
  case { $ctx ($op:expr) { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op))
    }
  }
  case { $ctx ($op:expr, $rest:expr (,) ...) { $body ... } } => {
    return #{
      ($sparkler__compile $ctx anonymous { $body ... }.call(this, $op, $rest (,) ...))
    }
  }
  case { _ } => {
    return #{ match }
  }
}

export function;
export match;
