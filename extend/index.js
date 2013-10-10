Object.defineProperty(Object.prototype, 'applyTo', {
  writable: true,
  enumerable: false,
  value: function(fn) {
    return fn(this);
  }
});

Object.defineProperty(Function.prototype, 'orElse', {
  writable: true,
  enumerable: false,
  value: function(b) {
    var a = this;
    return function() {
      try {
        return a.call(this, arguments);
      } catch (e) {
        if (e instanceof TypeError && e.message === 'No match') {
          return b.call(this, arguments);
        } else {
          throw e;
        }
      }
    };
  }
});

Date.unapply = function(date) {
  if (Object.prototype.toString.call(date) === '[object Date]') {
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    ];
  }
};

Date.unapplyObj = function(date) {
  if (Object.prototype.toString.call(date) === '[object Date]') {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      date: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
      milliseconds: date.getMilliseconds(),
      time: date.getTime()
    };
  }
};

function regExpFlags(reg) {
  var flags = {};
  if (reg.global) flags['g'] = true;
  if (reg.ignoreCase) flags['i'] = true;
  if (reg.multiline) flags['m'] = true;
  if (reg.sticky) flags['y'] = true;
  return flags;
}

RegExp.unapply = function(reg) {
  if (Object.prototype.toString.call(reg) === '[object RegExp]') {
    return [reg.source, regExpFlags(reg)];
  }
};

RegExp.unapplyObj = function(reg) {
  if (Object.prototype.toString.call(reg) === '[object RegExp]') {
    return {
      pattern: reg.source,
      flags: regExpFlags(reg)
    };
  }
};
