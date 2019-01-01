if (!window.indexedDB) {
  throw new Error('IndexedDB unsupported in current browser');
}

const CHROME_EXT_NAME = 'wiki-tracker';
const DB_NAME = CHROME_EXT_NAME;
const DB_VERSION = 1;
const DB_STORE_NAME = 'pages';
const DB_STORE_KEY_PATH = 'url';

const CURRENT_PAGE_URL = window.location.toString();

const PAGE_STATUS_DONE = 'DONE';
const PAGE_STATUS_UPDATED = 'UPDATED';

var db;

const openDB = async () => {
  return new Promise(resolve => {
    const dbOpenRequest = window.indexedDB.open(DB_NAME, DB_VERSION);
    dbOpenRequest.onerror = function(evt) {
      throw new Error(`${CHROME_EXT_NAME} --> indexedDB.open error: ${evt.target.errorCode}`);
    };

    dbOpenRequest.onupgradeneeded = function(evt) {
      console.log(`${CHROME_EXT_NAME} --> dbOpenRequest onupgradeneeded`);
      const db = this.result;
      if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
        db.createObjectStore(DB_STORE_NAME, { keyPath: DB_STORE_KEY_PATH });
      }
    };

    dbOpenRequest.onsuccess = function(evt) {
      console.log(`${CHROME_EXT_NAME} --> dbOpenRequest success`);
      const db = this.result;
      db.onerror = function(evt) {
        throw new Error(`${CHROME_EXT_NAME} --> indexedDB error: ${evt.target.errorCode}`);
      };

      resolve(db);
    };
  });
};

const getStore = async (storeName, mode) => {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, mode);
    tx.onerror = function(evt) {
      throw new Error(`${CHROME_EXT_NAME} --> tx error: ${evt.target.errorCode}`);
    };

    tx.oncomplete = function(evt) {
      console.log(`${CHROME_EXT_NAME} --> tx complete`);
    };

    resolve(tx.objectStore(DB_STORE_NAME));
  });
};

const get = async (store, key) => {
  return new Promise(resolve => {
    const pageRequest = store.get(key);
    pageRequest.onerror = function(evt) {
      throw new Error(`${CHROME_EXT_NAME} --> pageRequest error: ${evt.target.errorCode}`);
    };
    
    pageRequest.onsuccess = function(evt) {
      console.log(`${CHROME_EXT_NAME} --> pageRequest success`);
      resolve(pageRequest.result);
    };
  });
};

const add = async (store, obj) => {
  return new Promise(resolve => {
    const pageAddRequest = store.add(obj);
    pageAddRequest.onerror = function(evt) {
      throw new Error(`${CHROME_EXT_NAME} --> pageAddRequest error: ${evt.target.errorCode}`);
    };
    
    pageAddRequest.onsuccess = function(evt) {
      resolve(pageAddRequest.result);
    };
  });
};

const put = async (store, obj) => {
  return new Promise(resolve => {
    const pagePutRequest = store.put(obj);
    pagePutRequest.onerror = function(evt) {
      throw new Error(`${CHROME_EXT_NAME} --> pagePutRequest error: ${evt.target.errorCode}`);
    };
    
    pagePutRequest.onsuccess = function(evt) {
      resolve(pagePutRequest.result);
    };
  });
};

const isPageUpdated = async (timestamp) => {
  const title = CURRENT_PAGE_URL.split('/').pop();
  return fetch(`https://en.wikipedia.org/w/index.php?title=${title}&action=history`)
  .then((resp) => {
    return resp.text();
  })
  .then((text) => {
    const parser = new DOMParser();
    const html = parser.parseFromString(text, 'text/html');
    
    const dateParts = html.querySelector('.mw-changeslist-date').innerText.split(' ');
    const time = `${dateParts[0].replace(/,/, '')}:00`;
    const day = dateParts[1];
    const month = dateParts[2];
    const year = dateParts[3];
    
    const updatedAt = Date.parse(`${time} ${day} ${month} ${year}`);
    if (updatedAt > timestamp) {
      return true;
    }
    return false;
  })
  .catch((err) => {
    throw new Error(`${CHROME_EXT_NAME} --> fetch/parse error: ${err}`);
  });
};

const onLoad = async () => {
  db = await openDB();

  const pageStoreRead = await getStore(DB_STORE_NAME, 'readonly');

  let page = await get(pageStoreRead, CURRENT_PAGE_URL);
  if (!page) {
    page = {};
  } else {
    if (page.status === PAGE_STATUS_DONE && await isPageUpdated(page.timestamp)) {
      page.status = PAGE_STATUS_UPDATED;
      const pageStoreWrite = await getStore(DB_STORE_NAME, 'readwrite');
      const pageKey = await put(pageStoreWrite, page);
      if (pageKey) {
        console.log(`updated: ${pageKey}`)
      }
    }
  }

  chrome.runtime.sendMessage(page, (resp) => {
    console.log(resp);
  });
};
onLoad();

const onClick = async () => {
  const pageStoreWrite = await getStore(DB_STORE_NAME, 'readwrite');

  const page = await get(pageStoreWrite, CURRENT_PAGE_URL);
  if (!page) {
    const newPage = {
      status: PAGE_STATUS_DONE,
      timestamp: Date.now(),
      url: CURRENT_PAGE_URL
    };
    const pageKey = await add(pageStoreWrite, newPage);
    if (pageKey) {
      chrome.runtime.sendMessage(newPage, (resp) => {
        console.log(resp);
      });
    }
  } else if (page.status === PAGE_STATUS_UPDATED) {
    page.status = PAGE_STATUS_DONE;
    page.timestamp = Date.now();
    const pageKey = await put(pageStoreWrite, page);
    if (pageKey) {
      chrome.runtime.sendMessage(page, (resp) => {
        console.log(resp);
      });
    }
  }
};

chrome.runtime.onMessage.addListener((req, sender, sendResp) => {
  if (req.event === 'iconClicked') {
    sendResp(`wiki-tracker received ${req.event}`);
    onClick();
  }
});
