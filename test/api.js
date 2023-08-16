var test = require('tape')
var path = require('path')
var os = require('os')
var prebuildify = require('../')
var gt8 = process.version.match(/^v(\d+)\./)[1] > 8

test('build with current node version', function (t) {
  prebuildify({
    cwd: path.join(__dirname, 'package'),
    targets: [{ runtime: 'node', target: process.version }]
  }, function (err) {
    t.ifError(err)
    t.doesNotThrow(function () {
      var folder = os.platform() + '-' + os.arch()
      var name = 'node.abi' + process.versions.modules + '.node'
      var addon = require(path.join(__dirname, 'package', 'prebuilds', folder, name))
      t.equal(addon.check(), 'prebuildify')
    })
    t.end()
  })
})

test('uv, armv and libc tags', function (t) {
  prebuildify({
    cwd: path.join(__dirname, 'package'),
    targets: [{ runtime: 'node', target: process.version }],
    tagUv: 123,
    tagArmv: true, // Should be excluded (unless you run these tests on ARM)
    tagLibc: true // Should be glibc (unless you run these tests on Alpine)
  }, function (err) {
    t.ifError(err)
    t.doesNotThrow(function () {
      var folder = os.platform() + '-' + os.arch()
      var name = [
        'node',
        'abi' + process.versions.modules,
        'uv123',
        'glibc',
        'node'
      ].join('.')
      var addon = require(path.join(__dirname, 'package', 'prebuilds', folder, name))
      t.equal(addon.check(), 'prebuildify')
    })
    t.end()
  })
})

test('uv, armv and libc tags from env var', function (t) {
  process.env.PREBUILD_TAG_UV = '321'
  process.env.PREBUILD_TAG_ARMV = '1' // Should be excluded (unless you run these tests on ARM)
  process.env.PREBUILD_TAG_LIBC = '1' // Should be glibc (unless you run these tests on Alpine)
  prebuildify({
    cwd: path.join(__dirname, 'package'),
    targets: [{ runtime: 'node', target: process.version }]
  }, function (err) {
    t.ifError(err)
    t.doesNotThrow(function () {
      var folder = os.platform() + '-' + os.arch()
      var name = [
        'node',
        'abi' + process.versions.modules,
        'uv321',
        'glibc',
        'node'
      ].join('.')
      var addon = require(path.join(__dirname, 'package', 'prebuilds', folder, name))
      t.equal(addon.check(), 'prebuildify')
    })
    t.end()
  })
})

gt8 && test('prefers locally installed node-gyp bin', function (t) {
  prebuildify({
    cwd: path.join(__dirname, 'mock-gyp'),
    targets: [{ runtime: 'node', target: process.version }]
  }, function (err) {
    t.is(err.message, 'node-gyp exited with 123')
    t.end()
  })
})
