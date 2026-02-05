/** OnePanel 核心脚本 - 整合访客/用户模式 */

const DEFAULT_BG = "/static/default_bg.jpg";

const ENGINES = {

    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', logo: 'https://www.bing.com/favicon.ico' },

    baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=', logo: 'https://www.baidu.com/favicon.ico' },

    google: { name: 'Google', url: 'https://www.google.com/search?q=', logo: 'https://www.google.com/favicon.ico' }

};



let currentEngine = 'bing';



/** 核心初始化：页面加载时运行 */

async function initPage() {

    const bgLayer = document.getElementById('bg-layer');

    const authZone = document.getElementById('auth-zone');

    const linksContainer = document.getElementById('links-container');

    const token = localStorage.getItem('onepanel_token');



    startClock();



    // 1. 系统状态检查 (保持不变)

    try {

        const res = await fetch('/api/system/status');

        const status = await res.json();

        if (!status.is_initialized) return window.location.href = '/static/init.html';

    } catch (e) { console.error("系统状态检查失败", e); }



    // 2. 身份识别（核心修正点）

    let isUserVerified = false;



    if (token) {

        try {

            const userRes = await fetch('/api/user/me', {

                headers: { 'Authorization': `Bearer ${token}` }

            });



            if (userRes.ok) {

                const userData = await userRes.json();

                showUserMode(userData, bgLayer, authZone); // 渲染用户界面

                isUserVerified = true;

            } else if (userRes.status === 401) {

                console.warn("Token 已失效，清理登录态");

                localStorage.removeItem('onepanel_token');

            }

            // 如果是 500 等其他错误，这里不进 else if，isUserVerified 保持 false

        } catch (e) {

            console.error("网络异常，无法验证身份", e);

        }

    }



    // 3. 如果验证没通过（没 Token，或者 Token 报错了），渲染访客态

    if (!isUserVerified) {

        resetToGuestUI(bgLayer, authZone);

    }



    // 4. 加载链接

    renderLinks(linksContainer);

    initSearchLogic();

}



/** 实时时钟逻辑 */

function startClock() {

    const clockEl = document.getElementById('live-clock');

    const dateEl = document.getElementById('live-date');



    // 如果 HTML 中没有这些元素，直接返回防止报错

    if (!clockEl || !dateEl) return;



    function update() {

        const now = new Date();



        // 1. 处理时间 (17:21:05)

        const hrs = String(now.getHours()).padStart(2, '0');

        const min = String(now.getMinutes()).padStart(2, '0');

        const sec = String(now.getSeconds()).padStart(2, '0');

        clockEl.textContent = `${hrs}:${min}:${sec}`;



        // 2. 处理日期格式 (02-05 Wed)

        const month = String(now.getMonth() + 1).padStart(2, '0');

        const day = String(now.getDate()).padStart(2, '0');

        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        const week = weekdays[now.getDay()];



        // 最终格式化显示

        dateEl.textContent = `${month}-${day} ${week}`;

    }



    // 每一秒更新一次

    setInterval(update, 1000);

    update(); // 立即执行，避免初次加载白屏

}



/** 仅更新 UI 为访客模式，不强制删除本地 Token */

function resetToGuestUI(bg, zone) {

    bg.style.backgroundImage = `url('${DEFAULT_BG}')`;

    zone.innerHTML = `<button class="glass-btn" onclick="window.location.href='/static/login.html'">🔑 登录 / 注册</button>`;

}



/** 用户模式 UI 渲染 */

function showUserMode(user, bg, zone) {

    bg.style.backgroundImage = `url('${user.custom_bg || DEFAULT_BG}')`;

    zone.innerHTML = `

        <span class="user-info">👤 ${user.username}</span>

        <button class="glass-btn" onclick="document.getElementById('bg-input').click()">✨ 换背景</button>

        <button class="glass-btn" onclick="openModal()">➕ 添链接</button>

        <button class="glass-btn" onclick="logout()">🚪 退出</button>

    `;

}



/** 访客模式 UI 渲染 */

function resetToGuest(bg, zone) {

    bg.style.backgroundImage = `url('${DEFAULT_BG}')`;

    zone.innerHTML = `<button class="glass-btn" onclick="window.location.href='/static/login.html'">🔑 登录 / 注册</button>`;

    localStorage.removeItem('onepanel_token');

}



/** 渲染链接列表 (自动根据 Token 隔离数据) */

