Git Hooks Manager
===

This package helps you to setup quickly some useful scripts as hook for all your project managed by `git`. Somes are already bundles with this app, but you can add yours. It takes place in `git` hooks directory (`.git/hooks` or `hooks/` for bare repositories).

Setup
---

Installation is very simple :

    $ cd your-project/.git/            # or simply your-project.git for a bare repository
    $ mv hooks hooks_                  # backup existing hooks
    $ git clone git://github.com/tdebarochez/git-hooks-manager.git hooks
    $ cd hooks && npm install          # initialization

Usage
---

There is two ways to use it :

 - clone this repo and use one of provided hooks
 - clone localy this repo, add your own scripts and clone your copy on every of your project

During intialization, this application create, for each hook type, one symbolic link to itself and a directory where each symbolic link will be added when you will decide to setup a hook. IE :

    -rwxr-xr-x@ 1 tdebarochez  staff    10K 24 jui 11:02 index.js
    lrwxr-xr-x  1 tdebarochez  staff    53B 18 jui 21:16 post-checkout -> index.js
    drwxr-xr-x  2 tdebarochez  staff    68B 18 jui 21:16 post-checkout.d

To list every setup hooks, run `ls *.d/*`

Commands
---

Usage :

    $ ./index.js <command> <hook_type> <args>

__search__ : list every available hooks for a git hook type (`pre-commit`, `post-commit`, `post-receive`, etc...)

__add__ / __rm__ : setup or remove a hook

__hook__ : execute one by one every setup hooks by type

Type `./index.js help <command>` to get more infos about a command.

Your own hooks
---

Every scripts are store in `hooks/` directory, arrange by hook type (ie: `hooks/pre-commit/your-hook-name/`). For every script you must define a `hook.json` file. Example :

    {
     "index": "app.js",
     "description": "long description of your hook",
     "post-install": "npm install",
     "async": false
    }

__index__ : entry point of your hook

__description__ : long description

__async__ : this property daemonize the main process for long during operation (ie: builds, unit testing, etc...), this is typicaly for `post-something` hooks.

__pre-install__, __post-install__, __pre-remove__ and __post-remove__ : those commands are executed before or after setup or remove a hook for your project. You can use it to download dependencies, cleanup directories, etc...

You can look at existing hooks to see an example.

Todo
---

Add more and more hooks