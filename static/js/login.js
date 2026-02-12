document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
    const errorDiv = document.getElementById('error-msg');

    if (!btn) {
        console.error("找不到登录按钮！请检查 HTML 结构");
        return;
    }

    btn.disabled = true;
    const originalBtnText = btn.innerText;
    btn.innerText = '正在验证...';

    const formData = new FormData();
    formData.append('username', document.getElementById('username').value);
    formData.append('password', document.getElementById('password').value);

    const showError = (msg) => {
        errorDiv.innerText = msg;
        errorDiv.style.opacity = '1';
        btn.disabled = false;
        btn.innerText = originalBtnText;
    };

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            btn.innerText = '正在同步...';
            localStorage.removeItem('onepanel_token');
            localStorage.setItem('onepanel_token', data.access_token);
            setTimeout(() => {
                window.location.href = '/';
            }, 100);
        } else if (res.status === 403) {
            showError("该账户已被封禁，请联系管理员 🚫");
        } else {
            showError("用户名或密码错误");
        }
    } catch (err) {
        showError("服务器连接失败，请检查网络");
        console.error("Login Error:", err);
    }
});