async function renderLinks(container) {

    const token = localStorage.getItem('onepanel_token');

    const headers = {};

    if (token) headers['Authorization'] = `Bearer ${token}`;



    try {

        const res = await fetch('/api/links/', { headers });

        const links = await res.json();



        if (links.length === 0) {

            const isUser = !!token;

            // 为访客和用户定制不同的纯文字提示

            container.innerHTML = `

                <div class="empty-state-minimal">

                    <p class="msg-main">${isUser ? '还没有添加链接' : '暂无公开内容'}</p>

                    <p class="msg-sub">${isUser ? '点击上方 <b>“添链接”</b> 开启你的空间' : '请联系管理员配置导航项'}</p>

                </div>

            `;

            return;

        }



        // 2. 渲染初始 HTML，并默认带上 "checking" 类

        container.innerHTML = links.map(l => {

            const domain = new URL(l.url).hostname;

            const iconUrl = `https://favicon.cccyun.cc/${domain}`;

            const firstLetter = l.title.charAt(0).toUpperCase();



            return `

                <div class="link-card checking" id="link-${l.id}" onmousemove="tiltCard(event, this)" onmouseleave="resetCard(this)">

                    <div class="delete-btn" onclick="confirmDelete(event, ${l.id})">×</div>

                    <a href="${l.url}" target="_blank">

                        <div class="link-content">

                            <div class="icon-wrapper">

                                <img src="${iconUrl}" class="link-icon"

                                     onerror="if(!this.dataset.fallback){ this.dataset.fallback=true; this.src='/static/default_link.jpg'; } else { showTextIcon(this, '${firstLetter}'); }">

                            </div>

                            <div class="link-title">${l.title}</div>

                        </div>

                    </a>

                </div>

            `;

        }).join('');



        // 3. 定义 3D 逻辑（只需定义一次，也可以移到全局）

        setupTiltLogic();



        // 4. 执行检测并等待结果

        console.log("正在检测站点可达性...");

        const checkPromises = links.map(l => checkUrlAccessibility(l.url, `link-${l.id}`));



        // 关键：使用 allSettled 保证即便某个 fetch 挂了也能继续排序

        await Promise.allSettled(checkPromises);



        // 5. 排序

        console.log("检测结束，开始排序");

        sortLinksByStatus();



    } catch (e) {

        console.error(e);

        container.innerHTML = `<div style="color:#ff4d4d;">❌ 无法获取链接列表</div>`;

    }

}



/**

 * 将 3D 逻辑抽离，避免每次渲染都重新赋值

 */

function setupTiltLogic() {

    window.tiltCard = function (e, el) {

        const rect = el.getBoundingClientRect();

        const dx = e.clientX - rect.left - rect.width / 2;

        const dy = e.clientY - rect.top - rect.height / 2;

        el.style.transform = `rotateY(${dx / 10}deg) rotateX(${-dy / 5}deg) scale(1.05)`;

    };



    window.resetCard = function (el) {

        el.style.transform = `rotateY(0deg) rotateX(0deg) scale(1)`;

    };

}



async function checkUrlAccessibility(url, elementId) {

    const el = document.getElementById(elementId);

    if (!el) return;



    try {

        const controller = new AbortController();

        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时



        await fetch(url, { mode: 'no-cors', cache: 'no-cache', signal: controller.signal });



        clearTimeout(timeoutId);

        el.classList.remove('inactive'); // 确保它是亮的

    } catch (e) {

        el.classList.add('inactive');    // 失败则变灰

    } finally {

        el.classList.remove('checking'); // 无论如何，停止呼吸灯动画

    }

}



function sortLinksByStatus() {

    const container = document.getElementById('links-container');

    // 只选取具有 link-card 类的元素进行排序

    const cards = Array.from(container.querySelectorAll('.link-card'));



    cards.sort((a, b) => {

        const aStatus = a.classList.contains('inactive') ? 1 : 0;

        const bStatus = b.classList.contains('inactive') ? 1 : 0;

        return aStatus - bStatus;

    });



    // 重点：使用 documentFragment 减少重绘次数，提高性能

    const fragment = document.createDocumentFragment();

    cards.forEach(card => fragment.appendChild(card));

    container.appendChild(fragment);

}



window.confirmDelete = async function (e, id) {

    e.stopPropagation(); // 防止触发跳转

    if (!confirm("确定要删除这个链接吗？")) return;



    const token = localStorage.getItem('onepanel_token');

    const res = await fetch(`/api/links/${id}`, {

        method: 'DELETE',

        headers: { 'Authorization': `Bearer ${token}` }

    });



    if (res.ok) {

        showToast("已删除链接");

        initPage(); // 重新加载列表

    }

};



