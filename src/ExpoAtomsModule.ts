import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoAtomsModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoAtomsModule>('ExpoAtoms');
