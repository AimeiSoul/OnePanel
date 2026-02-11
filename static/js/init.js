document.getElementById('init-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    btn.innerText = '正在初始化系统...';
    btn.disabled = true;

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
            alert('初始化失败: ' + (err.detail || '未知原因'));
            btn.innerText = '重新初始化';
            btn.disabled = false;
        }
    } catch (e) {
        alert('连接异常，请确保后端服务已启动');
        btn.disabled = false;
    }
});