async function triggerHealthCheck() {

    const token = localStorage.getItem('onepanel_token');

    if (token) {

        fetch('/api/links/check-health', {

            method: 'POST',

            headers: { 'Authorization': `Bearer ${token}` }

        }).then(() => renderLinks(document.getElementById('links-container')));

    }

}



/** 添加链接逻辑 */

async function submitAddLink(event) {

    event.preventDefault();

    const token = localStorage.getItem('onepanel_token');

    if (!token) return alert("请先登录");



    const linkData = {

        title: document.getElementById('modal-link-title').value,

        url: document.getElementById('modal-link-url').value,

        icon: "" // 预留图标

    };



    try {

        const res = await fetch('/api/links', {

            method: 'POST',

            headers: {

                'Content-Type': 'application/json',

                'Authorization': `Bearer ${token}`

            },

            body: JSON.stringify(linkData)

        });



        if (res.ok) {

            closeModal();

            showToast("添加成功！正在同步空间..."); // 替换 alert

            setTimeout(() => location.reload(), 2000); // 延迟刷新，让用户看一眼 Toast

        } else {

            const err = await res.json();

            showToast(err.detail || "保存失败", "error"); // 替换 alert

        }



    } catch (e) {

        alert("网络异常");

    }

}





/** 背景上传 */

document.getElementById('bg-input').onchange = async (e) => {

    const file = e.target.files[0];

    const token = localStorage.getItem('onepanel_token');

    if (!file || !token) return;



    const formData = new FormData();

    formData.append('file', file);



    const res = await fetch('/api/upload-bg', {

        method: 'POST',

        headers: { 'Authorization': `Bearer ${token}` },

        body: formData

    });

    if (res.ok) {

        showToast("背景已更新 ✨");

        setTimeout(() => location.reload(), 1500);

    } else {

        showToast("上传失败", "error");

    }

};



/**

 * 显示提示消息 (Toast)

 * @param {string} msg 消息内容

 * @param {string} type 类型: success | error

 */

window.showToast = function (msg, type = 'success') {

    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');

    toast.className = `toast toast-${type}`;



    // 根据类型显示不同的小图标 (这里使用 Emoji，简单直接)

    const icon = type === 'success' ? '✅' : '❌';



    toast.innerHTML = `

        <span style="font-size: 18px;">${icon}</span>

        <span style="font-size: 14px; font-weight: 500;">${msg}</span>

    `;



    container.appendChild(toast);



    // 3秒后自动移除

    setTimeout(() => {

        toast.classList.add('hide');

        setTimeout(() => toast.remove(), 400);

    }, 3000);

};



/** 弹窗控制 **/

window.openModal = function () {

    const modal = document.getElementById('add-link-modal');

    if (modal) {

        modal.classList.add('active');

    } else {

        console.error("找不到 ID 为 add-link-modal 的弹窗元素");

    }

};



window.closeModal = function () {

    const modal = document.getElementById('add-link-modal');

    modal.classList.remove('active');

    // 延迟清空，避免动画没做完就看到文字消失

    setTimeout(() => {

        document.getElementById('modal-link-title').value = '';

        document.getElementById('modal-link-url').value = '';

    }, 300);

};



function logout() {

    localStorage.removeItem('onepanel_token');

    location.reload();

}



/** 搜索引擎逻辑 **/

function initSearchLogic() {

    const pill = document.getElementById('engine-selector');

    const menu = document.getElementById('engine-dropdown');

    if (!pill) return;

    pill.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('active'); };

    document.addEventListener('click', () => menu.classList.remove('active'));

}



function setEngine(event, key) {

    if (event) event.stopPropagation();

    currentEngine = key;

    document.getElementById('current-engine-logo').src = ENGINES[key].logo;

    document.getElementById('search-input').placeholder = `使用 ${ENGINES[key].name} 搜索...`;

    document.getElementById('engine-dropdown').classList.remove('active');

    document.getElementById('search-input').focus();

}



function handleSearch(event) {

    if (event.key === 'Enter') {

        const q = document.getElementById('search-input').value;

        if (q.trim()) window.open(ENGINES[currentEngine].url + encodeURIComponent(q), '_blank');

    }

}



// 绑定全局

window.onload = initPage;