async function loadSettings() {
    try {
        const response = await fetch('/api/system/config');
        const config = await response.json();

        if (config.site_title) {
            document.title = config.site_title;
        }

        window.CONFIG_FAVICON_API = config.favicon_api || "https://favicon.cccyun.cc/${hostname}";
    } catch (error) {
        console.error('加载配置失败:', error);
        window.CONFIG_FAVICON_API = "https://favicon.cccyun.cc/${hostname}";
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
});

function injectCustomCode(config) {
    if (config.custom_styles && config.custom_styles.trim() !== '') {
        let styleTag = document.getElementById('onepanel-custom-css');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'onepanel-custom-css';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = config.custom_styles;
    }

    if (config.custom_scripts && config.custom_scripts.trim() !== '') {
        let scriptTag = document.getElementById('onepanel-custom-js');
        if (!scriptTag) {
            scriptTag = document.createElement('script');
            scriptTag.id = 'onepanel-custom-js';
            scriptTag.defer = true;
            document.body.appendChild(scriptTag);
        }
        scriptTag.textContent = config.custom_scripts;
    }
}

function getLinkModalMeta() {
    return {
        title: document.getElementById('link-modal-title'),
        desc: document.getElementById('link-modal-desc'),
        submit: document.getElementById('link-modal-submit'),
    };
}

function setLinkModalMode(isEdit) {
    const meta = getLinkModalMeta();
    if (!meta.title || !meta.desc || !meta.submit) return;

    meta.title.textContent = isEdit ? '编辑链接' : '添加新导航';
    meta.desc.textContent = isEdit ? '更新标题、地址、图标和所属分组' : '链接将存放在您选择的分组中';
    meta.submit.textContent = isEdit ? '保存修改' : '确认保存';
}

async function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    const bgLayer = document.getElementById('bg-layer');
    if (bgLayer) bgLayer.style.backgroundImage = `url('${previewUrl}')`;

    const token = localStorage.getItem('onepanel_token');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload-bg', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (res.ok) {
            UI.showToast('背景保存成功 ✨');
        } else {
            UI.showToast('背景上传失败', false);
        }
    } catch (err) {
        UI.showToast('背景上传失败', false);
    }
}

async function initPage() {
    startClock();
    UI.initSearch();

    const token = localStorage.getItem('onepanel_token');

    const statusRes = await fetch('/api/system/status');
    const status = await statusRes.json();
    if (!status.is_initialized) {
        location.href = '/init';
        return;
    }

    try {
        const configRes = await fetch('/api/system/config');
        if (configRes.ok) {
            const config = await configRes.json();

            if (config.custom_styles) {
                const styleTag = document.createElement('style');
                styleTag.id = 'onepanel-custom-css';
                styleTag.textContent = config.custom_styles;
                document.head.appendChild(styleTag);
            }

            if (config.custom_scripts) {
                const scriptTag = document.createElement('script');
                scriptTag.id = 'onepanel-custom-js';
                scriptTag.textContent = config.custom_scripts;
                document.body.appendChild(scriptTag);
            }

            if (config.site_title) {
                document.title = config.site_title;
            }
            window.CONFIG_FAVICON_API = config.favicon_api || window.CONFIG_FAVICON_API;
        }
    } catch (e) {
        console.warn('无法加载系统配置，使用默认设置');
    }

    if (token) {
        try {
            const userRes = await fetch('/api/user/me', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (userRes.ok) {
                const user = await userRes.json();
                renderUserUI(user);
            } else {
                renderGuestUI();
            }
        } catch (e) {
            renderGuestUI();
        }
    } else {
        renderGuestUI();
    }

    if (typeof renderLinks === 'function') {
        renderLinks();
    }

    const bgInput = document.getElementById('bg-input');
    if (bgInput) {
        bgInput.onchange = handleBackgroundUpload;
    }
}

function handleSearch(e) {
    if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) {
            window.open(ENGINES[currentEngine].url + encodeURIComponent(q));
        }
    }
}

function resetAddLinkModal() {
    document.getElementById('modal-link-title').value = '';
    document.getElementById('modal-link-url').value = '';
    document.getElementById('modal-icon-input').value = '';
    document.getElementById('modal-icon-path').value = '';
    document.getElementById('modal-icon-preview').src = '/static/default_link.jpg';
    document.getElementById('icon-file-hidden').value = '';
    window.currentEditingLinkId = null;
    setLinkModalMode(false);
}

window.resetAddLinkModal = resetAddLinkModal;

async function submitAddLink(e) {
    e.preventDefault();

    const data = {
        title: document.getElementById('modal-link-title').value.trim(),
        url: document.getElementById('modal-link-url').value.trim(),
        group_id: parseInt(document.getElementById('modal-group-id').value, 10),
        icon: document.getElementById('modal-icon-path').value || '',
    };

    try {
        if (window.currentEditingLinkId) {
            await updateLink(window.currentEditingLinkId, data);
            UI.showToast('修改成功 ✨');
        } else {
            await createLink(data);
            UI.showToast('添加成功 ✨');
        }

        resetAddLinkModal();
        UI.closeModal('add-link-modal');
        renderLinks();
    } catch (error) {
        console.error(error);
        UI.showToast(window.currentEditingLinkId ? '修改失败' : '添加失败', false);
    }
}

async function submitAddGroup(e) {
    e.preventDefault();
    const name = document.getElementById('modal-group-name').value.trim();
    const token = localStorage.getItem('onepanel_token');

    const res = await fetch(`/api/groups/?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
        UI.showToast('分组创建成功 📁');
        UI.closeModal('add-group-modal');
        renderLinks();
    } else {
        UI.showToast('分组创建失败', false);
    }
}

window.handleBackgroundUpload = handleBackgroundUpload;
window.handleSearch = handleSearch;
window.submitAddLink = submitAddLink;
window.submitAddGroup = submitAddGroup;
window.setLinkModalMode = setLinkModalMode;
document.addEventListener('DOMContentLoaded', initPage);
