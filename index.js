var proc = require('child_process')
var execspawn = require('execspawn')
var os = require('os')
var path = require('path')
var fs = require('fs')
var abi = require('node-abi')
var mkdirp = require('mkdirp-classic')
var tar = require('tar-fs')
var pump = require('pump')
var npmRunPath = require('npm-run-path')

module.exports = prebuildify

function prebuildify (opts, cb) {
  opts = Object.assign({
    arch: process.env.PREBUILD_ARCH || os.arch(),
    platform: process.env.PREBUILD_PLATFORM || os.platform(),
    uv: process.env.PREBUILD_UV || uv(),
    strip: process.env.PREBUILD_STRIP === '1',
    stripBin: process.env.PREBUILD_STRIP_BIN || 'strip',
    nodeGyp: process.env.PREBUILD_NODE_GYP || npmbin('node-gyp'),
    shell: process.env.PREBUILD_SHELL || shell(),
    cwd: '.',
    targets: []
  }, opts)

  if (!opts.armv) {
    opts.armv = process.env.PREBUILD_ARMV || armv(opts)
  }

  if (!opts.libc) {
    opts.libc = process.env.PREBUILD_LIBC || (isAlpine(opts) ? 'musl' : 'glibc')
  }

  if (!opts.out) {
    opts.out = opts.cwd
  }

  var targets = resolveTargets(opts.targets, opts.all, opts.napi, opts.electronCompat)

  if (!targets.length) {
    return process.nextTick(cb, new Error('You must specify at least one target'))
  }

  opts = Object.assign(opts, {
    targets: targets,
    env: Object.assign({}, process.env, {
      PREBUILD_ARCH: opts.arch,
      PREBUILD_PLATFORM: opts.platform,
      PREBUILD_UV: opts.uv,
      PREBUILD_ARMV: opts.armv,
      PREBUILD_LIBC: opts.libc,
      PREBUILD_STRIP: opts.strip ? '1' : '0',
      PREBUILD_STRIP_BIN: opts.stripBin,
      PREBUILD_NODE_GYP: opts.nodeGyp,
      PREBUILD_SHELL: opts.shell
    }),
    builds: path.join(opts.out, 'prebuilds', opts.platform + '-' + opts.arch),
    output: path.join(opts.cwd, 'build', opts.debug ? 'Debug' : 'Release')
  })

  if (opts.arch === 'ia32' && opts.platform === 'linux' && opts.arch !== os.arch()) {
    opts.env.CFLAGS = '-m32'
  }

  // Since npm@5.6.0 npm adds its bundled node-gyp to PATH, taking precedence
  // over the local .bin folder. Counter that by (again) adding .bin to PATH.
  opts.env = npmRunPath.env({ env: opts.env, cwd: opts.cwd })

  mkdirp(opts.builds, function (err) {
    if (err) return cb(err)
    loop(opts, function (err) {
      if (err) return cb(err)

      if (opts.artifacts) return copyRecursive(opts.artifacts, opts.builds, cb)
      return cb()
    })
  })
}

function loop (opts, cb) {
  var next = opts.targets.shift()
  if (!next) return cb()

  run(opts.preinstall, opts, function (err) {
    if (err) return cb(err)

    build(next.target, next.runtime, opts, function (err, filename) {
      if (err) return cb(err)

      run(opts.postinstall, opts, function (err) {
        if (err) return cb(err)

        copySharedLibs(opts.output, opts.builds, opts, function (err) {
          if (err) return cb(err)

          var name = prebuildName(next, opts)
          var dest = path.join(opts.builds, name)

          fs.rename(filename, dest, function (err) {
            if (err) return cb(err)

            loop(opts, cb)
          })
        })
      })
    })
  })
}

function prebuildName (target, opts) {
  var tags = [target.runtime]

  if (opts.napi) {
    tags.push('napi')
  } else {
    tags.push('abi' + abi.getAbi(target.target, target.runtime))
  }

  if (opts.tagUv) {
    var uv = opts.tagUv === true ? opts.uv : opts.tagUv
    if (uv) tags.push('uv' + uv)
  }

  if (opts.tagArmv) {
    var armv = opts.tagArmv === true ? opts.armv : opts.tagArmv
    if (armv) tags.push('armv' + armv)
  }

  if (opts.tagLibc) {
    var libc = opts.tagLibc === true ? opts.libc : opts.tagLibc
    if (libc) tags.push(libc)
  }

  return tags.join('.') + '.node'
}

