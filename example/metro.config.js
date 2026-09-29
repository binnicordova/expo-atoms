// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const libraryRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Use this example's copies of react / react-native, never the library's dev copies.
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(`^${escape(path.join(libraryRoot, 'node_modules', 'react'))}[/\\\\].*$`),
  new RegExp(`^${escape(path.join(libraryRoot, 'node_modules', 'react-native'))}[/\\\\].*$`),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(libraryRoot, 'node_modules'),
];

// Resolve `expo-atoms` to the library's TypeScript sources so edits hot-reload.
const librarySources = {
  'expo-atoms': path.join(libraryRoot, 'src', 'index.ts'),
  'expo-atoms/vanilla': path.join(libraryRoot, 'src', 'vanilla.ts'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (librarySources[moduleName]) {
    return { type: 'sourceFile', filePath: librarySources[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.watchFolders = [libraryRoot];

module.exports = config;
