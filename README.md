# OnePanel

> 简洁、可定制、可自托管的导航面板

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![SQLite](https://img.shields.io/badge/SQLite-Database-lightgrey)
![License](https://img.shields.io/badge/License-MIT-orange)

---

# 📖 项目简介

OnePanel 是一个基于 **FastAPI + SQLite + 原生前端** 构建的轻量级导航面板系统。

无需 MySQL，无需 Redis，开箱即用。

适合：

* 个人导航主页
* 内网快捷导航
* 小团队链接管理

---

### 👤 用户端功能

普通用户可进行以下操作：

* 🔐 注册 / 登录 / JWT 认证
* 🖼 自定义背景
* 🗂 分组管理
* 🔗 链接管理
* 👀 访客模式
* ⚡ 极轻量响应
* 🗄 SQLite 本地存储

---

### 🛠 管理端功能

管理员拥有全局控制权限，包括：

* 🔐 管理员认证
* ⚙ 系统设置
* 🔓 注册开关
* 👥 用户管理
* 🗂 全局链接查看
* 💻 自定义代码注入
* 🔍 链接合法性检测
* 🖼 全局背景管理


---

## 🏗 项目结构

```
OnePanel/
├── app/
│   ├── api/                # 路由分发
│   │   ├── auth.py         # 登录、注册、JWT
│   │   ├── admin.py        # 后台管理接口
│   │   ├── deps.py         # 依赖注入
│   │   ├── init.py         # 初始化接口
│   │   ├── group.py        # 分组接口
│   │   └── links.py        # 链接接口
│   ├── core/               # 核心配置
│   │   ├── config.py       # 环境变量 & 全局配置
│   │   ├── crawler.py      # 抓取 http_title
│   │   └── security.py     # 密码哈希 & JWT
│   ├── schemas/            # 请求 / 响应模型
│   │   ├── link.py
│   │   └── user.py
│   ├── main.py             # 程序入口
│   ├── models.py           # 数据库模型
│   └── database.py         # 数据库配置
│
├── static/                 # 前端资源
│   ├── css/
│   ├── js/
│   ├── *.html
│   ├── default_bg.jpg
│   ├── default_link.jpg
│   ├── logo.svg
│   ├── user_uploads/
│   └── icons/
│
└── data/
    └── onepanel.db         # SQLite 数据库
```

---

## ⚙️ 技术栈

| 类型  | 技术              |
| --- | --------------- |
| 后端  | FastAPI         |
| ORM | SQLAlchemy      |
| 数据库 | SQLite          |
| 认证  | JWT             |
| 加密  | Passlib         |
| 前端  | HTML + CSS + JS |

---

# 🚀 一键安装脚本部署（推荐）


国际可直接执行：

```bash
bash <(curl -sL https://raw.githubusercontent.com/AimeiSoul/OnePanel/main/install.sh)
```

国内：

```bash
bash <(curl -sL https://gitee.com/aimeisoul/onepanel/raw/main/install.sh)
```

---

## 🚀 源码部署

### 1️⃣ 克隆项目

```bash
git clone https://github.com/AimeiSoul/OnePanel.git
cd OnePanel
```

---

### 2️⃣ 创建虚拟环境

```bash
python -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

---

### 3️⃣ 安装依赖

```bash
pip install -r requirements.txt
```

---

### 4️⃣ 启动服务

```bash
uvicorn app.main:app --reload
```

默认访问地址：

```
http://127.0.0.1:8000
```

---

## 🔧 初始化流程

首次启动后：

1. 打开 `http://127.0.0.1:8000/` 会跳转到init界面
2. 创建初始管理员账号
3. 开始添加分组和链接
4. 打开管理后台 `http://127.0.0.1:8000/admin` 管理基本设置

---

## 🔐 认证机制

* 使用 JWT 进行身份验证
* 密码使用 bcrypt 哈希加密
* 接口通过依赖注入进行权限控制

---

## 🌐 功能特性

### 🔗 链接管理

* 添加 / 删除链接
* 上传 / 下载 / API 缩略图支持
* 自定义排序

### 🗂 分组管理

* 自定义分组
* 自定义排序
* 可隐藏公共分组

### 👤 用户系统

* 注册
* 登录
* 管理员权限

### 🖼 背景管理

* 默认背景（管理端可以更换全员背景）
* 用户自定义上传（优先于全局背景）
* 存储于 `static/user_uploads/`

---

## 📦 部署建议

### 生产环境推荐：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 可通过systemd 守护运行（推荐）

创建：

```
/etc/systemd/system/onepanel.service
```

内容：

```ini
[Unit]
Description=OnePanel
After=network.target

[Service]
User=root
WorkingDirectory=/opt/OnePanel
ExecStart=/opt/OnePanel/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

然后：

```bash
systemctl daemon-reload
systemctl enable onepanel
systemctl start onepanel
```

---

### 建议配合：

* Nginx 反向代理
* HTTPS（Let’s Encrypt）

---


## 🤝 贡献

欢迎提交 Issue 或 Pull Request。

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！

---

## 📄 License

MIT License

---

## 👤 作者

**AimeiSoul**

GitHub: [https://github.com/AimeiSoul](https://github.com/AimeiSoul)