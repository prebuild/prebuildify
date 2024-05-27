#!/usr/bin/env node


var prebuildify = require('./index')
var parseArgs = require('./parse.js')

prebuildify(parseArgs(process.argv.slice(2)), function (err) {
  if (err) {
    console.error(err.message || err)
    process.exit(1)
  }
})
