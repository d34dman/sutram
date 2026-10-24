// When a command leaves the page, Sutram refuses runs until the next page
// starts it. Sometimes the page is not left after all: the person clicks
// "Stay on page", the URL only changes the #hash, a form submit is blocked,
// or the browser brings the page back from its back/forward cache. Then
// nothing would ever call initialized() and every run would be refused.
// watchNavigation() starts Sutram on this page again in those cases.
// Internal: src/browser.js calls it with window.

/** How long to wait for the page to go before starting Sutram on it again, in ms. */
export const NAVIGATION_TIMEOUT = 3000;

/**
 * How long a navigation the browser has started (the Navigation API's
 * navigate event) may take, in ms. A slow form POST is still on its way:
 * resuming on the old page then would let an agent send it again.
 */
export const LOADING_TIMEOUT = 60000;

/**
 * After a reinitialize() that leaves the page (navigates: true), unless
 * initialized() comes first (the kit's adapter answered false, or the app
 * said so), calls registry.initialized() when:
 * - the page is shown again from the back/forward cache (pageshow, persisted);
 * - the navigation stayed in the document (hashchange, or the Navigation
 *   API's navigatesuccess);
 * - the browser stopped the navigation (navigateerror);
 * - the page is still here `delay` ms later and no navigation has started,
 *   or `loading` ms later when one has. Without the Navigation API Sutram
 *   cannot tell, and waits `delay`.
 * A reinitialize() without navigates is a single-page app's: it calls
 * initialized() itself, so nothing is done. Returns a function that stops.
 */
export function watchNavigation(registry, win, { delay = NAVIGATION_TIMEOUT, loading = LOADING_TIMEOUT } = {}) {
  const navigation = win.navigation && typeof win.navigation.addEventListener === "function" ? win.navigation : null;
  let timer = null;
  let pending = null; // the generation of the leave being waited for
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const recover = (generation) => {
    cancel();
    pending = null;
    // A newer reinitialize() owns ready now.
    if (generation === registry.generation) registry.initialized();
  };

  const off = registry.onReinitialize(({ generation, navigates }) => {
    cancel();
    pending = navigates ? generation : null;
    if (!navigates) return;
    timer = setTimeout(() => recover(generation), delay);
    // initialized() first (the adapter said the page stayed, or the app
    // said so): the timer is not needed.
    registry.ready.then(() => {
      if (pending !== generation) return;
      cancel();
      pending = null;
    });
  });
  const onHash = () => { if (pending !== null) recover(pending); };
  // The browser is on its way to another page: wait for it, not for `delay`.
  const onNavigate = () => {
    if (pending === null) return;
    const generation = pending;
    cancel();
    timer = setTimeout(() => recover(generation), loading);
  };
  const onEnd = () => { if (pending !== null) recover(pending); };
  // The page really is going (or going into the cache): let it.
  const onHide = () => cancel();
  // A page from the back/forward cache is a whole page with its commands.
  const onShow = (event) => {
    if (!event || !event.persisted) return;
    cancel();
    pending = null;
    registry.initialized();
  };
  win.addEventListener("hashchange", onHash);
  win.addEventListener("pagehide", onHide);
  win.addEventListener("pageshow", onShow);
  if (navigation) {
    navigation.addEventListener("navigate", onNavigate);
    navigation.addEventListener("navigatesuccess", onEnd);
    navigation.addEventListener("navigateerror", onEnd);
  }
  return () => {
    off();
    cancel();
    win.removeEventListener("hashchange", onHash);
    win.removeEventListener("pagehide", onHide);
    win.removeEventListener("pageshow", onShow);
    if (navigation) {
      navigation.removeEventListener("navigate", onNavigate);
      navigation.removeEventListener("navigatesuccess", onEnd);
      navigation.removeEventListener("navigateerror", onEnd);
    }
  };
}
