var test = require('tape')
var path = require('path')
var os = require('os')
var prebuildify = require('../')

test('build with current node version', function (t) {
  prebuildify({
    cwd: path.join(__dirname, 'package'),
    targets: [{runtime: 'node', target: process.version}]
  }, function (err) {
    t.ifError(err)
    t.doesNotThrow(function () {
      var folder = os.platform() + '-' + os.arch()
      var name = 'node-' + process.versions.modules + '.node'
      var addon = require(path.join(__dirname, 'package', 'prebuilds', folder, name))
      t.equal(addon.check(), 'prebuildify')
    })
    t.end()
  })
})
