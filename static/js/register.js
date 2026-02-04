/**
 * 注册页面交互逻辑
 */

const passwordInput = document.getElementById('reg-password');
const confirmInput = document.getElementById('confirm-password');
const regForm = document.getElementById('register-form');
const regBtn = document.querySelector('.reg-btn');

// 初始状态禁用按钮
regBtn.disabled = true;

// 1. 显隐切换
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
// 2. 实时校验密码复杂度
function validatePassword() {
    const pwd = passwordInput.value;
    const cpwd = confirmInput.value;

    // 1. 长度校验
    const isLengthValid = pwd.length >= 8;

    // 2. 4选3复杂度校验
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const typesCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    const isComplexValid = typesCount >= 3;

    // 3. 两次输入一致校验
    const isMatchValid = pwd === cpwd && cpwd !== "";

    // 更新 UI 指示器
    updateIndicator('rule-length', isLengthValid);
    updateIndicator('rule-complex', isComplexValid);
    updateIndicator('rule-match', isMatchValid);

    // 控制提交按钮状态
    const allValid = isLengthValid && isComplexValid && isMatchValid;
    regBtn.disabled = !allValid;
    regBtn.style.opacity = allValid ? "1" : "0.5";
    regBtn.style.cursor = allValid ? "pointer" : "not-allowed";
}

/**
 * 更新规则状态文字与图标
 */
function updateIndicator(id, isValid) {
    const el = document.getElementById(id);
    if (!el) return;

    const baseText = {
        'rule-length': '至少 8 位字符',
        'rule-complex': '复杂度 (大小写/数字/符号 4选3)',
        'rule-match': '两次密码一致'
    };

    el.innerHTML = `${isValid ? '√' : '❌'} ${baseText[id]}`;
    el.style.color = isValid ? '#00ffcc' : '#ff4d4d'; // 天依绿 vs 警示红
}

// 绑定输入事件
passwordInput.addEventListener('input', validatePassword);
confirmInput.addEventListener('input', validatePassword);

// 3. 提交与自动登录
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const btn = e.target.querySelector('button');

    btn.innerText = "正在同步数据...";
    btn.disabled = true;

    try {
        // 第一步：注册
        const regRes = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!regRes.ok) {
            const err = await regRes.json();
            throw new Error(err.detail || "注册失败");
        }

        // 第二步：注册成功后立即执行登录，获取 Token
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
            window.location.href = "/"; // 丝滑进入首页
        } else {
            // 如果自动登录失败（极少见），则回退到登录页
            window.location.href = "/static/login.html";
        }

    } catch (err) {
        alert(err.message);
        btn.innerText = "完成注册";
        btn.disabled = false;
    }
});