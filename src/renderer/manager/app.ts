/**
 * Manager Dashboard Renderer Application
 * Runs in isolated browser context (sandbox: true, nodeIntegration: false)
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZaloWebView Manager] UI Initialized');

  const addProfileBtn = document.getElementById('btn-add-profile');
  if (addProfileBtn) {
    addProfileBtn.addEventListener('click', () => {
      console.log('[ZaloWebView Manager] Add profile clicked');
    });
  }
});
