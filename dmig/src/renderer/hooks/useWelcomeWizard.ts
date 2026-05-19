import { useCallback, useState } from 'react';

/**
 * ウェルカムウィザードの表示状態と Settings 永続化。
 */
export function useWelcomeWizard() {
  const [open, setOpen] = useState(false);

  const checkAndMaybeOpen = useCallback(async () => {
    const r = await window.dmig.getSettings();
    if (!r.ok) {
      console.warn('[useWelcomeWizard] getSettings failed:', r.error);
      return;
    }
    if (!r.data.welcomeWizardCompleted) {
      setOpen(true);
    }
  }, []);

  const completeAndClose = useCallback(async () => {
    const r = await window.dmig.updateSettings({
      welcomeWizardCompleted: true,
      welcomeWizardLastShownAt: new Date().toISOString(),
    });
    if (!r.ok) {
      console.warn('[useWelcomeWizard] updateSettings failed:', r.error);
    }
    setOpen(false);
  }, []);

  const forceOpen = useCallback(() => {
    setOpen(true);
  }, []);

  return { open, checkAndMaybeOpen, completeAndClose, forceOpen };
}
