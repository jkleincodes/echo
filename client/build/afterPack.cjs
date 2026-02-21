const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  console.log(`Re-signing ${appPath} with ad-hoc identity...`);

  // Re-sign the entire bundle so all binaries share the same (empty) Team ID
  execSync(
    `codesign --force --deep --sign - --entitlements "${entitlements}" "${appPath}"`,
    { stdio: 'inherit' }
  );
};
