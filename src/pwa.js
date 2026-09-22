export function registerPwa(onStatus = () => {}) {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((registration) => {
      if (registration.waiting) onStatus('更新版を利用できます。再読み込みしてください');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            onStatus('更新版を利用できます。再読み込みしてください');
          }
        });
      });
      return registration;
    })
    .catch(() => {
      onStatus('オフライン準備を完了できませんでした');
      return null;
    });
}
