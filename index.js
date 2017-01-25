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
var builds = path.join(cwd, 'prebuilds')

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

  build(next.target, next.runtime, function (err, filename) {
    if (err) return loop(err)

    var a = abi.getAbi(next.target, next.runtime)
    var name = platform + '-' + arch + '-' + next.runtime + '-' + a + '.node'
    var dest = path.join(builds, name)

    fs.rename(filename, dest, loop)
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
  var argv = [
    'rebuild',
    '--target=' + target
  ]

  if (argv.arch) {
    argv.push('--target_arch=' + argv.arch)
  }

  if (runtime === 'electron') {
    argv.push('--runtime=electron')
    argv.push('--dist-url=https://atom.io/download/electron')
  }

  if (argv.debug) {
    argv.push('--debug')
  } else {
    argv.push('--release')
  }

  var output = path.join(cwd, 'build', argv.debug ? 'Debug' : 'Release')

  var child = proc.spawn('node-gyp', argv, {
    cwd: cwd,
    stdio: argv.quiet ? 'ignore' : 'inherit'
  })

  child.on('exit', function (code) {
    if (code) return spawnError('node-gyp', code)

    findBuild(output, function (err, output) {
      if (err) return cb(err)
      if (!argv.strip) return cb(null, output)

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
  if (platform !== 'darwin' && platform !== 'linux') return process.nextTick(cb)

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
