#!/usr/bin/env node

var fs = require('fs')
  , path = require('path')
  , daemon = require('daemon')
  , cluster = require('cluster')
  , spawn = require('child_process').spawn
  , exec = require('child_process').exec
  , fork = require('child_process').fork
  , now = new Date
  , root_path = path.join('/', 'var', 'deploy')
  , git_dir = "GIT_DIR" in process.env
              ? path.join(process.cwd(), process.env.GIT_DIR)
              : (process.cwd().substr(-4) == '.git' ? process.cwd() : path.join(process.cwd(), '.git'))
  , repo_name = path.basename(git_dir)
  , conf = fs.existsSync(path.join(root_path, repo_name + '.json')) ? require(path.join(root_path, repo_name + '.json')) : {}
  , nginx_tpl = 'server {'
       + ' listen 80;'
       + ' server_name #{domains};'
       + ' access_log /var/log/#{name}.access.log;'
       + ' error_log /var/log/#{name}.error.log debug;'
       + ' location / { proxy_pass http://127.0.0.1:#{port}/; }}'
  , port = 42000 + Math.round(Math.random() * 1000)
  , sub = fork(path.join(__dirname, 'daemon.js'));

if (process.platform !== 'linux') {
  return console.error('linux only');
}

function nginx() {
  var pack = require(path.join(deploy_path, 'package.json'))
  , domains = '';
  if ("domains" in pack && typeof pack.domains.join === "function") {
    domains = pack.domains.join(" ");
  }
  fs.writeFile('/' + path.join('etc', 'nginx', 'sites-enabled', repo_name + '.conf'),
               nginx_tpl.replace(/#{port}/g, port).replace(/#{name}/g, repo_name).replace(/#{domains}/g, domains),
               function (err) {
                 if (err) {
                   return console.error('error writing nginx conf file', err);
                 }
                 exec('service nginx reload', function (err) {
                   if (err) {
                     return console.error('nginx reload failed', err);
                   }
                 });
               });

}

function killOldProcess() {
  if (!isNaN(conf.pid) && conf.pid > 0) {
    try {
      process.kill(conf.pid, 'SIGTERM');
      console.log('kill old process', conf.pid);
    }
    catch (e) {
      console.error('error while killing old process', e);
    }
  }
  else {
    console.log('no old process to kill');
  }
  if (fs.existsSync(conf.deploy_path)
      && conf.deploy_path.length > 19  // /v/yyyy-m-d/h-m-s/p
      && path.normalize(conf.deploy_path).substr(0, root_path.length) === root_path) {
    spawn('rm', ['-rf', conf.deploy_path])
      .on('exit', function (code) {
        if (code > 0) {
          return console.error('error while deleting old files', code);
        }
        console.log('old repo deleted');
        nginx();
      });
  }
  else {
    console.log('no old repo to remove');
    nginx();
  }
}

function npm(err) {
  console.log('npm');
  if (err) {
    return console.error('error :', err);
  }
  return exec('npm install', {stdio: 'inherit'}, function () {
    if (err) {
      return console.error('npm install error : ', err);
    }
    sub.send({action: 'start',
              params: [path.dirname(deploy_path), port]});
  });
}

function saveConf(pid) {
  console.log('saved conf pid: ', pid);
  fs.writeFile(path.join(root_path, repo_name + '.json'), JSON.stringify({
    deploy_path: path.dirname(deploy_path),
    pid: pid,
    port: port
  }), function (err) {
    if (err) {
      return console.error('write conf file error:', err);
    }
  });
}

sub.on('message', function (m) {
  switch (m.action) {
  case 'pid':
    saveConf(m.params[0]);
    break;
  case 'killed':
    console.error("app died");
    process.exit(1);
    break;
  case 'started':
    sub.disconnect();
    killOldProcess();
    break;
  case 'failed':
    console.error('sub process failed to spawn : ', m.params);
    process.exit(1);
  }
});

var deploy_path = path.join(root_path, now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate());
if (!fs.existsSync(deploy_path)) {
  fs.mkdirSync(deploy_path);
}

deploy_path = path.join(deploy_path, now.getHours() + '-' + now.getMinutes() + '-' + now.getSeconds());
if (!fs.existsSync(deploy_path)) {
  fs.mkdirSync(deploy_path);
}

deploy_path = path.join(deploy_path, repo_name);
if (!fs.existsSync(deploy_path)) {
  fs.mkdirSync(deploy_path);
}

fs.writeFileSync(path.join(deploy_path, 'chroot.sh'),
                   fs.readFileSync(path.join(root_path, 'chroot.sh')));
fs.chmodSync(path.join(deploy_path, 'chroot.sh'), 448); // 0700

console.log('chroot');
exec('./chroot.sh',
     {stdio: 'inherit',
      cwd: deploy_path},
     function (err) {
       if (err !== null) {
         return console.error('error: ', err);
       }
       fs.unlink(path.join(deploy_path, 'chroot.sh'));
       deploy_path = path.join(deploy_path, 'repo');
       console.log('deploy');
       exec('git archive --format=tar HEAD | (cd ' + deploy_path + ' && tar xf -)', {stdio: 'inherit'}, function (err) {
         if (err !== null) {
           return console.error('git archive error: ' + err);
         }
         process.chdir(deploy_path);
         if (fs.existsSync(path.join(conf.deploy_path, 'node_modules'))) {
           console.log('copy node_modules');
           spawn('cp',
                 ['-pR', path.join(conf.deploy_path, 'node_modules'), path.join(deploy_path, 'node_modules')],
                 {stdio: 'inherit'}, npm);
         }
         else {
           npm();
         }
       });
     });
