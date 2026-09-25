/**
 * Chrome/Edge AI Sidepanel Background Service Worker
 */

// Configure side panel to open when clicking the extension icon
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AI Sidepanel] Extension installed.');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[AI Sidepanel] Failed to set panel behavior:', err));
  }
});

// Also ensure openPanelOnActionClick is active on startup
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[AI Sidepanel] Failed to set panel behavior:', err));
}

// Listen for tab changes to optionally notify the sidepanel
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({
    type: 'TAB_ACTIVATED',
    tabId: activeInfo.tabId,
  }).catch(() => {
    // Ignore error if sidepanel is not open / not listening
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    chrome.runtime.sendMessage({
      type: 'TAB_UPDATED',
      tabId,
      url: tab.url,
      title: tab.title,
    }).catch(() => {
      // Ignore error if sidepanel is not open
    });
  }
});
