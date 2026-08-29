import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * The status bar, themed to match the app's own navy rather than Capacitor's
 * default. Inert everywhere but the native shell — `@capacitor/status-bar` has
 * nothing to act on in a browser tab, and calling it there would just throw.
 */
export function applyNativeChrome(): void {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  void StatusBar.setStyle({ style: Style.Dark });
  void StatusBar.setBackgroundColor({ color: "#081827" });
}
