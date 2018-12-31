const updateIcon = (status) => {
  chrome.browserAction.setIcon({
    path: `${status}.png`
  });
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.browserAction.onClicked.addListener(() => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const activeTab = tabs[0];
      chrome.tabs.sendMessage(activeTab.id, {event: 'iconClicked'}, (resp) => {
        console.log(resp);
      });
    });
  });

  chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0].url.match(/https:\/\/.*\.wiki.*\.org\/.*/)) {
        console.log('not wiki')
        updateIcon('mediawiki');
      }
    });
  });
});

chrome.runtime.onMessage.addListener((req, sender, sendResp) => {
  if (req.status) {
    console.log(req.status)
    updateIcon('DONE');
  } else {
    updateIcon('mediawiki');
  }
  sendResp(`background received: ${req.status}`);
});
