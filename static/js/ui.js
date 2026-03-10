function $(id) {
    return document.getElementById(id);
}

function safe(el, fn) {
    if (el) fn(el);
}

function getFaviconUrl(url) {
    let hostname = "invalid";
    try {
        hostname = new URL(url).hostname;
    } catch (e) {
        return '/static/default_link.jpg';
    }

    const template = window.CONFIG_FAVICON_API || "https://favicon.cccyun.cc/${hostname}";

    return template.replace("${hostname}", hostname);
}

function startClock() {
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');

    if (!clockEl || !dateEl) return;

    function update() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hrs}:${min}:${sec}`;

        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dateEl.textContent = `${month}-${day} ${weekdays[now.getDay()]}`;
    }

    setInterval(update, 1000);
    update();
}

async function renderLinks(container) {
    const token = localStorage.getItem('onepanel_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const target = container || document.getElementById('links-container');
    if (!target) {
        console.warn("跳过渲染：未找到 links-container 元素");
        return;
    }

    let userData = null;
    if (token) {
        try {
            const userRes = await fetch('/api/user/me', { headers });
            if (userRes.ok) {
                userData = await userRes.json();
            } else if (userRes.status === 401) {
                console.warn("Token 已失效，自动转为访客模式");
                localStorage.removeItem('onepanel_token');
                token = null;
            }
        } catch (e) { console.error("获取用户信息失败", e); }
    }

    try {
        const fetchUrl = token ? '/api/groups/' : '/api/groups/public';
        const response = await fetch(fetchUrl, { headers });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "请求失败");
        }

        let groups = await response.json();

        if (!Array.isArray(groups)) throw new Error("返回数据格式错误");

        if (userData && !userData.is_admin) {
            const hiddenStr = userData.hidden_groups || "";
            const hiddenList = hiddenStr.split(',').filter(Boolean);
            groups = groups.filter(g => !hiddenList.includes(g.id.toString()));
        }

        if (!groups.length) {
            target.innerHTML = `<div class="empty-state">暂无内容</div>`;
            return;
        }

        window.linkRegistry = {};

        target.innerHTML = groups.map(group => {
            const links = group.links || [];
            const isPublic = group.id === 1;
            const isAdmin = userData && userData.is_admin === true;

            const isReadonly = isPublic && !isAdmin;
            const canHide = isPublic && userData !== null && !isAdmin;

            const placeholderHtml = links.length === 0 ? `
                <div class="empty-link-placeholder">
                    <span style="color:rgba(255,255,255,0.3); font-size:14px;">暂无链接</span>
                    ${token && !isReadonly ? '<span style="color:#66ccff;font-size:12px;">点击“添链接”开始</span>' : ''}
                </div>` : '';

            const cardsHtml = links.map(l => {
                window.linkRegistry[l.id] = { ...l, group_id: group.id };

                const iconSrc = (l.icon && l.icon.trim() !== "")
                    ? l.icon
                    : getFaviconUrl(l.url);

                return `
                <div class="link-card" id="link-${l.id}" data-link-id="${l.id}">
                    ${(token && !isReadonly) ? `
                        <div class="link-actions">
                            <button type="button" class="link-action-btn edit-btn" onclick="openEditLinkModalById(event, ${l.id})" aria-label="Edit link" title="编辑"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 000-1.42l-2.5-2.5a1.003 1.003 0 00-1.42 0l-1.96 1.96 3.75 3.75 2.13-2.09z"/></svg></button>
                            <button type="button" class="link-action-btn delete-btn" onclick="confirmDelete(event, ${l.id})" aria-label="Delete link" title="删除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg></button>
                        </div>` : ''}
                    <a href="${l.url}" target="_blank">
                        <div class="icon-wrapper">
                            <img src="${iconSrc}"
                                 alt="${l.title}"
                                 onerror="this.onerror=null; this.src='/static/default_link.jpg';">
                        </div>
                        <div class="link-title">${l.title}</div>
                    </a>
                </div>`;
            }).join('');

            return `
            <div class="group-section ${isReadonly ? 'readonly-group' : ''}" data-id="${group.id}">
                <div class="group-header">
                    ${(token && !isReadonly) ? `<span class="group-drag-handle">⠿</span>` : ''}
                    <h3 class="group-title" 
                        ${(token && !isReadonly) ? `onclick="editGroupName(this, ${group.id})"` : ''}>
                        ${group.name} ${isPublic ? '<span class="public-badge">公共</span>' : ''}
                    </h3>
                    ${isPublic
                    ? (canHide ? `<span class="group-hide-btn" onclick="hideGroup(${group.id})">×</span>` : '')
                    : (token ? `<span class="group-del-btn" onclick="confirmDeleteGroup(${group.id})">×</span>` : '')
                }
                </div>
                <div class="links-grid" data-group-id="${group.id}">
                    ${placeholderHtml}
                    ${cardsHtml}
                </div>
            </div>`;
        }).join('');

        if (token && typeof initSortable === 'function') {
            initSortable(userData);
        }

        groups.forEach(g =>
            g.links?.forEach(l => {
                if (typeof checkUrlAccessibility === 'function') {
                    checkUrlAccessibility(l.url, `link-${l.id}`);
                }
            })
        );

    } catch (e) {
        console.error("渲染列表失败:", e);
        target.innerHTML = `<div style="color:rgba(255,255,255,0.5); padding:20px;">数据加载异常</div>`;
    }
}

window.renderLinks = renderLinks;

function initSortable(userData) {
    const token = localStorage.getItem('onepanel_token');
    if (!token || typeof Sortable === 'undefined') return;

    const isAdmin = userData && userData.is_admin === true;

    document.querySelectorAll('.links-grid').forEach(el => {
        const groupId = el.dataset.groupId;
        const isReadonly = (groupId === "1" && !isAdmin);

        new Sortable(el, {
            group: 'shared-links',
            animation: 150,
            disabled: isReadonly,
            handle: '.link-card',

            onEnd: async (evt) => {
                if (evt.to.dataset.groupId === "1" && !isAdmin) {
                    UI.showToast("公共分组内容仅管理员可修改", false);
                    window.location.reload();
                    return;
                }

                const syncGroupOrder = async (gridElement) => {
                    const groupId = gridElement.dataset.groupId;

                    const linkIds = Array.from(
                        gridElement.querySelectorAll('.link-card')
                    ).map(card => parseInt(card.dataset.linkId));

                    if (!linkIds.length) return;

                    await fetch(`/api/links/reorder`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            link_ids: linkIds,
                            group_id: parseInt(groupId)
                        })
                    });
                };

                await syncGroupOrder(evt.to);

                if (evt.from !== evt.to) {
                    await syncGroupOrder(evt.from);
                }
            }
        });
    });

    const container = document.getElementById('links-container');
    if (container) {
        new Sortable(container, {
            animation: 150,
            handle: '.group-drag-handle',
            onEnd: async () => {
                const groupIds = Array.from(
                    container.querySelectorAll('.group-section')
                ).map(el => parseInt(el.dataset.id));

                try {
                    const res = await fetch('/api/groups/reorder', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(groupIds)
                    });

                    if (res.ok) {
                        UI.showToast("分组顺序已保存 ✨");
                    } else {
                        const error = await res.json();
                        UI.showToast(error.detail || "保存排序失败", false);
                    }
                } catch (e) {
                    console.error("排序请求异常:", e);
                    UI.showToast("网络连接异常", false);
                }
            }
        });
    }
}

window.initSortable = initSortable;

async function checkUrlAccessibility(url, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.add('checking');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        await fetch(url, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);

        el.classList.remove('inactive');

        const img = el.querySelector('.icon-wrapper img');
        if (img && img.src.includes('default_error.jpg')) {
            img.src = getFaviconUrl(url);
        }

    } catch (err) {
        el.classList.add('inactive');

        const img = el.querySelector('.icon-wrapper img');
        if (img) {
            img.src = '/static/default_error.jpg';
        }
        console.warn(`健康检查失败 [${elementId}]: ${url}`);
    } finally {
        el.classList.remove('checking');
    }
}

function openModal() {
    const modal = document.getElementById('linkModal');
    if (!modal) return;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('linkModal');
    if (!modal) return;
    modal.style.display = 'none';
}

function openGroupModal() {
    const modal = document.getElementById('groupModal');
    if (!modal) return;
    modal.style.display = 'flex';
}

function closeGroupModal() {
    const modal = document.getElementById('groupModal');
    if (!modal) return;
    modal.style.display = 'none';
}

async function editGroupName(el, groupId) {
    const oldName = el.textContent.replace('公共', '').trim();
    const newName = await UI.prompt("重命名分组", oldName);

    if (newName === null || !newName || newName === oldName) return;

    try {
        await renameGroup(groupId, newName);
        UI.showToast("分组已重命名 ✨");
        renderLinks(document.getElementById('links-container'));
    } catch (e) {
        console.error(e);
        UI.showToast("重命名失败", false);
    }
}

async function confirmDelete(e, linkId) {
    e.stopPropagation();

    const ok = await UI.confirm("确认删除", "该链接删除后将无法找回", true);
    if (!ok) return;

    try {
        await deleteLink(linkId);
        UI.showToast("链接已安全移除 ✨");
        renderLinks(document.getElementById('links-container'));
    } catch {
        UI.showToast("删除失败", false);
    }
}

async function confirmDeleteGroup(groupId) {
    const ok = await UI.confirm("警告", "删除分组将同时删除其内部的所有链接！", true);
    if (!ok) return;

    try {
        await deleteGroup(groupId);
        UI.showToast("分组已彻底移除");
        renderLinks(document.getElementById('links-container'));
    } catch {
        UI.showToast("操作失败", false);
    }
}

const UI = {

    renderGuestUI() {
        const bg = document.getElementById('bg-layer');
        const zone = document.getElementById('auth-zone');
        if (!bg || !zone) return;

        bg.style.backgroundImage = `url('${DEFAULT_BG}')`;
        zone.innerHTML = `<button class="glass-btn" onclick="window.location.href='/login'">🔑 登录 / 注册</button>`;
    },

    renderUserUI(user) {
        const bg = document.getElementById('bg-layer');
        const zone = document.getElementById('auth-zone');
        if (!bg || !zone) return;

        bg.style.backgroundImage = `url('${user.custom_bg || DEFAULT_BG}')`;

        const hiddenStr = user.hidden_groups || "";
        const hiddenList = hiddenStr.split(',').filter(x => x.trim() !== "");
        const isPublicHidden = hiddenList.includes("1");

        zone.innerHTML = `
            <span class="user-info">👤 ${user.username}</span>
            ${isPublicHidden ? `<button class="glass-btn pulse-hint" onclick="toggleGroupVisibility(1)">👁️ 公共组</button>` : ''}
            <button class="glass-btn" onclick="document.getElementById('bg-input').click()">✨ 换背景</button>
            <button class="glass-btn" onclick="openGroupModal()">📁 建分组</button>
            <button class="glass-btn" onclick="window.openModal()">➕ 添链接</button>
            <button class="glass-btn" onclick="logout()">🚪 退出</button>
        `;
    },

    initSearch() {
        const selector = document.getElementById('engine-selector');
        const menu = document.getElementById('engine-dropdown');
        const input = document.getElementById('search-input');

        if (!selector || !menu) return;

        selector.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        };

        document.addEventListener('click', () => menu.classList.remove('active'));
    },

    setSearchEngine(key) {
        if (!ENGINES[key]) return;
        currentEngine = key;
        const logo = document.getElementById('current-engine-logo');
        const input = document.getElementById('search-input');

        if (logo) logo.src = ENGINES[key].logo;
        if (input) input.placeholder = `使用 ${ENGINES[key].name} 搜索...`;

        document.getElementById('engine-dropdown').classList.remove('active');
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            if (id === 'add-link-modal' && typeof window.resetAddLinkModal === 'function') {
                window.resetAddLinkModal();
            }
            modal.classList.add('active');
            if (id === 'add-link-modal') this.fillGroupSelect();
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
    },

    async fillGroupSelect() {
        const select = document.getElementById('modal-group-id');
        if (!select) return;

        const token = localStorage.getItem('onepanel_token');
        try {
            const res = await fetch('/api/groups/selectable', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });

            if (!res.ok) throw new Error("获取分组失败");
            const groups = await res.json();

            if (groups && groups.length > 0) {
                select.innerHTML = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
                select.value = groups[0].id;
            } else {
                select.innerHTML = '<option value="">请先创建分组</option>';
            }
        } catch (e) {
            console.error("填充选择框失败:", e);
            select.innerHTML = '<option value="">加载失败</option>';
        }
    },

    showToast(msg, isSuccess = true) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
        toast.innerHTML = `
            <span>${isSuccess ? '✨' : '⚠️'}</span>
            <span style="font-size: 14px; font-weight: 500;">${msg}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 1500);
    },

    confirm(title, message, isDanger = false) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-confirm-overlay';
            overlay.innerHTML = `
                <div class="custom-confirm-box">
                    <h3 style="margin:0 0 10px; color:#fff;">${title}</h3>
                    <p style="color:rgba(255,255,255,0.7); font-size:14px;">${message}</p>
                    <div class="confirm-btns">
                        <button class="btn-cancel" id="confirm-cancel">取消</button>
                        <button class="${isDanger ? 'btn-confirm-red' : 'btn-confirm-blue'}" id="confirm-ok">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            setTimeout(() => overlay.classList.add('confirm-active'), 10);

            const cleanup = (result) => {
                overlay.classList.remove('confirm-active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            overlay.querySelector('#confirm-cancel').onclick = () => cleanup(false);
            overlay.querySelector('#confirm-ok').onclick = () => cleanup(true);
        });
    },

    prompt(title, defaultValue = "") {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-confirm-overlay'; 
            overlay.innerHTML = `
                <div class="custom-confirm-box prompt-box">
                    <h3 style="margin:0 0 15px; color:#fff;">${title}</h3>
                    <div class="prompt-input-wrapper">
                        <input type="text" id="prompt-field" value="${defaultValue}" 
                               placeholder="请输入名称..." autocomplete="off">
                    </div>
                    <div class="confirm-btns">
                        <button class="btn-cancel" id="prompt-cancel">取消</button>
                        <button class="btn-confirm-blue" id="prompt-ok">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('#prompt-field');

            setTimeout(() => {
                overlay.classList.add('confirm-active');
                input.focus();
                input.select();
            }, 10);

            const cleanup = (val) => {
                overlay.classList.remove('confirm-active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(val);
                }, 300);
            };

            const handleOk = () => {
                const val = input.value.trim();
                if (val) cleanup(val);
                else UI.showToast("内容不能为空", false);
            };

            overlay.querySelector('#prompt-ok').onclick = handleOk;
            overlay.querySelector('#prompt-cancel').onclick = () => cleanup(null);

            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleOk();
                if (e.key === 'Escape') cleanup(null);
            };
        });
    }
};

