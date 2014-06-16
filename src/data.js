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
