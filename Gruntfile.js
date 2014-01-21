module.exports = function(grunt) {
  grunt.initConfig({
    mochaTest: {
      test: {
        src: 'test/**/*.js'
      }
    }
  });

  grunt.registerTask('build', function() {
    var macro = grunt.file.read('./src/wrapper.js');
    var lines = mapFilter(macro.split('\n'), function(line) {
      var fileName = line.match(/(\s*)\/\/=(.+)/);
      if (fileName) {
        var include = strip(grunt.file.read('./src/' + fileName[2].trim()));
        return include.replace(/^/gm, fileName[1]);
      } else {
        return line;
      }
    });

    grunt.file.write('./macros/index.js', lines.join('\n'));
  });

  grunt.registerTask('build-test', function() {
    var path = require('path');
    var files = ['./test/patterns.sjs', './test/extend.sjs'];
    files.forEach(function(f) {
      grunt.file.write(f.replace('.sjs', '.js'), compileFile(f, true));
    });
  });

  grunt.registerTask('compile', function(fileName) {
    grunt.log.write(compileFile(fileName));
  });

  var moduleCtx;

  function compileFile(fileName, isTest) {
    var macro = grunt.file.read('./macros/index.js');
    var test  = isTest ? grunt.file.read('./test/macros.sjs') : '';
    var file  = grunt.file.read(fileName);
    var sweet = require('sweet.js');

    if (!moduleCtx) moduleCtx = sweet.loadModule(macro);

    return sweet.compile(test + file, {
      modules: [moduleCtx],
      readableNames: true,
    }).code;
  }

  grunt.registerTask('default', ['build']);
  grunt.registerTask('test', ['build', 'build-test', 'mochaTest']);
  grunt.loadNpmTasks('grunt-mocha-test');
};

function strip(src) {
  return mapFilter(src.split('\n'), function(line) {
    var comm = line.indexOf('//');
    if (comm >= 0) line = line.slice(0, comm);
    if (line.trim().length) return line;
  }).join('\n');
}

function mapFilter(arr, fn) {
  var res = [];
  for (var i = 0, len = arr.length; i < len; i++) {
    var item = fn(arr[i]);
    if (item != null) res.push(item);
  }
  return res;
}
