async function loadSettings() {
    try {
        const response = await fetch('/api/system/config');
        const config = await response.json();

        if (config.site_title) {
            document.title = config.site_title;
        }

        window.CONFIG_FAVICON_API = config.favicon_api || "https://favicon.cccyun.cc/${hostname}";

    } catch (error) {
        console.error("加载配置失败:", error);
        window.CONFIG_FAVICON_API = "https://favicon.cccyun.cc/${hostname}";
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
});

function injectCustomCode(config) {
    if (config.custom_styles && config.custom_styles.trim() !== "") {
        let styleTag = document.getElementById('onepanel-custom-css');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'onepanel-custom-css';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = config.custom_styles;
        console.log("🎨 Custom CSS injected.");
    }

    if (config.custom_scripts && config.custom_scripts.trim() !== "") {
        let scriptTag = document.getElementById('onepanel-custom-js');
        if (!scriptTag) {
            scriptTag = document.createElement('script');
            scriptTag.id = 'onepanel-custom-js';
            scriptTag.defer = true; 
            document.body.appendChild(scriptTag);
        }
        scriptTag.textContent = config.custom_scripts;
        console.log("⚡ Custom JS injected.");
    }
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
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (res.ok) {
            UI.showToast("背景保存成功 ✨");
        }
    } catch (err) {
        UI.showToast("背景上传失败", false);
    }
}

async function initPage() {
    startClock();
    UI.initSearch();

    const token = localStorage.getItem('onepanel_token');

    const statusRes = await fetch('/api/system/status');
    const status = await statusRes.json();
    if (!status.is_initialized) return location.href = '/init';

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

            if (config.site_title) document.title = config.site_title;
            window.CONFIG_FAVICON_API = config.favicon_api;
        }
    } catch (e) {
        console.warn("无法加载系统配置，使用默认设置");
    }

    if (token) {
        try {
            const userRes = await fetch('/api/user/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (userRes.ok) {
                const user = await userRes.json();
                renderUserUI(user); 
            } else {
                renderGuestUI();
            }
        } catch (e) { renderGuestUI(); }
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
        if (q) window.open(ENGINES[currentEngine].url + encodeURIComponent(q));
    }
}

async function submitAddLink(e) {
    e.preventDefault();
    const data = {
        title: document.getElementById('modal-link-title').value,
        url: document.getElementById('modal-link-url').value,
        group_id: parseInt(document.getElementById('modal-group-id').value)
    };

    const res = await fetch('/api/links/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('onepanel_token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        UI.showToast("添加成功 ✨");
        UI.closeModal('add-link-modal');
        renderLinks();
    }
}

async function submitAddGroup(e) {
    e.preventDefault();
    const name = document.getElementById('modal-group-name').value;
    const token = localStorage.getItem('onepanel_token');

    const res = await fetch(`/api/groups/?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
        UI.showToast("分组创建成功 📁");
        UI.closeModal('add-group-modal');
        renderLinks();
    }
}

window.handleBackgroundUpload = handleBackgroundUpload;
window.handleSearch = handleSearch;
window.submitAddLink = submitAddLink;
window.submitAddGroup = submitAddGroup;
document.addEventListener('DOMContentLoaded', initPage);