window.renderGuestUI = () => UI.renderGuestUI();
window.renderUserUI = (user) => UI.renderUserUI(user);
window.setEngine = (e, key) => {
    e.stopPropagation();
    UI.setSearchEngine(key);
};
window.closeModal = () => UI.closeModal('add-link-modal');
window.closeGroupModal = () => UI.closeModal('add-group-modal');
window.openModal = () => UI.openModal('add-link-modal');
window.openGroupModal = () => UI.openModal('add-group-modal');


async function fillGroupSelect() {
    const select = document.getElementById('modal-group-id');

    if (!select) return;

    try {
        const token = localStorage.getItem('onepanel_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/groups/', { headers });
        const groups = await res.json();

        if (groups && Array.isArray(groups) && groups.length > 0) {
            select.innerHTML = groups.map(g =>
                `<option value="${g.id}">${g.name}</option>`
            ).join('');
        } else {
            select.innerHTML = `<option value="">请先创建分组</option>`;
        }
    } catch (e) {
        console.error("填充下拉框失败:", e);
        if (select) select.innerHTML = `<option value="">加载失败</option>`;
    }
}

document.getElementById('bg-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    document.getElementById('bg-layer').style.backgroundImage = `url('${previewUrl}')`;

    const token = localStorage.getItem('onepanel_token');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/user/background', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (!res.ok) throw new Error();

        UI.showToast("背景已更新 ✨");
    } catch {
        UI.showToast("背景上传失败", false);
    }
});

