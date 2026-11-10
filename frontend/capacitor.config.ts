import type {CapacitorConfig} from '@capacitor/cli';

const config:CapacitorConfig={
 appId:'app.llmchat.capacitor',appName:'LLM Chat',webDir:'dist-ios',
 backgroundColor:'#151515',
 ios:{path:'../ios',contentInset:'never',scrollEnabled:false,allowsLinkPreview:false,preferredContentMode:'mobile'},
 server:{hostname:'localhost',iosScheme:'capacitor'},
 plugins:{
  // Keep fetch streaming: CapacitorHttp buffers SSE responses.
  CapacitorHttp:{enabled:false},
  Keyboard:{resize:'none',style:'DARK'},
  SplashScreen:{launchAutoHide:false,backgroundColor:'#151515',showSpinner:false},
  StatusBar:{style:'DARK',overlaysWebView:true},
 },
};
export default config;
