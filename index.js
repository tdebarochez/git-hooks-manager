#!/usr/bin/env node

var fs = require('fs')
  , path = require('path')
  , child_process = require('child_process');

var hooks = ['post-commit', 'pre-commit', 'post-receive']
  , root_path = path.join('.git', 'hooks');

function Manager () {
  this.getHooksConf = function (opts, cb) {
    var glob = require('glob')
      , confs = []
      , hook_type = "hook_type" in opts ? opts.hook_type : opts
      , hook_name = opts.hook_name
      , root_path = "root_path" in opts ? opts.root_path : '.';
    fs.stat(path.join(root_path, hook_type + '.d'), function(err, stat) {
      if (err) {
        return console.error(err);
      }
      if (!stat.isDirectory()) {
        return console.error('hook ' + hook_type + ' not found');
      }
      if (hook_name) {
        var conf_file = path.join(root_path, 'hooks', hook_type, hook_name, 'hook.json');
        fs.exists(conf_file, function (exists) {
          if (!exists) {
            return cb("hook configuration not found [" + conf_file + "]");
          }
          cb(null, require('./' + path.join('hooks', hook_type, hook_name, 'hook.json')));
        });
        return;
      }
      glob(path.join(root_path, 'hooks', hook_type, '*', 'hook.json'), function (err, files) {
        if (err) {
          return cb(err);
        }
        if (files.length < 1) {
          return cb('no ' + hook_type + ' hook found');
        }
        files.forEach(function (file) {
          var conf = require('./' + file);
          confs.push(conf);
        });
        cb(null, confs);
      });
    });
  }
}

