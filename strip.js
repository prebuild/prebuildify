var os = require('os')
var proc = require('child_process')

module.exports = strip

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
