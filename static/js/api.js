async function fetchGroups() {
    const token = localStorage.getItem('onepanel_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const res = await fetch('/api/groups/', { headers });

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`请求失败: ${res.status}`, errorText);
        throw new Error("无法从服务器获取分组数据");
    }
    return await res.json();
}

async function toggleGroupVisibility(groupId) {
    const token = localStorage.getItem('onepanel_token');
    const gIdStr = groupId.toString();

    try {
        const res = await fetch('/api/user/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        let hiddenArr = (user.hidden_groups || "").split(',').filter(Boolean);
        const isHiding = !hiddenArr.includes(gIdStr);

        if (isHiding) {
            hiddenArr.push(gIdStr);
        } else {
            hiddenArr = hiddenArr.filter(id => id !== gIdStr);
        }

        const newHiddenStr = hiddenArr.join(',');

        const updateRes = await fetch('/api/user/me', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hidden_groups: newHiddenStr })
        });

        if (updateRes.ok) {
            user.hidden_groups = newHiddenStr;
            localStorage.setItem('onepanel_user', JSON.stringify(user));

            if (isHiding) {
                UI.showToast("公共分组已隐藏");

                const groupEl = document.querySelector(`.group-section[data-id="${groupId}"]`);
                if (groupEl) {
                    groupEl.style.transition = "all 0.5s ease";
                    groupEl.style.opacity = "0";
                    groupEl.style.transform = "scale(0.9)";
                    setTimeout(() => groupEl.remove(), 400);
                }

                UI.renderUserUI(user);

            } else {
                UI.showToast("公共分组已恢复显示");
                setTimeout(() => location.reload(), 800);
                return;
            }
            UI.renderUserUI(user);
        }
    } catch (e) {
        console.error("切换可见性失败:", e);
    }
}

async function createLink(data) {
    const token = localStorage.getItem('onepanel_token');

    const res = await fetch('/api/links/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error("创建链接失败");
    return await res.json();
}

async function deleteLink(linkId) {
    const token = localStorage.getItem('onepanel_token');

    const res = await fetch(`/api/links/${linkId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("删除失败");
}

async function renameGroup(groupId, newName) {
    const token = localStorage.getItem('onepanel_token');

    const url = `/api/groups/${groupId}?name=${encodeURIComponent(newName)}`;

    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        const errorData = await res.json();
        console.error("后端返回 422 详情:", errorData.detail);
        throw new Error("更新失败");
    }

    return await res.json();
}

async function deleteGroup(groupId) {
    const token = localStorage.getItem('onepanel_token');

    const res = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("删除分组失败");
}

async function hideGroup(groupId) {
    await toggleGroupVisibility(groupId);
}
