/**
 * Apply a manual calibration offset (degrees) to a heading, wrapping into 0-360.
 * Sensor bias, magnetic declination, or per-device quirks can leave the raw
 * reading consistently off by a fixed amount — this lets a user-set offset
 * correct for that. `heading` may be null (unavailable), in which case it
 * passes through unchanged.
 */
export function applyHeadingOffset(heading, offsetDegrees = 0) {
  if (heading == null || !offsetDegrees) return heading;
  return ((heading + offsetDegrees) % 360 + 360) % 360;
}

/**
 * Tilt-compensated compass heading from raw alpha/beta/gamma (degrees).
 * Naively using `360 - alpha` only works when the device is lying flat;
 * held upright to frame a photo (the normal case), alpha alone no longer
 * tracks compass heading, so this folds in the device's full 3D tilt.
 * Standard formula — see e.g. https://www.w3.org/TR/orientation-event/.
 */
function computeTiltCompensatedHeading(alpha, beta, gamma) {
  const degToRad = Math.PI / 180;
  const z = alpha * degToRad;
  const x = beta  * degToRad;
  const y = gamma * degToRad;

  const cZ = Math.cos(z), sZ = Math.sin(z);
  const cY = Math.cos(y), sY = Math.sin(y);
  const sX = Math.sin(x);

  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;

  let heading = Math.atan(Vx / Vy);
  if (Vy < 0) heading += Math.PI;
  else if (Vx < 0) heading += 2 * Math.PI;

  return heading * (180 / Math.PI);
}

/**
 * Resolve with a compass heading in degrees (0-360), or null within `timeoutMs`.
 * Never throws — degrades gracefully like getCoords() on timeout/denial.
 *
 * Must be invoked as part of a user gesture (e.g. a button tap) the first time,
 * since iOS 13+ requires DeviceOrientationEvent.requestPermission() to be called
 * from within a user gesture before it will show its permission prompt.
 */
export async function getHeading(timeoutMs = 3000) {
  if (typeof DeviceOrientationEvent === 'undefined') {
    console.log('[camera] DeviceOrientationEvent not available');
    return null;
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') {
        console.warn('[camera] device orientation permission not granted →', permission);
        return null;
      }
    } catch (err) {
      console.warn('[camera] device orientation permission request failed →', err.message);
      return null;
    }
  }

  const eventName = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute'
    : 'deviceorientation';

  return new Promise(resolve => {
    let settled = false;
    const finish = (heading) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(eventName, handler);
      resolve(heading);
    };

    const handler = (event) => {
      let heading = null;
      if (typeof event.webkitCompassHeading === 'number') {
        // iOS Safari — already tilt- and screen-orientation-compensated, relative to true north
        heading = event.webkitCompassHeading;
      } else if (
        event.absolute &&
        typeof event.alpha === 'number' &&
        typeof event.beta === 'number' &&
        typeof event.gamma === 'number'
      ) {
        // Android/Chrome — alpha/beta/gamma are relative to the device's physical
        // frame, not the (possibly rotated) CSS viewport, so correct for screen
        // rotation before tilt-compensating. Sign/rotation convention here is
        // the commonly-cited one; verify against a real compass if a landscape
        // capture still reads off.
        const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
        const adjustedAlpha = ((event.alpha + screenAngle) % 360 + 360) % 360;
        heading = computeTiltCompensatedHeading(adjustedAlpha, event.beta, event.gamma);
      }
      if (heading == null || Number.isNaN(heading)) return;
      finish(((heading % 360) + 360) % 360);
    };

    const timer = setTimeout(() => {
      console.warn('[camera] device orientation timed out');
      finish(null);
    }, timeoutMs);

    window.addEventListener(eventName, handler);
  });
}