window.currentEditingLinkId = null;

function updateModalIconPreview(path) {
    const previewImg = document.getElementById('modal-icon-preview');
    const pathInput = document.getElementById('modal-icon-path');
    const finalPath = path || '/static/default_link.jpg';

    previewImg.src = finalPath;
    pathInput.value = path || '';
}

async function uploadIconFile(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (window.currentEditingLinkId) {
        formData.append('link_id', window.currentEditingLinkId);
    }

    try {
        const res = await fetch('/api/links/upload-icon', {
            method: 'POST',
            body: formData,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('onepanel_token')}` }
        });
        const data = await res.json();
        if (res.ok) {
            updateModalIconPreview(data.icon_url);
            UI.showToast('图标上传成功');
        } else {
            UI.showToast(data.detail || '上传失败', false);
        }
    } catch (e) {
        UI.showToast('服务器连接失败', false);
    } finally {
        input.value = '';
    }
}

async function downloadIconFromUrl() {
    const url = document.getElementById('modal-icon-input').value;
    if (!url) return UI.showToast('请先输入图标 URL', false);

    const formData = new FormData();
    formData.append('url', url);
    if (window.currentEditingLinkId) {
        formData.append('link_id', window.currentEditingLinkId);
    }

    try {
        const res = await fetch('/api/links/download-icon', {
            method: 'POST',
            body: formData,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('onepanel_token')}` }
        });
        const data = await res.json();
        if (res.ok) {
            updateModalIconPreview(data.icon_url);
            UI.showToast('抓取成功并已保存');
        } else {
            UI.showToast(data.detail || '抓取失败', false);
        }
    } catch (e) {
        UI.showToast('网络请求异常', false);
    }
}

