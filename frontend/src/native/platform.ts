import {Capacitor} from '@capacitor/core';
export const isNativeIOS=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='ios';
