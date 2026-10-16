const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
module.exports = async context => {
  if (context.electronPlatformName === 'darwin') {
    // Finder metadata from copied runtime files prevents codesign. Only clean generated output.
    execFileSync('/usr/bin/xattr', ['-cr', join(context.appOutDir, context.packager.appInfo.productFilename + '.app')]);
  }
};
