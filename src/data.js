function Data(t, args) {
  this.tag  = t;
  this.args = args;
}

Data.prototype = {
  unapply : f    -> f ? f.apply(null, this.args) : this.args.slice(),
  equals  : that -> equalsTag.call(this, that) && arrayEquals(this.args, that.args)
};

function data(t, fs, proto) {
  var D = () -> {};
  D.prototype = Data.prototype;

  var Ctr = args -> {
    Data.call(this, t, args);
  };

  Ctr.prototype = new D();
  Ctr.prototype.constructor = Ctr;
  Ctr.prototype['is' + t] = true;
  extend(Ctr.prototype, proto || {});

  fs.forEach((f, i) -> {
    Object.defineProperty(Ctr.prototype, f, {
      writeable: false,
      configurable: false,
      get: () -> this.args[i]
    });
  });

  var arity = fs.length;
  return arity === 0 ? () -> new Ctr([])
       : arity === 1 ? (x) -> new Ctr([x])
       : arity === 2 ? (x, y) -> new Ctr([x, y])
       : () -> {
           var args = Array(arguments.length);
           for (var i = 0; i < arguments.length; i++) {
             args[i] = arguments[i];
           }
           return new Ctr(args);
         };
}

var Fun        = data('Fun',        ['length']);
var Match      = data('Match',      ['length']);
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
var Backtrack  = data('Backtrack',  []);
var NoMatch    = data('NoMatch',    []);
var Branch     = data('Branch',     ['node', 'branches']);
var Leaf       = data('Leaf',       ['node']);
var Ann        = data('Ann',        ['value', 'ann'], { equals: equalsFst });
var Group      = data('Group',      ['node', 'matrix', 'stack']);

function equalsTag(that) {
  return that && that.tag === this.tag;
}

function equalsFst(that) {
  return equalsTag.call(this, that) && equals(this.args[0], that.args[0]);
}
