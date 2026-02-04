document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', document.getElementById('username').value);
    formData.append('password', document.getElementById('password').value);

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            body: formData // OAuth2PasswordRequestForm 接收 Form 表单数据
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('onepanel_token', data.access_token);
            window.location.href = '/'; // 登录成功跳转首页
        } else {
            alert("用户名或密码错误");
        }
    } catch (err) {
        alert("服务器连接失败");
    }
});