// background.js

const COOKIE_STORAGE_KEY = 'last_cookies';

// 辅助函数：封装获取当前页面的所有 Cookie 的逻辑 (确保存在)
function getCurrentPageCookies(url, callback) {
  chrome.cookies.getAll({ url: url }, callback);
}

// 1. 监听标签页加载完成，获取 Cookie 并保存
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    (tab.url.startsWith('http:') || tab.url.startsWith('https:'))
  ) {
    const url = tab.url;
    const domain = new URL(url).hostname;

    // 获取该域名的所有 Cookie
    chrome.cookies.getAll({ url: url }, (cookies) => {
      if (cookies && cookies.length > 0) {
        const cookieString = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join('; ');

        // 保存到 chrome.storage
        chrome.storage.local.set(
          {
            [COOKIE_STORAGE_KEY]: {
              domain: domain,
              cookieString: cookieString,
            },
          },
          () => {
            // console.log(`Cookies from ${domain} saved.`);
          }
        );
      }
    });
  }
});

// 2. 监听 Content Script 请求，发送已存储的 Cookie
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. 监听 Popup 请求获取存储的 Cookie
  if (request.action === 'getStoredCookies') {
    // Popup 无法直接获取 tab，需要使用 activeTab 来获取当前 Tab 的信息
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ action: 'error', message: '未找到当前活动标签页' });
        return;
      }

      const tab = tabs[0];
      const tabUrl = tab.url;
      const currentDomain = new URL(tabUrl).hostname;

      // 尝试从 chrome.storage 中读取上次保存的 Cookie
      chrome.storage.local.get([COOKIE_STORAGE_KEY], (result) => {
        const savedData = result[COOKIE_STORAGE_KEY];

        if (savedData && savedData.cookieString) {
          // 情况 1: 存储中有数据 -> 返回存储的数据
          sendResponse({
            action: 'sendStoredCookies',
            isSaved: true,
            domain: savedData.domain,
            cookieString: savedData.cookieString,
            currentDomain: currentDomain,
          });
        } else {
          // 情况 2: 存储中没有数据 -> 获取当前页面的 Cookie
          getCurrentPageCookies(tabUrl, (cookies) => {
            // 需要将 getCurrentPageCookies 封装成函数
            const cookieString = cookies
              .map((c) => `${c.name}=${c.value}`)
              .join('; ');

            sendResponse({
              action: 'sendStoredCookies',
              isSaved: false,
              domain: currentDomain,
              cookieString: cookieString,
              currentDomain: currentDomain,
            });
          });
        }
      });
    });
    return true; // 异步响应
  }

  // 监听 Content Script 请求获取存储的 Cookie
  if (request.action === 'ContentReady') {
    const tabUrl = request.tabUrl;
    const currentDomain = new URL(tabUrl).hostname;

    // 步骤 1: 尝试从 chrome.storage 中读取上次保存的 Cookie
    chrome.storage.local.get([COOKIE_STORAGE_KEY], (result) => {
      const savedData = result[COOKIE_STORAGE_KEY];

      if (savedData && savedData.cookieString) {
        sendResponse({
          action: 'displaySavedCookies',
          isSaved: true, // <-- 确保这里是 true
          domain: savedData.domain,
          cookieString: savedData.cookieString,
          currentDomain: currentDomain,
        });
      } else {
        // 情况 2: 存储中没有数据 -> 获取当前页面的 Cookie
        // ... (获取 Cookie 的逻辑)
        sendResponse({
          action: 'displaySavedCookies',
          isSaved: false, // <-- 确保这里是 false
          domain: currentDomain,
          cookieString: cookieString,
          currentDomain: currentDomain,
        });
      }
    });
    return true; // 异步响应
  }

  // 3. 监听 Content Script 请求设置 Cookie (逻辑不变，但更健壮)
  if (request.action === 'setCookies') {
    // 从请求中获取 Tab ID
    const tabIdToReload = request.tabIdToReload;

    // 使用 chrome.tabs.query 来获取当前活动的 Tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // --- 关键检查（解决 TypeError）---
      if (
        !tabs ||
        tabs.length === 0 ||
        !tabs[0].url ||
        !tabs[0].url.startsWith('http')
      ) {
        // 如果 tabs 数组为空，或者当前页面是 chrome:// 内部页面，无法设置 Cookie
        sendResponse({
          status: '错误：无法在当前页面设置 Cookie。请在普通网页上操作。',
          success: false,
        });
        return;
      }

      const tab = tabs[0];
      const currentUrl = tab.url; // 安全地获取 URL (第 131 行附近)
      const currentDomain = new URL(currentUrl).hostname;

      // 假设 cookieString 是 'key1=value1; key2=value2'
      const cookies = request.cookieString
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let cookiesSetCount = 0;

      cookies.forEach((cookiePair) => {
        const parts = cookiePair.split('=');
        if (parts.length >= 2) {
          const name = parts[0];
          const value = parts.slice(1).join('=');

          // 设置 Cookie
          chrome.cookies.set(
            {
              url: currentUrl,
              name: name,
              value: value,
              // domain: '.' + currentDomain, // 使用 .currentDomain 确保子域可用
              expirationDate: new Date().getTime() / 1000 + 60 * 60 * 24 * 365,
            },
            (cookie) => {
              // 检查设置是否成功，但不阻塞主流程
              if (chrome.runtime.lastError) {
                console.error(
                  `设置 Cookie ${name} 失败:`,
                  chrome.runtime.lastError
                );
              } else {
                cookiesSetCount++;
              }
            }
          );
        }
      });

      sendResponse({
        status: `Cookie 设置成功！正在刷新页面...`,
        success: true,
      });

      // 【关键步骤】执行页面刷新
      if (tabIdToReload) {
        chrome.tabs.reload(tabIdToReload, { bypassCache: false }, () => {
          if (chrome.runtime.lastError) {
            console.error('刷新 Tab 失败:', chrome.runtime.lastError.message);
          }
        });
      }
    });

    return true; // 必须返回 true 保持异步连接
  }
});
