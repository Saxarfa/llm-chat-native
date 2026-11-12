import {createRoot} from 'react-dom/client';
import {NativeApplication} from './native/NativeApplication';
import App from './App';
import './index.css';
import './motionDetails.css';
import './studioWorkspaceMotion.css';
import 'highlight.js/styles/github-dark-dimmed.css';
import './theme.css';
import './interface.css';
import './components/ResponseActivity.css';
import './motionSystem.css';
import './surfaceMotion.css';
import './frostedComposer.css';
import './studioCosmos.css';
import './oledTheme.css';
import './composerClaude.css';
import './composerMenusClaude.css';
import './parametersClaude.css';
import '../../desktop/icon-motion.css';
import '../../desktop/icon-motion.js';
import './mobileApp.css';
import './components/ChatComposer.css';
import './focusInput.css';
import './mobileTouchTargets.css';
import './messageIcons.css';
import './sidebarReference.css';
import './touchPress.css';
import './desktopTouchTargets.css';
import './composerMotion.css';
import './typography.css';
import './native/native.css';
import {initializePWA} from './pwa';
import {initializeTheme} from './theme';
import {initializeInterfaceSize} from './interfaceSize';
import {installDiagnostics,diagnostic,clientError} from './diagnostics';
import {initializeFocusInput} from './focusInput';
import {applyMotionProfile} from './motionProfile';
try{installDiagnostics()}catch{/* The interface must still start if diagnostics are unavailable. */}
initializeTheme();
initializeInterfaceSize();
initializeFocusInput();
applyMotionProfile();
addEventListener('orientationchange',()=>setTimeout(applyMotionProfile,400));
initializePWA();
createRoot(document.getElementById('root')!,{
 onUncaughtError:error=>diagnostic('client.react_error',{...clientError(error),source:'uncaught'}),
 onCaughtError:error=>diagnostic('client.react_error',{...clientError(error),source:'caught'}),
 onRecoverableError:error=>diagnostic('client.react_error',{...clientError(error),source:'recoverable'}),
}).render(<NativeApplication><App/></NativeApplication>);
