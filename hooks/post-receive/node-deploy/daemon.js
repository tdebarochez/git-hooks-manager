var daemon = require('daemon')
  , path = require('path')
  , fs = require('fs')
  , spawn = require('child_process').spawn;

process.on('message', function (m) {
  switch (m.action) {
  case 'start':
    start.apply(this, m.params);
    break;
  }
});

function start(deploy_path, port) {
  try {
    //daemon.setreuid(1000);
    process.chdir(deploy_path);
    if (!fs.existsSync(path.join('repo', 'package.json'))) {
      console.error('package.json file missing');
      process.exit(1);
    }
    var pack = require(path.join(deploy_path, 'repo', 'package.json'));
    if (!("scripts" in pack) || !("start" in pack.scripts)) {
      console.error('scripts start missing');
      process.exit(1);
    }
    var env = process.env;
    env.HTTP_PORT = port;
    env.PATH += ';/usr/local/bin/';
    console.log(port);
    var args = pack.scripts.start.split(/\s+/)
    , cmd = args.shift();
    console.log('spawn :', cmd, args, port);
    daemon.start('stdout.log',
                 'stderr.log');
    daemon.chroot(deploy_path);
    var subproc = spawn(cmd, args,
                       {stdio: 'inherit',
                        cwd: 'repo',
                        env: env});
    subproc.on('exit', function (code, signal) {
      clearTimeout(subproc_timeout);
      if (code > 0) {
        console.error('app died, ', code, signal);
        process.send({action: "killed"});
        process.exit(1);
      }
      console.warn('app closed prematurely, normal ?');
    });
    var subproc_timeout = setTimeout(function () {
      if (!subproc.killed) {
        process.send({action: "started", params: [subproc.pid]});
      }
    }, 2000);
    process.send({action: 'pid', params: [subproc.pid]});
  }
  catch (e) {
    process.send({action: 'failed', params: e});
    console.error('catch : ', e);
    process.exit(1);
  }
}
