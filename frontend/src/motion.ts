import {motionProfile} from './motionProfile';
import durationTokens from './motionTokens.css?raw';

// Read the base CSS tokens once, so JS and CSS cannot drift independently.
// UI actions never wait for the visual transition to finish.
function duration(name:'micro'|'detail'|'surface'|'exit'){
 const value=new RegExp(`--motion-${name}:\\s*(\\d+)ms\\b`).exec(durationTokens);
 if(!value)throw new Error(`Missing motion duration: ${name}`);
 return Number(value[1])/1000;
}
export const motionEase = [.23, 1, .32, 1] as const;
export const motionEasing = 'cubic-bezier(.23,1,.32,1)';
export const motionDuration = {micro:duration('micro'),detail:duration('detail'),surface:duration('surface'),exit:duration('exit')} as const;
export const motionExitMs = motionDuration.exit*1000;
export function softTransition(reduced: boolean | null, duration: number = motionDuration.detail) {
 return {type: 'tween' as const, duration: reduced ? 0 : duration, ease: motionEase};
}
/** Opacity-only reveal: reduced motion shortens it to a brief fade instead of removing it. */
export function fadeTransition(reduced: boolean | null, duration: number = motionDuration.detail) {
 return {type: 'tween' as const, duration: reduced ? motionDuration.micro : duration, ease: motionEase};
}
/** Critically damped spring in the drawer's language (omega in 1/s, no overshoot).
 * The classic profile and reduced motion keep the fixed-duration tween. */
export function springTransition(reduced: boolean | null, omega: number, fallback: number = motionDuration.surface) {
 if (reduced || motionProfile() === 'classic') return softTransition(reduced, fallback);
 return {type: 'spring' as const, stiffness: omega * omega, damping: 2 * omega, mass: 1};
}
