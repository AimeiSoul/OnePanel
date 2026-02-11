async function checkAdminAuth() {
    if (window.location.pathname === '/admin_login') return;
    const token = localStorage.getItem('onepanel_admin_token');

    if (!token) {
        window.location.href = '/admin_login';
        return;
    }

    try {
        const res = await fetch('/api/admin/config', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('onepanel_admin_token');
            window.location.href = '/admin_login';
        }
    } catch (e) {
        console.error("鉴权服务异常:", e);
    }
}

function adminLogout() {
    localStorage.removeItem('onepanel_admin_token');
    localStorage.removeItem('is_admin');

    const mainContent = document.querySelector('.admin-main');
    if (mainContent) {
        mainContent.style.transition = '0.5s';
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'scale(0.95)';
    }

    setTimeout(() => {
        window.location.href = '/admin_login';
    }, 500);
}

let editorsInitialized = false;

function switchTab(tabId) {
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    const targetSection = document.getElementById(`tab-${tabId}`);
    if (targetSection) targetSection.style.display = 'block';

    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    window.location.hash = tabId;

    if (tabId === 'settings') {
        loadConfig();
    } else if (tabId === 'users') {
        loadUsers(1);
    } else if (tabId === 'links') {
        loadLinks(1);
    } else if (tabId === 'icons') {
        loadUnusedIcons();
    } else if (tabId === 'custom') {
        if (!editorsInitialized) {
            initCodeEditors();
            editorsInitialized = true;
        }
        loadCustomCode();
    }
}


function showModal({ title, message, isPrompt = false, defaultValue = "" }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const inputContainer = document.getElementById('modal-input-container');
        const inputField = document.getElementById('modal-input');

        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;

        if (isPrompt) {
            inputContainer.style.display = 'block';
            inputField.value = defaultValue;
        } else {
            inputContainer.style.display = 'none';
        }

        modal.classList.add('show');

        const cleanup = (value) => {
            modal.classList.remove('show');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(value);
        };

        confirmBtn.onclick = () => cleanup(isPrompt ? inputField.value : true);
        cancelBtn.onclick = () => cleanup(null);
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;

    const icon = type === 'success' ? '✅' : '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 2000);
}

