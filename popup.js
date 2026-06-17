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
  info.replaceChildren();

  if (isSaved) {
    appendInfoRow(info, '上次获取自', domain);
    appendInfoRow(info, '当前页面域名', currentDomain);
    applyBtn.textContent = `应用到 ${currentDomain}`;
    applyBtn.title = `应用到 ${currentDomain}`;
  } else {
    appendInfoRow(info, '存储库状态', '当前为空');
    appendInfoRow(info, '当前 Cookie 获取自', domain);
    applyBtn.textContent = `保存并应用`;
    applyBtn.removeAttribute('title');
  }

  displayArea.value = cookieString || '';

  // 3. 绑定事件
  document.getElementById('copy-btn').onclick = () =>
    copyToClipboard(displayArea.value);
  document.getElementById('apply-btn').onclick = () =>
    applyCookies(displayArea.value);
}

// ------------------- 辅助函数 -------------------

function appendInfoRow(container, label, value) {
  const row = document.createElement('div');
  const strong = document.createElement('strong');

  strong.textContent = value || '-';
  row.append(`${label}: `, strong);
  container.appendChild(row);
}

let messageTimer;

function showMessage(text, type = 'success', duration = 2000) {
  const message = document.getElementById('message');

  if (!message) {
    return;
  }

  window.clearTimeout(messageTimer);
  message.textContent = text;
  message.classList.toggle('is-error', type === 'error');
  message.classList.add('is-visible');

  if (duration > 0) {
    messageTimer = window.setTimeout(() => {
      message.classList.remove('is-visible');
    }, duration);
  }
}

function copyToClipboard(text) {
  // Popup 可以直接使用 navigator.clipboard
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showMessage('Cookie 已复制到剪贴板');
    })
    .catch((err) => {
      console.error('复制失败:', err);
      showMessage('复制失败，请重试', 'error');
    });
}

function applyCookies(cookieString) {
  // 获取当前活动的 Tab 信息
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      showMessage('错误：无法确定当前标签页', 'error');
      return;
    }
    const tabId = tabs[0].id;
    const applyBtn = document.getElementById('apply-btn');
    const originalApplyText = applyBtn.textContent;

    applyBtn.disabled = true;
    applyBtn.textContent = '应用中...';

    // 发送设置请求给 Background Service Worker，携带 tabId
    chrome.runtime.sendMessage(
      {
        action: 'setCookies',
        cookieString: cookieString,
        tabIdToReload: tabId, // <-- 传入 Tab ID
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('应用 Cookie 失败:', chrome.runtime.lastError);
          applyBtn.disabled = false;
          applyBtn.textContent = originalApplyText;
          showMessage('应用失败，请重试', 'error');
          return;
        }

        if (!response) {
          applyBtn.disabled = false;
          applyBtn.textContent = originalApplyText;
          showMessage('应用失败：后台没有响应', 'error');
          return;
        }

        // 收到 Background 的响应后，如果成功，可以关闭 Popup 窗口
        showMessage(response.status, response.success ? 'success' : 'error', 0);
        if (response.success) {
          window.setTimeout(() => {
            window.close(); // <-- 成功后关闭 Popup 窗口
          }, 1000);
        } else {
          applyBtn.disabled = false;
          applyBtn.textContent = originalApplyText;
        }
      }
    );
  });
}
