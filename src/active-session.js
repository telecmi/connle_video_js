// Registry for the live Connle instance, so SDK-internal UI rendered on a
// separate React surface (the Android over-keyguard in-call shell) can reach
// the active call without any app wiring. Last instance wins — apps create
// exactly one.
let active = null;

export function setActiveSession(instance) {
    active = instance;
}

export function getActiveSession() {
    return active;
}