async function loadConfig() {
    const token = localStorage.getItem('onepanel_admin_token');
    try {
        const res = await fetch('/api/admin/config', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const config = await res.json();
        if (config.site_title) document.getElementById('site-title').value = config.site_title;
        if (config.favicon_api) document.getElementById('favicon-api').value = config.favicon_api;
        const regSwitch = document.getElementById('reg-switch');
        if (regSwitch) {
            regSwitch.checked = config.registration_open;
            regSwitch.onchange = (e) => updateRegStatus(e.target.checked);
        }
    } catch (e) {
        console.error("加载配置失败", e);
    }
}

async function updateRegStatus(isOpen) {
    const token = localStorage.getItem('onepanel_admin_token');
    try {
        const res = await fetch(`/api/admin/config/registration?open=${isOpen}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showToast(`注册功能已${isOpen ? '开启' : '关闭'} 🔐`);
        }
    } catch (e) {
        showToast("操作失败", "error");
    }
}

let currentAssetType = '';

function triggerUpload(type) {
    currentAssetType = type;
    document.getElementById('asset-file-input').click();
}

async function handleAssetUpload(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('asset_type', currentAssetType);

    const token = localStorage.getItem('onepanel_admin_token');
    const res = await fetch('/api/admin/config/assets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    if (res.ok) {
        showToast("资源替换成功！由于浏览器缓存，需要强制刷新页面查看效果。");
    }
}

async function saveSiteInfo() {
    const titleInput = document.getElementById('site-title');
    const apiInput = document.getElementById('favicon-api');

    if (!titleInput || !apiInput) {
        console.error("HTML 元素缺失！请检查 HTML 中是否有 id='site-title' 和 id='favicon-api'");
        showToast("系统错误：找不到输入框，请检查 HTML 结构");
        return;
    }

    const titleVal = titleInput.value.trim();
    const apiVal = apiInput.value.trim();

    const formData = new FormData();
    let hasChanged = false;

    if (titleVal !== "") {
        formData.append('site_title', titleVal);
        hasChanged = true;
    }
    if (apiVal !== "") {
        formData.append('favicon_api', apiVal);
        hasChanged = true;
    }

    if (!hasChanged) {
        showToast("请至少输入一项要修改的内容！");
        return;
    }

    const token = localStorage.getItem('onepanel_admin_token');

    try {
        const res = await fetch('/api/admin/config/site-info', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.ok) {
            showToast("站点配置更新成功 ✨");
            if (typeof loadConfig === 'function') loadConfig();
        } else {
            const err = await res.json();
            showToast("保存失败: " + (err.detail || "校验未通过"));
        }
    } catch (e) {
        showToast("网络连接异常");
    }
}

function renderUserRow(user) {
    const isActive = user.is_active !== undefined ? Boolean(user.is_active) : true;

    const statusText = isActive ? "封禁" : "解封";
    const statusAction = isActive ? "disable" : "enable";
    const statusLabel = isActive ? '正常' : '<span style="color:var(--admin-danger)">已封禁</span>';
    const dotClass = isActive ? 'active' : 'inactive';

    const roleText = user.is_admin ? "管理员" : "普通用户";
    const roleAction = user.is_admin ? "unset_admin" : "set_admin";
    const roleBtnText = user.is_admin ? "取消管理" : "设为管理";

    return `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="status-dot ${dotClass}"></span>
                    ${user.username}
                </div>
            </td>
            <td><span class="badge">${roleText}</span></td>
            <td>${statusLabel}</td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="admin-btn-mini" onclick="adminResetPass(${user.id}, '${user.username}')" title="重置密码">
                        🔑
                    </button>
                    
                    <button class="admin-btn-mini" onclick="adminUserAction(${user.id}, '${roleAction}')">
                        ${roleBtnText}
                    </button>

                    <button class="admin-btn-mini" onclick="adminUserAction(${user.id}, '${statusAction}')">
                        ${statusText}
                    </button>

                    <button class="admin-btn-mini logout-btn" style="padding: 5px 10px; width:auto;" onclick="confirmDelete(${user.id})">
                        删除
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function debounce(func, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

window.performUserSearch = debounce(() => loadUsers(1), 400);
window.performLinkSearch = debounce(() => loadLinks(1), 400);

async function loadUsers(page = 1) {
    const user_pageSize = 10;
    const currPage = Number(page);
    const searchInput = document.getElementById('user-search');
    const query = searchInput ? searchInput.value : '';
    const token = localStorage.getItem('onepanel_admin_token');

    const tbody = document.getElementById('user-list-body');
    if (tbody) {
        tbody.style.transition = 'opacity 0.2s ease';
        tbody.style.opacity = '0.3';
    }

    try {
        const res = await fetch(`/api/admin/users?page=${currPage}&size=${user_pageSize}&q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        renderUserList(data.items);
        renderPagination(data.total, 'user', currPage, user_pageSize);
    } catch (e) {
        showToast("加载用户失败", "error");
    } finally {
        if (tbody) tbody.style.opacity = '1';
    }
}

function renderUserList(userArray) {
    const tbody = document.getElementById('user-list-body');
    if (!tbody) return;

    if (userArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; opacity:0.5; padding: 40px;">未找到匹配用户 🔍</td></tr>`;
        return;
    }

    tbody.innerHTML = userArray.map(user => renderUserRow(user)).join('');
}

async function adminUserAction(userId, action) {
    const actionConfigs = {
        'disable': { title: "封禁用户", message: "确定要封禁该用户吗？用户将无法登录。" },
        'enable': { title: "解封用户", message: "确定要解封该用户吗？" },
        'set_admin': { title: "设为管理员", message: "确定要将该用户提升为管理员吗？" },
        'unset_admin': { title: "取消管理权限", message: "确定要取消该用户的管理员权限吗？" }
    };

    const config = actionConfigs[action];

    if (config) {
        const confirmed = await showModal({
            title: config.title,
            message: config.message
        });
        if (!confirmed) return;
    }

    const formData = new FormData();
    formData.append('action', action);

    try {
        const res = await fetch(`/api/admin/users/${userId}/action`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}` },
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            showToast(data.msg);
            loadUsers(1);
        } else {
            showToast(data.detail || "操作失败", "error");
        }
    } catch (e) {
        showToast("服务器连接失败", "error");
    }
}

async function adminResetPass(userId, username) {
    const newPass = await showModal({
        title: "重置密码",
        message: `正在为用户 [${username}] 设置新密码:`,
        isPrompt: true
    });

    if (newPass === null || newPass.trim() === "") return;

    const formData = new FormData();
    formData.append('new_password', newPass);

    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}` },
        body: formData
    });

    if (res.ok) {
        showToast("密码重置成功");
    } else {
        const data = await res.json();
        showToast(data.detail, "error");
    }
}

async function confirmDelete(userId) {
    const confirmed = await showModal({
        title: "确认删除",
        message: "⚠️ 删除用户将清除其所有数据且不可恢复！"
    });

    if (!confirmed) return;

    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}`
            }
        });

        const data = await res.json();

        if (res.ok) {
            showToast("用户已彻底删除", "success");
            loadUsers();
        } else {
            showToast(data.detail || "删除失败", "error");
        }
    } catch (e) {
        showToast("服务器连接异常", "error");
    }
}

function renderLinkList(linkArray) {
    const tbody = document.getElementById('link-list-body');
    if (!tbody) return;

    tbody.innerHTML = linkArray.map(link => {
        const isHigh = link.risk_score === 'high';
        const config = isHigh
            ? { class: 'badge-danger', text: '🚨 高风险' }
            : { class: 'badge-success', text: '✅ 正常' };

        return `
            <tr class="${link.risk_score === 'high' ? 'row-risk-high' : ''}">
                <td><b style="color:#fff">${link.title}</b></td>
                <td>
                    <a href="${link.url}" target="_blank" style="color:var(--admin-secondary); text-decoration:none; font-size:0.85rem;">
                        ${link.url} ↗
                    </a>
                </td>
                <td><span class="badge">${link.owner}</span></td>
                <td><span class="${config.class}">${config.text}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="admin-btn-mini" onclick="checkVT('${link.url}')">国际</button>
                        <button class="admin-btn-mini" onclick="checkTX('${link.url}')">国内</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function checkVT(url) {
    const b64Url = btoa(url.trim()).replace(/=/g, '');
    window.open(`https://www.virustotal.com/gui/url/${b64Url}/detection`, '_blank');
}

function checkTX(url) {
    window.open(`https://urlsec.qq.com/check.html?url=${encodeURIComponent(url.trim())}`, '_blank');
}

async function loadLinks(page = 1) {
    const pageSize = 7;
    const currentPage = Number(page);
    const token = localStorage.getItem('onepanel_admin_token');
    const searchInput = document.getElementById('link-search');
    const query = searchInput ? searchInput.value : '';

    const tbody = document.getElementById('link-list-body');
    if (tbody) {
        tbody.style.transition = 'opacity 0.3s ease';
        tbody.style.opacity = '0.3';
    }

    try {
        const url = `/api/admin/links?page=${currentPage}&size=${pageSize}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("加载失败");
        const data = await res.json();

        renderLinkList(data.items);
        renderPagination(data.total, 'link', currentPage, pageSize);

    } catch (e) {
        console.error("解析失败:", e);
        showToast("数据加载异常", "error");
    } finally {
        if (tbody) tbody.style.opacity = '1';
    }
}

function renderPagination(total, type, currentPage, size) {
    const curr = Number(currentPage);
    const sz = Number(size);
    const tot = Number(total);
    const totalPages = Math.ceil(tot / sz);

    const totalEl = document.getElementById(`${type}-total-count`);
    const pageBox = document.getElementById(`${type}-page-numbers`);
    const prevBtn = document.getElementById(`${type}-btn-prev`);
    const nextBtn = document.getElementById(`${type}-btn-next`);

    if (totalEl) totalEl.innerText = tot;

    if (pageBox) {
        let html = '';
        const funcName = type === 'user' ? 'loadUsers' : 'loadLinks';
        for (let i = 1; i <= totalPages; i++) {
            const activeClass = i === curr ? 'active' : '';
            html += `<span class="page-num ${activeClass}" onclick="${funcName}(${i})">${i}</span>`;
        }
        pageBox.innerHTML = html;
    }

    if (prevBtn && nextBtn) {
        const funcName = type === 'user' ? 'loadUsers' : 'loadLinks';
        prevBtn.disabled = (curr <= 1);
        nextBtn.disabled = (curr >= totalPages || totalPages === 0);

        prevBtn.onclick = (e) => { e.preventDefault(); if (curr > 1) window[funcName](curr - 1); };
        nextBtn.onclick = (e) => { e.preventDefault(); if (curr < totalPages) window[funcName](curr + 1); };
    }
}

function openRiskModal() {
    const modal = document.getElementById('risk-modal');

    if (!modal) {
        console.error("找不到 ID 为 risk-modal 的元素！");
        return;
    }

    modal.classList.add('show');

    loadRiskKeywordsToInput();
}

function closeRiskModal() {
    const modal = document.getElementById('risk-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function loadRiskKeywordsToInput() {
    const input = document.getElementById('risk-keywords-input');
    const token = localStorage.getItem('onepanel_admin_token');

    if (input) input.value = "正在获取最新词库...";

    try {
        const res = await fetch('/api/admin/config/risk-keywords', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (input) input.value = data.keywords || '';
    } catch (e) {
        console.error("加载关键词失败:", e);
        if (input) input.value = "";
        showToast("词库加载失败", "error");
    }
}

async function saveRiskKeywords() {
    const token = localStorage.getItem('onepanel_admin_token');
    const inputField = document.getElementById('risk-keywords-input');

    if (!inputField) {
        showToast("找不到输入框", "error");
        return;
    }

    const keywordsValue = inputField.value;

    const saveBtn = event.target;
    const originalText = saveBtn.innerText;
    saveBtn.disabled = true;
    saveBtn.innerText = "正在保存...";

    try {
        const res = await fetch('/api/admin/config/risk-keywords', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keywords: keywordsValue })
        });

        const result = await res.json();

        if (res.ok) {
            showToast("✅ 配置覆盖成功，拦截策略已实时更新", "success");
            closeRiskModal();

            if (typeof loadLinks === 'function') {
                loadLinks();
            }
        } else {
            throw new Error(result.detail || "保存失败");
        }
    } catch (e) {
        console.error("覆写失败:", e);
        showToast(`❌ 保存失败: ${e.message}`, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    }
}

async function loadUnusedIcons() {
    const grid = document.getElementById('unused-icons-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="padding:20px; color:var(--admin-primary);">🔍 正在深度扫描磁盘冗余文件...</div>';

    const token = localStorage.getItem('onepanel_admin_token');
    try {
        const res = await fetch('/api/admin/unused-icons', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const icons = await res.json();

        if (icons.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 50px; opacity: 0.5;">
                    <div style="font-size: 40px; margin-bottom: 10px;">🍃</div>
                    <p>磁盘非常干净，没有发现冗余图标</p>
                </div>`;
            return;
        }

        grid.innerHTML = icons.map(icon => `
            <div class="asset-card">
                <div class="asset-preview">
                    <img src="${icon.url}" style="width: 32px; height: 32px; object-fit: contain; background: #fff; border-radius: 4px;">
                </div>
                <div class="asset-info">
                    <p class="asset-name" title="${icon.filename}">${icon.filename.substring(0, 12)}...</p>
                    <p class="asset-desc">${icon.size}</p>
                </div>
                <button class="admin-btn-mini" onclick="deleteUnusedIcon('${icon.filename}')" 
                        style="color: #ff4757; border-color: rgba(255,71,87,0.2);">删除</button>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = '<div style="padding:20px; color:red;">加载失败，请检查后端 API</div>';
    }
}

async function deleteUnusedIcon(filename) {
    const confirmed = await showModal({
        title: "确认删除",
        message: `确定要永久删除图标 [${filename}] 吗？此操作不可撤销。`,
        isPrompt: false
    });

    if (!confirmed) return;

    try {
        const res = await fetch('/api/admin/unused-icons', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filenames: [filename] })
        });

        if (res.ok) {
            showToast("文件已删除");
            loadUnusedIcons(); 
        }
    } catch (e) {
        showToast("删除失败", "error");
    }
}

async function clearAllUnusedIcons() {
    const grid = document.getElementById('unused-icons-grid');
    const count = grid.querySelectorAll('.asset-card').length;
    if (count === 0) return;

    const confirmed = await showModal({
        title: "危险操作",
        message: `你即将清理 ${count} 个冗余文件。这些文件目前没有被任何链接引用，确定要一键清空吗？`,
        isPrompt: false
    });

    if (!confirmed) return;

    const icons = await (await fetch('/api/admin/unused-icons', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}` }
    })).json();
    const filenames = icons.map(i => i.filename);

    const res = await fetch('/api/admin/unused-icons', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('onepanel_admin_token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filenames: filenames })
    });

    if (res.ok) {
        showToast(`成功清理 ${filenames.length} 个冗余文件`);
        loadUnusedIcons();
    }
}

function initCodeEditors() {
    const commonConfig = {
        lineNumbers: true,    
        theme: "dracula",     
        tabSize: 4,            
        indentUnit: 4,
        lineWrapping: true,    
        viewportMargin: Infinity
    };

    cssEditor = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
        ...commonConfig,
        mode: "css"
    });

    jsEditor = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        ...commonConfig,
        mode: "javascript"
    });

    cssEditor.setSize(null, "250px");
    jsEditor.setSize(null, "250px");
}

