// popup.js

const COOKIE_STORAGE_KEY = 'last_cookies'; // 确保与 background.js 中的键名一致

document.addEventListener('DOMContentLoaded', function () {
  // 1. 请求 Background Script 提供存储的 Cookie
  // Popup 无法直接获取当前 Tab 的 URL，需要向 Background 脚本请求
  chrome.runtime.sendMessage(
    {
      action: 'getStoredCookies',
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          'Popup 无法从 Background 获取数据:',
          chrome.runtime.lastError
        );
        document.getElementById('ui-header').textContent =
          '错误：无法连接到后台。';
        return;
      }

      if (response && response.action === 'sendStoredCookies') {
        displayUI(response);
      } else {
        document.getElementById('ui-header').textContent =
          '存储中没有找到 Cookie 数据。';
      }
    }
  );
});

function displayUI(data) {
  const { isSaved, domain, cookieString, currentDomain } = data;

  // 2. 更新 UI 信息
  const header = document.getElementById('ui-header');
  const info = document.getElementById('ui-info');
  const displayArea = document.getElementById('cookie-data-display');
  const applyBtn = document.getElementById('apply-btn');

  header.textContent = 'Cookie Injector';

  if (isSaved) {
    info.innerHTML = `上次获取自: <strong>${domain}</strong><br>
                          当前页面域名: <strong>${currentDomain}</strong>`;
    applyBtn.textContent = `应用到 ${currentDomain}`;
  } else {
    info.innerHTML = `存储库为空，当前 Cookie 获取自: <strong>${domain}</strong>`;
    applyBtn.textContent = `保存并应用`;
  }

  displayArea.value = cookieString;

  // 3. 绑定事件
  document.getElementById('copy-btn').onclick = () =>
    copyToClipboard(cookieString);
  document.getElementById('apply-btn').onclick = () =>
    applyCookies(cookieString);
}

// ------------------- 辅助函数 -------------------

function copyToClipboard(text) {
  // Popup 可以直接使用 navigator.clipboard
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert('Cookie 已复制到剪贴板！');
    })
    .catch((err) => {
      console.error('复制失败:', err);
    });
}

function applyCookies(cookieString) {
  // 获取当前活动的 Tab 信息
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      alert('错误：无法确定当前标签页。');
      return;
    }
    const tabId = tabs[0].id;

    // 发送设置请求给 Background Service Worker，携带 tabId
    chrome.runtime.sendMessage(
      {
        action: 'setCookies',
        cookieString: cookieString,
        tabIdToReload: tabId, // <-- 传入 Tab ID
      },
      (response) => {
        // 收到 Background 的响应后，如果成功，可以关闭 Popup 窗口
        alert(response.status);
        if (response.success) {
          window.close(); // <-- 成功后关闭 Popup 窗口
        }
      }
    );
  });
}
