# prebuildify

Prebuild native node modules and bundle the prebuilds with an npm release

```
npm install -g prebuildify
```

## Usage

First go to your native module and make a bunch of prebuilds

``` sh
# got to your native module
cd your-native-module
# build for all electron/node binary versions and strip out symbols
prebuildify --all --strip
# the prebuilds will be stored in ./prebuilds
ls prebuilds
```

Then only remaining thing you need to do now is make your module use a prebuild if one exists
for the platform/runtime you are using.

Use [https://github.com/mafintosh/node-gyp-build] to do this.

``` sh
# first install node-gyp-build
npm install --save node-gyp-build
```

Then add `node-gyp-build` as an install script to your module's package.json

``` js
{
  "name": "your-native-module",
  "scripts": {
    "install": "node-gyp-build"
  }
}
```

The install script will check if a compatible prebuild is bundled. If so it does nothing. If not it will run `node-gyp rebuild` to produce a build.
This means that if the user using your module has disabled install scripts your module will still work (!) as long as a compatible prebuild is bundled.

When loading your native binding from your `index.js` you should use `node-gyp-build` as will to make sure to get the right binding

``` js
// Will load a compiled build if present or a prebuild.
// If no build if found it will throw an exception
var binding = require('node-gyp-build')(__dirname)

module.exports = binding
```

An added benefit of this approach is that your native modules will work across multiple node and electron versions without having the user
need to reinstall or recompile them - as long as you produce prebuilds for all versions.

When publishing your module to npm remember to include the `./prebuilds` folder.

That's it! Happy native hacking.

## License

MIT
