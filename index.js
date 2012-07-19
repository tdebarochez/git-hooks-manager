#!/usr/bin/env node

/*jslint node: true, bitwise: true, nomen: true, sloppy: true, stupid: true, white: true */

var fs = require('fs')
  , path = require('path')
  , child_process = require('child_process');

var hooks = ['applypatch-msg', 'commit-msg', 'pre-auto-gc', 'pre-applypatch', 'pre-commit', 'pre-rebase',
             'pre-receive', 'prepare-commit-msg', 'post-applypatch', 'post-checkout', 'post-commit',
             'post-merge', 'post-receive', 'post-rewrite', 'post-update']
  , hooks_params = {'applypatch-msg': ['filename'],
                    'pre-applypatch': [],
                    'post-applypatch': [],
                    'pre-commit': [],
                    'prepare-commit-msg': ['commit_message_filename', 'source', 'commit_hash'],
                    'commit-msg': ['commit_message_filename'],
                    'post-commit': [],
                    'pre-rebase': [],
                    'post-checkout': ['previous_ref', 'next_ref', 'branch_flag'],
                    'post-merge': ['squash_flag'],
                    'pre-receive': ['stdin', 'old_value', 'new_value', 'ref_name'],
                    'update': ['ref_name', 'old_value', 'new_value'],
                    'post-receive': ['stdin', 'old_value', 'new_value', 'ref_name'],
                    'post-update': ['ref', '*'],
                    'pre-auto-gc': [],
                    'post-rewrite': ['stdin', 'old_value', 'new_value', 'extra', '*']}
  , root_path = path.join(process.env.GIT_DIR, 'hooks');

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

function Manager () {
  this.getHooksConf = function (opts, cb) {
    var glob = require('glob')
      , confs = []
      , hook_type = typeof opts === "object" ? opts.hook_type : opts
      , hook_name = opts.hook_name
      , root_path = typeof opts === "object" ? opts.root_path : '.';
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
          var conf = require('./' + path.join('hooks', hook_type, hook_name, 'hook.json'));
          conf.name = hook_name;
          cb(null, conf);
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
          conf.name = path.basename(path.dirname(file));
          confs.push(conf);
        });
        cb(null, confs);
      });
    });
  };
}