async function loadCustomCode() {
    const token = localStorage.getItem('onepanel_admin_token');
    try {
        const res = await fetch('/api/admin/config/custom-code', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        cssEditor.setValue(data.custom_styles || "");
        jsEditor.setValue(data.custom_scripts || "");

        setTimeout(() => {
            cssEditor.refresh();
            jsEditor.refresh();
        }, 100);
    } catch (e) {
        showToast("加载失败", "error");
    }
}

async function saveCustomCode() {
    const token = localStorage.getItem('onepanel_admin_token');
    const styles = cssEditor.getValue();
    const scripts = jsEditor.getValue();

    if (scripts.trim() !== "") {
        try {
            new Function(`async () => { ${scripts} }`);
        } catch (e) {
            await showModal({
                title: "脚本语法错误",
                message: e.message
            });
        }
    }

    try {
        const res = await fetch('/api/admin/config/custom-code', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                custom_styles: styles,
                custom_scripts: scripts
            })
        });

        const data = await res.json();

        if (res.ok) {
            showToast("自定义代码已更新");
        } else {
            showToast(data.detail || "操作被拒绝", "error");
        }
    } catch (e) {
        console.error("保存出错:", e);
        showToast("请求失败，请检查网络", "error");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();

    const currentTab = window.location.hash.replace('#', '') || 'settings';

    switchTab(currentTab);
});