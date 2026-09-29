// Reexport the native module. On web, it will be resolved to ExpoAtomsModule.web.ts
// and on native platforms to ExpoAtomsModule.ts
export { default } from './ExpoAtomsModule';
export * from './ExpoAtoms.types';