Manager.prototype = {
  init: function () {
    hooks.forEach(function (hook) {
      if (!fs.existsSync(hook)) {
        fs.symlinkSync(__filename, hook, 'file');
      }
      if (!fs.existsSync(hook + '.d')) {
        fs.mkdirSync(hook + '.d', 493); // 0755
      }
    });
  },
  reset: function () {
    hooks.forEach(function (hook) {
      if (fs.existsSync(hook)) {
        fs.unlinkSync(hook);
      }
      if (fs.existsSync(hook + '.d')) {
        rmdirRecursiveSync(hook + '.d');
      }
      fs.symlinkSync(__filename, hook, 'file');
      fs.mkdirSync(hook + '.d', 493); // 0755
    });
  },
  hook: function (hook_type, process_args) {
    var daemon = require('daemon')
      , glob = require('glob')
      , inputs = ""
      , daemonized = false
      , self = this
      , exec = function (inputs) {
        glob(path.join(root_path, hook_type + '.d', '*'), function (err, files) {
          if (err) {
            return console.log(err);
          }
          if (files.length > 0) {
            console.log(files.length + ' ' + hook_type + ' script(s) to execute, ', files);
          }
          else {
            console.log('no ' + hook_type + ' script to execute');
          }
          files.forEach(function (hook_name, hook_number) {

            if (fs.statSync(hook_name).isDirectory()) {
              return;
            }
            self.getHooksConf({"hook_type": hook_type,
                               "hook_name": path.basename(hook_name),
                               "root_path": root_path}, function (err, conf) {
              var pid = -1
                , child_proc = null
                , args = [];
              if (err) {
                return console.error(err);
              }
              if (((typeof conf.async !== "undefined" && conf.async)
                   || (typeof conf.async === "undefined" && hook_type.substr(0, 5) === 'post-'))
                  && !daemonized) {
                daemonized = true;
                pid = daemon.start(path.join(root_path, 'stdout.log'), path.join(root_path, 'stderr.log'));
                console.log((new Date()) + ' : background process started successfully with pid ' + pid);
              }
              if (hooks_params[hook_type][0] !== 'stdin') {
                args = inputs;
              }
              child_proc = child_process.execFile(hook_name, args, {}, function (err) {
                if (hook_number === files.length - 1
                    && hooks_params[hook_type][0] == 'stdin') {
                  process.stdin.resume();
                }
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
              if (child_proc.stdin.writable
                  && hooks_params[hook_type][0] == 'stdin') {
                child_proc.stdin.write(inputs);
                child_proc.stdin.end();
              }
            });
          });
        });
      };
    if (hooks_params[hook_type][0] == 'stdin') {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function (chunk) {
        inputs += chunk;
        if (inputs.charAt(inputs.length - 1) !== "\n") {
          return;
        }
        process.stdin.pause();
        exec.call(this, inputs);
      });
      process.stdin.on('end', function () {
      });
      process.stdin.resume();
    }
    else {
      exec.call(this, process_args);
    }
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
      });
    });
  },
  add: function (hook_type, hook_name) {
    this.getHooksConf({"hook_type": hook_type,
                       "hook_name": hook_name}, function (err, conf) {
      if (err) {
        return console.error(err);
      }
      var filepath = path.join(hook_type + '.d', hook_name)
        , args = {};
      if (fs.existsSync(filepath)) {
        return console.error(hook_name + ' already exists for the ' + hook_type + ' hook');
      }
      function setup () {
        fs.symlinkSync(path.join('..', 'hooks', hook_type, hook_name, conf.index), path.join(hook_type + '.d', hook_name), 'file');
        console.log('hook setup');
        if (typeof conf['post-install'] !== "undefined") {
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
      if (typeof conf['pre-install'] !== "undefined") {
        args = {cwd: path.join('hooks', hook_type, hook_name)};
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
      var index = path.join(hook_type + '.d', hook_name)
        , args = {};
      function unlink() {
        if (fs.existsSync(index)) {
          fs.unlinkSync(index);
        }
        console.log('hook removed');
        if (typeof conf['post-remove'] !== "undefined") {
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
      if (typeof conf['pre-remove'] !== "undefined") {
        args = {cwd: path.join('hooks', hook_type, hook_name)};
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
  list: function (hook_type) {
    var glob = require('glob');
    if (typeof hook_type === 'undefined') {
      return console.error('please define <hook_type>');
    }
    glob(path.join(hook_type + '.d', '*'), function (err, files) {
      if (err) {
        return console.error(err);
      }
      console.log(files.length + ' ' + hook_type + ' hook' + (files.length > 1 ? 's' : '') + ' setup'
                  + (files.length > 0 ? ' :' : ''));
      files.forEach(function (hook_name) {
        console.log(' - ' + path.basename(hook_name));
      });
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
      case 'hook':
        console.log('./' + this.bin_name +' hook <hook_type>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('Simulate <hook_type> execution');
        break;
      case 'init':
        console.log('./' + this.bin_name +' init');
        console.log('Initial setup. Create all symbolic links and directories.');
        break;
      case 'list':
        console.log('./' + this.bin_name +' list <hook_type>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('List every hooks setup for <hook_type>');
        break;
      case 'reset':
        console.log('./' + this.bin_name +' init');
        console.log('Remove every hooks setup.');
        break;
      case 'rm':
        console.log('./' + this.bin_name +' rm <hook_type> <hook_name>');
        console.log('Where <hook_type> is one of :');
        console.log(hooks.join(', '));
        console.log('<hook_name> is one of hooks already installed');
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
        console.log('\tadd, hook, init, reset, rm, search\n');
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
    manager.hook(manager.bin_name, args);
  }
  else {
    var fn = args.shift();
    if (typeof Manager.prototype[fn] !== "undefined") {
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