Manager.prototype = {
  init: function () {
    child_process.spawn('npm', ['install']);
    hooks.forEach(function (hook) {
      if (fs.existsSync(hook)) {
        fs.unlinkSync(hook);
      }
      if (fs.existsSync(hook + '.d')) {
        rmdirRecursiveSync(hook + '.d');
      }
      fs.symlinkSync(__filename, hook, 0755);
      fs.mkdirSync(hook + '.d', 0755);
    });
  },
  hook: function (hook_type) {
    var daemon = require('daemon')
      , glob = require('glob');
    var inputs = ""
      , daemonized = true
      , self = this;
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      inputs += chunk;
    });
    process.stdin.on('end', function () {
      glob(path.join(root_path, hook_type + '.d', '*'), function (err, files) {
        if (err) {
          return console.log(err);
        }
        console.log(files.length + ' script(s) to execute, ', files);
        files.forEach(function (hook_name) {
          if (fs.statSync(hook_name).isDirectory()) {
            return;
          }
          self.getHooksConf({"hook_type": hook_type,
                             "hook_name": path.basename(hook_name),
                             "root_path": root_path}, function (err, conf) {
            if (err) {
              return console.error(err);
            }
            if ((("async" in conf && conf.async)
                 || (!("async" in conf) && hook_type.substr(0, 5) == 'post-'))
                && !daemonized) {
              daemonized = true;
              var pid = daemon.start(path.join(root_path, 'stdout.log'), path.join(root_path, 'stderr.log'));
              console.log(new Date + ' : background process started successfully with pid ' + pid);
            }
            var child_proc = child_process.execFile(hook_name, [], {}, function (err) {
              if (err) {
                child_proc.stdin.end();
                process.exit(1);
                return;
              }
            });
            console.log('[HOOK] ' + hook_name + ' (' + child_proc.pid + ')');
            if (child_proc.stdout.readable) {
              child_proc.stdout.pipe(process.stdout);
            }
            if (child_proc.stderr.readable) {
              child_proc.stderr.pipe(process.stderr);
            }
            child_proc.stdin.on('error', function (err) {
              //console.error('' + err);
            });
            if (child_proc.stdin.writable) {
              child_proc.stdin.write(inputs);
              child_proc.stdin.end();
            }
          });
        });
      });
    });
  },
  search: function (hook_type, query) {
    var hooks = [];
    this.getHooksConf(hook_type, function (err, confs) {
      if (err) {
        return console.error(err);
      }
      confs.forEach(function (conf) {
        if (conf.name.match(new RegExp(query))) {
          hooks.push(conf);
        }
      });
      if (hooks.length < 1) {
        return console.error('none found');
      }
      hooks.forEach(function (hook) {
        console.log(hook.name + ' : ' + hook.description.split("\n")[0]);
      })
    })
  },
  add: function (hook_type, hook_name) {
    this.getHooksConf({"hook_type": hook_type,
                       "hook_name": hook_name}, function (err, conf) {
      if (err) {
        return console.error(err);
      }
      var filepath = path.join(hook_type + '.d', hook_name);
      if (fs.existsSync(filepath)) {
        return console.error(hook_name + ' already exists for the ' + hook_type + ' hook');
      }
      function setup () {
        fs.symlinkSync(path.join('..', 'hooks', hook_type, hook_name, conf.index), path.join(hook_type + '.d', hook_name));
        console.log('hook setup');
        if ('post-install' in conf) {
          var args = {cwd: path.join('hooks', hook_type, hook_name)};
          child_process.exec(conf['post-install'], args, function (err, stdout, stderr) {
            if (err) {
              return console.error(err);
            }
            if (stdout.length) {
              console.log(stdout);
            }
            if (stderr.length) {
              console.error(stderr);
            }
          });
        }
      }
      if ('pre-install' in conf) {
        var args = {cwd: path.join('hooks', hook_type, hook_name)};
        child_process.exec(conf['pre-install'], args, function (err, stdout, stderr) {
          if (err) {
            return console.error(err);
          }
          if (stdout.length) {
            console.log(stdout);
          }
          if (stderr.length) {
            console.error(stderr);
          }
          setup();
        });
      }
      else {
        setup();
      }
    });
  },
  rm: function (hook_type, hook_name) {
    this.getHooksConf({"hook_type": hook_type,
                       "hook_name": hook_name}, function (err, conf) {
      if (err) {
        return console.error(err);
      }
      function unlink() {
        if (fs.existsSync(index)) {
          fs.unlinkSync(index);
        }
        console.log('hook removed');
        if ('post-remove' in conf) {
          var args = {cwd: path.join('hooks', hook_type, hook_name)};
          child_process.exec(conf['post-remove'], args, function (err, stdout, stderr) {
            if (err) {
              return console.error(err);
            }
            if (stdout.length) {
              console.log(stdout);
            }
            if (stderr.length) {
              console.error(stderr);
            }
          });
        }
      }
      var index = path.join(hook_type + '.d', hook_name);
      if ('pre-remove' in conf) {
        var args = {cwd: path.join('hooks', hook_type, hook_name)};
        child_process.exec(conf['pre-remove'], args, function (err, stdout, stderr) {
          if (err) {
            return console.error(err);
          }
          if (stdout.length) {
            console.log(stdout);
          }
          if (stderr.length) {
            console.error(stderr);
          }
          unlink();
        });
      }
      else {
        unlink();
      }
    });
  },
  help: function (cmd) {
    switch (cmd) {
      case 'add':
        console.log('./' + this.bin_name +' add <hook_type> <hook_name>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('<hook_name> is one of hooks available');
        break;
      case 'rm':
        console.log('./' + this.bin_name +' rm <hook_type> <hook_name>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('<hook_name> is one of hooks already installed');
        break;
      case 'hook':
        console.log('./' + this.bin_name +' hook <hook_type>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('Simulate <hook_type> execution');
        break;
      case 'search':
        console.log('./' + this.bin_name +' search <hook_type> <query>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('List every available hooks of <hook_type> that match on <query>');
        break;
      default:
        console.log('Usage : ./' + this.bin_name + ' <command>');
        console.log('Where <command> is one of :');
        console.log('\tadd, rm, hook, search\n');
        console.log('./' + this.bin_name + ' help <command>\tquick help on <command>');
    }
  }
};

var manager = new Manager();
module.exports = manager;
if (process.argv.length > 1 && !module.parent) {
  var args = process.argv;
  args.shift();
  manager.bin_name = path.basename(args.shift());
  if (~hooks.indexOf(manager.bin_name)) {
    manager.hook(manager.bin_name);
  }
  else {
    var fn = args.shift();
    if (fn in Manager.prototype) {
      Manager.prototype[fn].apply(manager, args);
    }
    else {
      manager.help(fn);
      if (fn) {
        console.error('command not found');
      }
    }
  }
}

// tools
function rmdirRecursiveSync(directory) {
  if (directory.length < 3) {
    throw new Error('bad directory name [' + directory + ']');
  }
  fs.readdirSync(directory).forEach(function (file) {
    var filepath = path.join(directory, file)
      , stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      rmdirRecursiveSync(filepath);
    }
    else {
      fs.unlinkSync(filepath);
    }
  });
  return fs.rmdirSync(directory);
}