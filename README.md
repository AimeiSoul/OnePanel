# OnePanel

> 简洁、可定制、可自托管的导航面板

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![SQLite](https://img.shields.io/badge/SQLite-Database-lightgrey)
![License](https://img.shields.io/badge/License-MIT-orange)

---

## 📖 项目简介

OnePanel 是一个基于 **FastAPI + SQLite + 原生前端** 构建的轻量级导航面板系统，支持：

---

### 👤 用户端功能

普通用户可进行以下操作：

* 🔐 用户注册 / 登录 / JWT 认证
* 🖼 自定义背景图
* 🗂 创建与管理个人分组
* 🔗 创建、编辑、删除个人链接
* 👀 访客模式（未登录可浏览公共分组）
* ⚡ 轻量快速响应
* 🗄 本地 SQLite 存储，无需额外数据库

---

### 🛠 管理端功能

管理员拥有全局控制权限，包括：

* 🔐 管理员登录认证
* ⚙ 基础系统设置管理
* 🔓 注册开关控制（可关闭用户注册）
* 🔍 链接合规性检测
* 👥 用户管理（启用 / 禁用 / 管理用户）
* 🗂 全局分组与链接管理
* 💻 自定义代码注入（扩展页面功能）
* 🗄 数据统一管理

---

### 🎯 适用场景

* 个人导航主页
* 内网导航面板
* 服务器快捷入口
* 自托管个人仪表盘
* 小型团队内部链接管理

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

| 类型   | 技术                 |
| ---- | ------------------ |
| 后端   | FastAPI            |
| 数据库  | SQLite             |
| ORM  | SQLAlchemy         |
| 认证   | JWT                |
| 密码加密 | Passlib            |
| 前端   | 原生 HTML + CSS + JS |

---

## 🚀 快速开始

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

建议配合：

* Nginx 反向代理
* HTTPS（Let’s Encrypt）
* Docker 部署（后续工作）


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