function copySharedLibs (builds, folder, opts, cb) {
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

      strip(path.join(builds, next), opts, function (err) {
        if (err) return cb(err)
        copy(path.join(builds, next), path.join(folder, next), loop)
      })
    }
  })
}

function run (cmd, opts, cb) {
  if (!cmd) return cb()

  var child = execspawn(cmd, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: 'inherit',
    shell: opts.shell
  })

  child.on('exit', function (code) {
    if (code) return cb(spawnError(cmd, code))
    cb()
  })
}

function build (target, runtime, opts, cb) {
  var args = [
    'rebuild',
    '--target=' + target
  ]

  // Since electron and node are reusing the versions now (fx 6.0.0) and
  // node-gyp only uses the version to store the dev files, they have started
  // clashing. To work around this we explicitly set devdir to tmpdir/runtime(/target)
  const cache = opts.cache || path.join(os.tmpdir(), 'prebuildify')
  args.push('--devdir=' + path.join(cache, runtime))

  if (opts.arch) {
    // Only pass the first architecture because node-gyp doesn't understand
    // our multi-arch tuples (for example "x64+arm64"). In any case addon
    // authors must modify their binding.gyp for multi-arch scenarios,
    // because neither node-gyp nor prebuildify have builtin support.
    args.push('--arch=' + opts.arch.split('+')[0])
  }

  if (runtime === 'electron') {
    args.push('--runtime=electron')
    args.push('--dist-url=https://atom.io/download/electron')
  } else if (runtime === 'node' && [10, 11].some(buggedMajor => +target.split('.')[0] === buggedMajor)) {
    // work around a build bug in node versions 10 and 11 https://github.com/nodejs/node-gyp/issues/1457
    args.push('--build_v8_with_gn=false')
  }

  if (opts.debug) {
    args.push('--debug')
  } else {
    args.push('--release')
  }

  mkdirp(cache, function () {
    var child = proc.spawn(opts.nodeGyp, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: opts.quiet ? 'ignore' : 'inherit'
    })

    child.on('exit', function (code) {
      if (code) return cb(spawnError('node-gyp', code))

      findBuild(opts.output, function (err, output) {
        if (err) return cb(err)

        strip(output, opts, function (err) {
          if (err) return cb(err)
          cb(null, output)
        })
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

function strip (file, opts, cb) {
  var platform = os.platform()
  if (!opts.strip || (platform !== 'darwin' && platform !== 'linux')) return cb()

  var args = platform === 'darwin' ? [file, '-Sx'] : [file, '--strip-all']
  var child = proc.spawn(opts.stripBin, args, { stdio: 'ignore' })

  child.on('exit', function (code) {
    if (code) return cb(spawnError(opts.stripBin, code))
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

function copyRecursive (src, dst, cb) {
  pump(tar.pack(src), tar.extract(dst), cb)
}

function npmbin (name) {
  return os.platform() === 'win32' ? name + '.cmd' : name
}

function shell () {
  return os.platform() === 'android' ? 'sh' : undefined
}

function resolveTargets (targets, all, napi, electronCompat) {
  targets = targets.map(function (v) {
    if (typeof v === 'object' && v !== null) return v
    if (v.indexOf('@') === -1) v = 'node@' + v

    return {
      runtime: v.split('@')[0],
      target: v.split('@')[1].replace(/^v/, '')
    }
  })

  // TODO: also support --lts and get versions from travis
  if (all) {
    targets = abi.supportedTargets.slice(0)
  }

  // Should be the default once napi is stable
  if (napi && targets.length === 0) {
    targets = [
      abi.supportedTargets.filter(onlyNode).pop(),
      abi.supportedTargets.filter(onlyElectron).pop()
    ]

    if (!electronCompat) targets.pop()

    if (targets[0].target === '9.0.0') targets[0].target = '9.6.1'
  }

  return targets
}

function onlyNode (t) {
  return t.runtime === 'node'
}

function onlyElectron (t) {
  return t.runtime === 'electron'
}

function uv () {
  return (process.versions.uv || '').split('.')[0]
}

function armv (opts) {
  var host = os.arch()
  var target = opts.arch

  // Can't detect armv in cross-compiling scenarios.
  if (host !== target) return ''

  return (host === 'arm64' ? '8' : process.config.variables.arm_version) || ''
}

function isAlpine (opts) {
  var host = os.platform()
  var target = opts.platform

  if (host !== target) return false

  return host === 'linux' && fs.existsSync('/etc/alpine-release')
}
