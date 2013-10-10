module.exports = function(grunt) {
  grunt.initConfig({
    mochaTest: {
      test: {
        src: 'test/**/*.js'
      }
    }
  });

  grunt.registerTask('build', function() {
    var letstx = grunt.file.read('./src/letstx.js');
    var macro  = grunt.file.read('./src/sparkler.js');
    var wrap   = grunt.file.read('./src/macro-wrapper.js');

    var lines = macro.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var comm = line.indexOf('//');
      if (comm >= 0) {
        lines[i] = line = line.slice(0, comm);
      }
      if (line.trim().length === 0) {
        lines.splice(i, 1);
        i--;
      }
    }

    macro = '    ' + lines.join('\n    ');
    lines = wrap.split('\n');

    for (i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('{{ MACRO }}') >= 0) {
        lines[i] = macro;
      }
    }

    wrap = letstx + lines.join('\n');
    grunt.file.write('./macros/index.js', wrap);
  });

  grunt.registerTask('build-test', function() {
    grunt.file.write('./test/patterns.js', compileFile('./test/patterns.sjs', true));
    grunt.file.write('./test/extend.js', compileFile('./test/extend.sjs', true));
  });

  grunt.registerTask('compile', function(fileName) {
    console.log(compileFile(fileName));
  });

  function compileFile(fileName, isTest) {
    var macro = grunt.file.read('./macros/index.js');
    var test  = isTest ? grunt.file.read('./test/macros.sjs') : '';
    var file  = grunt.file.read(fileName);
    var sweet = require('sweet.js');
    return sweet.compile([macro, test, file].join('\n'));
  }

  grunt.registerTask('default', ['build']);
  grunt.registerTask('test', ['build', 'build-test', 'mochaTest']);
  grunt.loadNpmTasks('grunt-mocha-test');
};
