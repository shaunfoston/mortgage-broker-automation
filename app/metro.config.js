// Expo auto-configures Metro for npm workspaces (watchFolders, nodeModulesPaths),
// which lets the app import ../shared directly.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
