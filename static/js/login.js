document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', document.getElementById('username').value);
    formData.append('password', document.getElementById('password').value);

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            body: formData 
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.removeItem('onepanel_token');
            localStorage.setItem('onepanel_token', data.access_token);
            setTimeout(() => {
                window.location.href = '/';
            }, 100);
        } else if (res.status === 403) {
            alert("该账户已被封禁，请联系管理员 🚫");
        } else {
            alert("用户名或密码错误");
        }
    } catch (err) {
        alert("服务器连接失败");
    }
});