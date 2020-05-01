#!/usr/bin/env node

var minimist = require('minimist')
var prebuildify = require('./index')

var argv = minimist(process.argv.slice(2), {
  alias: {
    target: 't',
    version: 'v',
    all: 'a',
    napi: 'n-api',
    stripBin: 'strip-bin',
    nodeGyp: 'node-gyp',
    tagUv: 'tag-uv',
    tagArmv: 'tag-armv',
    tagLibc: 'tag-libc',
    electronCompat: 'electron-compat',
    cache: 'c'
  },
  boolean: ['quiet', 'strip', 'napi', 'debug', 'all', 'electron-compat']
})

argv.targets = [].concat(argv.target || [])
argv.cwd = argv.cwd || argv._[0] || '.'

prebuildify(argv, function (err) {
  if (err) {
    console.error(err.message || err)
    process.exit(1)
  }
})
