#!/usr/bin/env node

var minimist = require('minimist')
var abi = require('node-abi')
var prebuildify = require('./index')

var argv = minimist(process.argv.slice(2), {
  alias: {target: 't', version: 'v', all: 'a'},
  boolean: ['quiet', 'strip']
})

var targets = [].concat(argv.target || []).map(function (v) {
  if (v.indexOf('@') === -1) v = 'node@' + v

  return {
    runtime: v.split('@')[0],
    target: v.split('@')[1].replace(/^v/, '')
  }
})

// TODO: also support --lts and get versions from travis
if (argv.all) {
  targets = abi.supportedTargets.slice(0)
}

prebuildify({
  arch: argv.arch,
  platform: argv.platform,
  cwd: argv._[0],
  debug: argv.debug,
  targets: targets,
  preinstall: argv.preinstall,
  postinstall: argv.postinstall,
  strip: argv.strip,
  quiet: argv.quiet
}, function (err) {
  if (err) {
    console.error(err.message || err)
    process.exit(1)
  }
})
