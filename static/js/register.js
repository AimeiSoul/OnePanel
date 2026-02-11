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

    btn.innerText = "正在同步数据...";
    btn.disabled = true;

    try {
        const regRes = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!regRes.ok) {
            const err = await regRes.json();
            throw new Error(err.detail || "注册失败");
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
            window.location.href = "/"; 
        } else {
            window.location.href = "/login";
        }

    } catch (err) {
        alert(err.message);
        btn.innerText = "完成注册";
        btn.disabled = false;
    }
});