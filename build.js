var proc = require('child_process')
var os = require('os')
var path = require('path')
var fs = require('fs')
var tar = require('tar-stream')
var octal = require('octal')
var zlib = require('zlib')
var minimist = require('minimist')

var argv = minimist(process.argv.slice(2), {
  alias: {target: 't'}
})

build('example/mknod', {target: '1.4.15', runtime: 'electron', log: true, debug: false, strip: true}, function (err, filename) {
  if (err) throw err

  pack(filename)
    .pipe(zlib.createGzip())
    .pipe(fs.createWriteStream('output.tgz'))
})

function pack (filename) {
  var name = path.basename(filename)
  var pack = tar.pack()

  fs.stat(filename, function (err, st) {
    if (err) return pack.destroy(err)
    fs.readFile(filename, function (err, buf) {
      pack.entry({
        name: 'build/Release/' + name,
        mode: st.mode | octal(444) | octal(222),
        uid: st.uid,
        gid: st.gid
      }, buf, function (err) {
        if (err) return pack.destroy(err)
        pack.finalize()
      })
    })
  })

  return pack
}

function build (cwd, opts, cb) {
  var argv = [
    'rebuild',
    '--target=' + opts.target
  ]

  if (opts.arch) {
    argv.push('--target_arch=' + opts.arch)
  }

  if (opts.runtime === 'electron') {
    argv.push('--runtime=electron')
    argv.push('--dist-url=https://atom.io/download/electron')
  }

  if (opts.debug) {
    argv.push('--debug')
  } else {
    argv.push('--release')
  }

  var child = proc.spawn('node-gyp', argv, {
    cwd: cwd,
    stdio: opts.log ? 'inherit' : 'ignore'
  })

  child.on('exit', function (code) {
    if (code) {
      var error = new Error ('node-gyp exited with ' + code)
      error.code = code
      return cb(error)
    }

    var output = path.join(cwd, 'build', opts.debug ? 'Debug' : 'Release')

    fs.readdir(output, function (err, files) {
      if (err) return cb(err)

      files = files.filter(function (name) {
        return /\.node$/i.test(name)
      })

      if (!files.length) return cb(new Error('Could not find build'))
      output = path.join(output, files[0])

      if (!opts.strip) return cb(null, output)

      strip(output, function (err) {
        if (err) return cb(err)
        cb(null, output)
      })
    })
  })
}

function strip (file, cb) {
  var platform = os.platform()
  if (platform !== 'darwin' && platform !== 'linux') return process.nextTick(cb)

  var args = platform === 'darwin' ? [file, '-Sx'] : [file, '--strip-all']
  var child = proc.spawn('strip', args, {stdio: 'ignore'})

  child.on('exit', function (code) {
    if (code) {
      var error = new Error ('strip exited with ' + code)
      error.code = code
      return cb(error)
    }
    cb()
  })
}