function resetIcon() {
    updateModalIconPreview(null);
    document.getElementById('modal-icon-input').value = '';
    UI.showToast('已重置为默认获取');
}

function autoFetchIcon(siteUrl) {
    const pathInput = document.getElementById('modal-icon-path');
    const previewImg = document.getElementById('modal-icon-preview');
    if (!pathInput.value && siteUrl) {
        previewImg.src = getFaviconUrl(siteUrl);
    }
}

function handleUrlBlur(url) {
    const pathInput = document.getElementById('modal-icon-path');
    const previewImg = document.getElementById('modal-icon-preview');

    if (url && !pathInput.value) {
        previewImg.src = getFaviconUrl(url);
        previewImg.style.transform = 'scale(1.1)';
        setTimeout(() => {
            previewImg.style.transform = 'scale(1)';
        }, 200);
    }
}

function closeModal() {
    document.getElementById('add-link-modal').classList.remove('active');
    window.currentEditingLinkId = null;
    updateModalIconPreview(null);
    document.getElementById('modal-icon-input').value = '';
    if (typeof window.setLinkModalMode === 'function') {
        window.setLinkModalMode(false);
    }
}

async function openEditLinkModal(link) {
    if (!link) return;

    if (typeof UI.fillGroupSelect === 'function') {
        await UI.fillGroupSelect();
    }

    window.currentEditingLinkId = link.id;
    document.getElementById('modal-link-title').value = link.title || '';
    document.getElementById('modal-link-url').value = link.url || '';
    document.getElementById('modal-group-id').value = String(link.group_id);
    document.getElementById('modal-icon-input').value = '';

    if (link.icon) {
        updateModalIconPreview(link.icon);
    } else {
        updateModalIconPreview(null);
        autoFetchIcon(link.url);
    }

    if (typeof window.setLinkModalMode === 'function') {
        window.setLinkModalMode(true);
    }

    document.getElementById('add-link-modal').classList.add('active');
}

function openEditLinkModalById(event, linkId) {
    event.stopPropagation();
    event.preventDefault();
    openEditLinkModal(window.linkRegistry?.[linkId]);
}

function logout() {
    localStorage.removeItem('onepanel_token');
    window.location.reload();
}

window.openEditLinkModalById = openEditLinkModalById;
window.openEditLinkModal = openEditLinkModal;
