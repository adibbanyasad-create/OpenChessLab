import { useEffect } from 'react';

// Thin, dependency-safe bridge to Capacitor native APIs. Every import is lazy
// and every call is guarded, so the web build never pays for native code and
// never breaks when Capacitor is absent.

export function isNativeApp(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (
        window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
      ).Capacitor?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
}

export function useNativeChrome(): void {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
          import('@capacitor/splash-screen'),
          import('@capacitor/status-bar'),
        ]);
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
        await StatusBar.setBackgroundColor({ color: '#f7f8f5' }).catch(() => undefined);
        await SplashScreen.hide().catch(() => undefined);
      } catch {
        /* Native chrome is cosmetic; the web UI stands alone. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

export function nativeTap(): void {
  if (!isNativeApp()) return;
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined),
    )
    .catch(() => undefined);
}

export function nativeConfirmExit(onExit: () => void): () => void {
  if (!isNativeApp()) return () => undefined;
  let remove: (() => void) | undefined;
  void import('@capacitor/app')
    .then(({ App }) => {
      const listener = App.addListener('backButton', () => {
        if (window.confirm('Leave OpenChessLab? Your workspace is saved on this device.')) onExit();
      });
      listener.then((handle) => {
        remove = () => void handle.remove().catch(() => undefined);
      });
    })
    .catch(() => undefined);
  return () => remove?.();
}
