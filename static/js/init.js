document.getElementById('init-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;

    const originalText = '立即初始化';

    btn.innerText = '正在初始化系统...';
    btn.disabled = true;
    btn.classList.remove('btn-error');

    try {
        const initRes = await fetch(`/api/system/init?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, {
            method: 'POST'
        });

        if (initRes.ok) {
            btn.innerText = '激活成功，正在同步空间...';

            const loginData = new URLSearchParams();
            loginData.append('username', u);
            loginData.append('password', p);

            const loginRes = await fetch('/api/login', {
                method: 'POST',
                body: loginData
            });

            if (loginRes.ok) {
                const data = await loginRes.json();
                localStorage.setItem('onepanel_token', data.access_token);
                window.location.href = '/';
            } else {
                window.location.href = '/login';
            }
        } else {
            const err = await initRes.json();
            btn.innerText = '初始化失败 (查看控制台)';
            console.error('【系统初始化错误】:', err.detail || err);
            setTimeout(() => {
                btn.innerText = originalText;
                btn.disabled = false;
                btn.classList.remove('btn-error');
            }, 3000);
        }
    } catch (e) {
        btn.innerText = '连接超时';
        btn.classList.add('btn-error');
        console.error('【网络连接异常】:', e);

        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
            btn.classList.remove('btn-error');
        }, 3000);
    }
});