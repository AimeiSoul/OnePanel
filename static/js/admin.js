async function checkAdminAuth() {
    const token = localStorage.getItem('onepanel_token');
    
    // 如果本地压根没 token，直接去 admin 登录页
    if (!token) {
        window.location.href = '/static/admin_login.html';
        return;
    }

    const res = await fetch('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        // 如果后端发现你不是管理员，踢回 admin 登录页并清除 token
        localStorage.removeItem('onepanel_token');
        window.location.href = '/static/admin_login.html';
    }
}


function adminLogout() {
    // 1. 清除所有管理相关的本地存储
    localStorage.removeItem('onepanel_token');
    localStorage.removeItem('is_admin');
    
    // 2. 这里的提示可以做得酷炫一点
    const mainContent = document.querySelector('.admin-main');
    if (mainContent) {
        mainContent.style.transition = '0.5s';
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'scale(0.95)';
    }

    // 3. 延迟一小会儿跳转，让用户感觉到“会话正在销毁”
    setTimeout(() => {
        // 跳转回专门的管理员登录页
        window.location.href = '/static/admin_login.html';
    }, 500);
}

// 1. Tab 切换逻辑
function switchTab(tabId) {
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if(tabId === 'users') loadUsers();
    if(tabId === 'settings') loadConfig();
}

// 2. 加载用户列表
async function loadUsers() {
    const token = localStorage.getItem('onepanel_token');
    const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const users = await res.json();
    const body = document.getElementById('user-list-body');
    body.innerHTML = users.map(u => `
        <tr>
            <td>${u.username}</td>
            <td><span class="role-badge">${u.is_admin ? '超级管理员' : '普通用户'}</span></td>
            <td><span style="color: #00b894;">● 正常</span></td>
            <td>
                <button class="admin-btn" style="padding: 5px 12px; font-size: 12px; background: rgba(255,255,255,0.1);">管理</button>
            </td>
        </tr>
    `).join('');
}

function renderUserRow(u) {
    const roleClass = u.is_admin ? 'role-badge admin' : 'role-badge';
    const roleName = u.is_admin ? 'SUPER ADMIN' : 'USER';
    
    return `
        <tr>
            <td style="font-weight: 600; letter-spacing: 0.5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(45deg, var(--admin-primary), var(--admin-secondary)); display: flex; align-items: center; justify-content: center; font-size: 12px;">
                        ${u.username.charAt(0).toUpperCase()}
                    </div>
                    ${u.username}
                </div>
            </td>
            <td><span class="${roleClass}">${roleName}</span></td>
            <td>
                <span class="status-dot" style="color: #00b894; background-color: #00b894;"></span>
                <span style="font-size: 0.85rem; color: #00b894;">ACTIVE</span>
            </td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="admin-btn" style="padding: 6px 12px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">编辑</button>
                    <button class="admin-btn" style="padding: 6px 12px; font-size: 11px; background: rgba(255, 71, 87, 0.1); color: var(--admin-danger); border: 1px solid rgba(255, 71, 87, 0.2);">禁用</button>
                </div>
            </td>
        </tr>
    `;
}

// 3. 加载并更新系统配置
async function loadConfig() {
    const token = localStorage.getItem('onepanel_token');
    const res = await fetch('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const config = await res.json();
    document.getElementById('reg-switch').checked = config.registration_open;
}

async function updateRegStatus(isOpen) {
    const token = localStorage.getItem('onepanel_token');
    await fetch(`/api/admin/config/registration?open=${isOpen}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    // 可以加一个轻提示
}


// 页面加载
checkAdminAuth();