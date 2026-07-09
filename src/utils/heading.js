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
        // iOS Safari — already relative to true north
        heading = event.webkitCompassHeading;
      } else if (event.absolute && typeof event.alpha === 'number') {
        // Android/Chrome — alpha increases counter-clockwise, compass heading increases clockwise
        heading = 360 - event.alpha;
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
