// When a command leaves the page, Sutram refuses runs until the next page
// starts it. Sometimes the page is not left after all: the person clicks
// "Stay on page", the URL only changes the #hash, a form submit is blocked,
// or the browser brings the page back from its back/forward cache. Then
// nothing would ever call initialized() and every run would be refused.
// watchNavigation() starts Sutram on this page again when the browser says
// the page stayed. It never guesses from the time that passed: resuming on
// a page that is still on its way out would let an agent act on it, such as
// sending a slow form POST twice.
// Internal: src/browser.js calls it with window.

/**
 * After a reinitialize() that leaves the page (navigates: true), unless
 * initialized() comes first (the kit's adapter answered false, or the app
 * said so), calls registry.initialized() when:
 * - the page is shown again from the back/forward cache (pageshow, persisted);
 * - the navigation stayed in the document (hashchange, or the Navigation
 *   API's navigatesuccess);
 * - the browser stopped the navigation (the Navigation API's navigateerror,
 *   as after "Stay on page").
 * Nothing else resumes it: a navigation that ends without an event, such as
 * a link that downloads a file, leaves runs refused until the page loads
 * again or the app calls initialized().
 * A reinitialize() without navigates is a single-page app's: it calls
 * initialized() itself, so nothing is done. Returns a function that stops.
 */
export function watchNavigation(registry, win) {
  const navigation = win.navigation && typeof win.navigation.addEventListener === "function" ? win.navigation : null;
  let pending = null; // the generation of the leave being waited for

  const off = registry.onReinitialize(({ generation, navigates }) => {
    pending = navigates ? generation : null;
  });
  // Sutram starts again on this page, unless a newer reinitialize() owns ready now.
  const stayed = () => {
    if (pending === null) return;
    const generation = pending;
    pending = null;
    if (generation === registry.generation) registry.initialized();
  };
  // A page from the back/forward cache is a whole page with its commands.
  const onShow = (event) => {
    if (!event || !event.persisted) return;
    pending = null;
    registry.initialized();
  };
  win.addEventListener("hashchange", stayed);
  win.addEventListener("pageshow", onShow);
  if (navigation) {
    navigation.addEventListener("navigatesuccess", stayed);
    navigation.addEventListener("navigateerror", stayed);
  }
  return () => {
    off();
    win.removeEventListener("hashchange", stayed);
    win.removeEventListener("pageshow", onShow);
    if (navigation) {
      navigation.removeEventListener("navigatesuccess", stayed);
      navigation.removeEventListener("navigateerror", stayed);
    }
  };
}
