const passwordInput = document.getElementById('reg-password');
const confirmInput = document.getElementById('confirm-password');
const regForm = document.getElementById('register-form');
const regBtn = document.querySelector('.reg-btn');

regBtn.disabled = true;

function togglePassword(id, el) {
    const input = document.getElementById(id);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    const eyeOpen = el.querySelectorAll('.eye-open');
    const eyeClosed = el.querySelectorAll('.eye-closed');

    if (isPassword) {
        eyeOpen.forEach(p => p.style.display = 'block');
        eyeClosed.forEach(p => p.style.display = 'none');
        el.style.color = "var(--primary-color)";
    } else {
        eyeOpen.forEach(p => p.style.display = 'none');
        eyeClosed.forEach(p => p.style.display = 'block');
        el.style.color = "rgba(255, 255, 255, 0.5)";
    }
}
function validatePassword() {
    const pwd = passwordInput.value;
    const cpwd = confirmInput.value;

    const isLengthValid = pwd.length >= 8;

    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const typesCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    const isComplexValid = typesCount >= 3;

    const isMatchValid = pwd === cpwd && cpwd !== "";

    updateIndicator('rule-length', isLengthValid);
    updateIndicator('rule-complex', isComplexValid);
    updateIndicator('rule-match', isMatchValid);

    const allValid = isLengthValid && isComplexValid && isMatchValid;
    regBtn.disabled = !allValid;
    regBtn.style.opacity = allValid ? "1" : "0.5";
    regBtn.style.cursor = allValid ? "pointer" : "not-allowed";
}

function updateIndicator(id, isValid) {
    const el = document.getElementById(id);
    if (!el) return;

    const baseText = {
        'rule-length': '至少 8 位字符',
        'rule-complex': '复杂度 (大小写/数字/符号 4选3)',
        'rule-match': '两次密码一致'
    };

    el.innerHTML = `${isValid ? '√' : '❌'} ${baseText[id]}`;
    el.style.color = isValid ? '#00ffcc' : '#ff4d4d';
}

passwordInput.addEventListener('input', validatePassword);
confirmInput.addEventListener('input', validatePassword);

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const btn = e.target.querySelector('button');
    const errorMsg = document.getElementById('reg-error');

    errorMsg.style.opacity = '0';
    btn.innerText = "正在同步数据...";
    btn.disabled = true;

    const showError = (text) => {
        errorMsg.innerText = text;
        errorMsg.style.opacity = '1';
        btn.innerText = "完成注册";
        btn.disabled = false;
        errorMsg.style.transform = 'translateX(5px)';
        setTimeout(() => errorMsg.style.transform = 'translateX(0)', 100);
    };

    try {
        const regRes = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!regRes.ok) {
            const err = await regRes.json();
            if (regRes.status === 403) {
                showError("注册功能目前已关闭 🔐");
            } else {
                showError(err.detail || "注册失败，请稍后再试");
            }
            return;
        }

        btn.innerText = "正在为您自动登录...";
        const loginData = new URLSearchParams();
        loginData.append('username', username);
        loginData.append('password', password);

        const loginRes = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: loginData
        });

        if (loginRes.ok) {
            const data = await loginRes.json();
            localStorage.setItem('onepanel_token', data.access_token);
            btn.innerText = "欢迎加入！跳转中...";
            setTimeout(() => { window.location.href = "/"; }, 500);
        } else {
            showError("自动登录失败，请手动登陆");
        }

    } catch (err) {
        showError("连接异常，请确保服务已启动");
        console.error("Register Error:", err);
    }
});