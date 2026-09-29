import { registerWebModule, NativeModule } from 'expo';

class ExpoAtomsModule extends NativeModule<{}> {}

export default registerWebModule(ExpoAtomsModule, 'ExpoAtomsModule');
