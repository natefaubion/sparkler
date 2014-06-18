// Syntax Optimization
// -------------------

function optimizeSyntax(stx) {
  var inp = input(stx);
  var res = [];
  var toks, opt;
  while (inp.length) {
    if (inp.peek(USERCODE)) {
      res.push.apply(res, inp.take(2)[1].token.inner);
      break;
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
