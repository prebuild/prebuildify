
var minimist = require('minimist')

module.exports = parseArgs

function parseArgs(argv) {

    var options = minimist(argv, {
        alias: {
            name: 'n',
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
        boolean: ['quiet', 'strip', 'napi', 'debug', 'all', 'electron-compat'],
        default: {
            napi: true
        }
    })

    options.targets = [].concat(options.target || [])
    options.cwd = options.cwd || options._[0] || '.'

    return options
}
