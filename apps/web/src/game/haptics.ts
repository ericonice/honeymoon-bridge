import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

function native(): boolean {
  return Capacitor.isNativePlatform();
}

/** Winning a single deal — the lightest tier of the three, and the most frequent. */
export function hapticDealWon(): void {
  if (native()) {
    void Haptics.impact({ style: ImpactStyle.Light });
  }
}

/** Winning a game inside a rubber — real news, but not the whole match yet. */
export function hapticGameWon(): void {
  if (native()) {
    void Haptics.impact({ style: ImpactStyle.Medium });
  }
}

/** Winning the match itself, the biggest thing a sitting produces. */
export function hapticMatchWon(): void {
  if (native()) {
    void Haptics.notification({ type: NotificationType.Success });
  }
}
