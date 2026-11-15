// Metro config — Expo defaults plus 'txt' as an asset extension: the
// block editor bundles the official Blockly UMD scripts as text assets
// (assets/blockly/*.txt, copied by scripts/copy-blockly.mjs) and reads
// their bytes at runtime for the WebView document (src/ui/BlocklyEditor).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('txt')) {
  config.resolver.assetExts.push('txt');
}

module.exports = config;
