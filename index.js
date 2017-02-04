#!/usr/bin/env node

var proc = require('child_process')
var execspawn = require('execspawn')
var os = require('os')
var path = require('path')
var fs = require('fs')
var minimist = require('minimist')
var abi = require('node-abi')
var mkdirp = require('mkdirp')

var argv = minimist(process.argv.slice(2), {
  alias: {target: 't', version: 'v', all: 'a'},
  boolean: ['quiet', 'strip']
})

var arch = argv.arch || os.arch()
var platform = argv.platform || os.platform()
var cwd = argv._[0] || '.'
var builds = path.join(cwd, 'prebuilds', platform + '-' + arch)
var output = path.join(cwd, 'build', argv.debug ? 'Debug' : 'Release')

process.env.ARCH = process.env.PREBUILD_ARCH = arch

var targets = [].concat(argv.target || []).map(function (v) {
  if (v.indexOf('@') === -1) v = 'node@' + v

  return {
    runtime: v.split('@')[0],
    target: v.split('@')[1].replace(/^v/, '')
  }
})

// TODO: also support --lts and get versions from travis
if (argv.all) {
  targets = abi.allTargets.slice(0)
}

if (!targets.length) {
  console.error('You must specify at least one target using --target=version@runtime')
  process.exit(1)
}

if (!fs.existsSync(path.join(cwd, 'package.json'))) {
  console.error('No package.json found')
  process.exit(1)
}

mkdirp.sync(builds)
preinstall(loop)

function loop (err) {
  if (err) throw err

  var next = targets.shift()
  if (!next) return

  copySharedLibs(output, builds, function (err) {
    if (err) return loop(err)

    build(next.target, next.runtime, function (err, filename) {
      if (err) return loop(err)

      var name = next.runtime + '-' + abi.getAbi(next.target, next.runtime) + '.node'
      var dest = path.join(builds, name)

      fs.rename(filename, dest, loop)
    })
  })
}

function copySharedLibs (builds, folder, cb) {
  fs.readdir(builds, function (err, files) {
    if (err) return cb()

    var libs = files.filter(function (name) {
      return /\.dylib$/.test(name) || /\.so(\.\d+)?$/.test(name) || /\.dll$/.test(name)
    })

    loop()

    function loop (err) {
      if (err) return cb(err)
      var next = libs.shift()
      if (!next) return cb()

      strip(path.join(builds, next), function (err) {
        if (err) return cb(err)
        copy(path.join(builds, next), path.join(folder, next), loop)
      })
    }
  })
}

function preinstall (cb) {
  if (!argv.preinstall) return cb()

  var child = execspawn(argv.preinstall, {cwd: cwd, stdio: 'inherit'})
  child.on('exit', function (code) {
    if (code) return cb(spawnError(argv.preinstall, code))
    cb()
  })
}

function build (target, runtime, cb) {
  var args = [
    'rebuild',
    '--target=' + target
  ]

  if (argv.arch) {
    args.push('--target_arch=' + argv.arch)
  }

  if (runtime === 'electron') {
    args.push('--runtime=electron')
    args.push('--dist-url=https://atom.io/download/electron')
  }

  if (argv.debug) {
    args.push('--debug')
  } else {
    args.push('--release')
  }

  var child = proc.spawn(os.platform() === 'win32' ? 'node-gyp.cmd' : 'node-gyp', args, {
    cwd: cwd,
    stdio: argv.quiet ? 'ignore' : 'inherit'
  })

  child.on('exit', function (code) {
    if (code) return spawnError('node-gyp', code)

    findBuild(output, function (err, output) {
      if (err) return cb(err)

      strip(output, function (err) {
        if (err) return cb(err)
        cb(null, output)
      })
    })
  })
}

function findBuild (dir, cb) {
  fs.readdir(dir, function (err, files) {
    if (err) return cb(err)

    files = files.filter(function (name) {
      return /\.node$/i.test(name)
    })

    if (!files.length) return cb(new Error('Could not find build'))
    cb(null, path.join(dir, files[0]))
  })
}

function strip (file, cb) {
  if (!argv.strip || platform !== 'darwin' && platform !== 'linux') return process.nextTick(cb)

  var args = platform === 'darwin' ? [file, '-Sx'] : [file, '--strip-all']
  var child = proc.spawn('strip', args, {stdio: 'ignore'})

  child.on('exit', function (code) {
    if (code) return spawnError('strip', code)
    cb()
  })
}

function spawnError (name, code) {
  return new Error(name + ' exited with ' + code)
}

function copy (a, b, cb) {
  fs.stat(a, function (err, st) {
    if (err) return cb(err)
    fs.readFile(a, function (err, buf) {
      if (err) return cb(err)
      fs.writeFile(b, buf, function (err) {
        if (err) return cb(err)
        fs.chmod(b, st.mode, cb)
      })
    })
  })
}
