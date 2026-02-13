#!/bin/bash
set -e

APP_NAME="onepanel"
APP_DIR="/opt"
CLI_PATH="/usr/local/bin/op"
FIN_DIR="$APP_DIR/OnePanel"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="/var/log/onepanel-install.log"
PORT=8000
USE_CN=0

# 彩色输出
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"

pause() {
    echo ""
    read -p "按回车键继续..." temp
}

error_exit() {
    err "$1"
    echo ""
    read -p "按回车键返回主菜单..." temp
    return
}

info() { echo -e "${BLUE}[INFO]${RESET} $1" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}[OK]${RESET} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $1" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[ERROR]${RESET} $1" | tee -a "$LOG_FILE"; }

############################################
# 检查 root
############################################
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 或 sudo 运行"
    exit 1
fi

mkdir -p "$(dirname $LOG_FILE)"
touch "$LOG_FILE"

############################################
# 获取最新 release 下载 URL
############################################
install_jq() {
    if ! command -v jq >/dev/null 2>&1; then
        info "检测到 jq 未安装，正在安装..."
        if command -v apt >/dev/null 2>&1; then
            apt update -y >>"$LOG_FILE" 2>&1
            apt install -y jq >>"$LOG_FILE" 2>&1
        elif command -v yum >/dev/null 2>&1; then
            yum makecache -y >>"$LOG_FILE" 2>&1
            yum install -y jq >>"$LOG_FILE" 2>&1
        else
            err "无法安装 jq，请手动安装"
            exit 1
        fi
        ok "jq 安装完成"
    fi
}

install_jq

get_latest_release_url() {
    DOWNLOAD_URL=""
    if curl -s --connect-timeout 5 https://github.com >/dev/null; then
        USE_CN=0
        DOWNLOAD_URL="https://github.com/AimeiSoul/OnePanel/releases/latest/download/OnePanel.tar"
        echo "[INFO] 使用 GitHub 下载最新 release" >>"$LOG_FILE"
    else
        USE_CN=1
        LATEST_TAG=$(curl -s https://gitee.com/api/v5/repos/aimeisoul/onepanel/tags \
            | jq -r '.[].name' | sort -V | tail -1)
        if [ -z "$LATEST_TAG" ]; then
            echo "[ERROR] 获取 Gitee 最新版本失败" >>"$LOG_FILE"
            return 1
        fi
        DOWNLOAD_URL="https://gitee.com/aimeisoul/onepanel/releases/download/${LATEST_TAG}/OnePanel.tar"
        echo "[INFO] 使用 Gitee 下载最新 release: $LATEST_TAG" >>"$LOG_FILE"
    fi
    echo "$DOWNLOAD_URL"
}

# -------------------------------
# 安装逻辑
# -------------------------------
install_source() {
    clear
    info "====== 开始源码安装 ======"

    # ---------------------------
    # 检查包管理器
    # ---------------------------
    if command -v apt >/dev/null 2>&1; then
        echo "[INFO] 检测到 apt"
        sudo apt update -y >"$LOG_FILE" 2>&1
        sudo apt install -y python3 python3-venv python3-pip git curl build-essential python3-dev libffi-dev >"$LOG_FILE" 2>&1
    elif command -v yum >/dev/null 2>&1; then
        echo "[INFO] 检测到 yum"
        sudo yum makecache -y >"$LOG_FILE" 2>&1
        sudo yum install -y python3 python3-venv python3-pip git curl gcc gcc-c++ libffi-devel >"$LOG_FILE" 2>&1
    else
        error_exit "[ERROR] 不支持的包管理器"
    fi

    # ---------------------------
    # 分流下载URL
    # ---------------------------
    DOWNLOAD_URL=$(get_latest_release_url)
    if [ -z "$DOWNLOAD_URL" ]; then
        err "获取下载 URL 失败"
        return 1
    fi

    # ---------------------------
    # 配置 pip 镜像
    # ---------------------------
    if [ "$USE_CN" = "1" ]; then
        mkdir -p /root/.pip
        cat >/root/.pip/pip.conf <<EOF
[global]
index-url = https://mirrors.aliyun.com/pypi/simple/
trusted-host = mirrors.aliyun.com
EOF
        info "国内 pip 镜像设置完成"
    fi

    # ---------------------------
    # 下载
    # ---------------------------
    info "下载 release 压缩包..."
    wget -qO "$APP_DIR/OnePanel.tar" "$DOWNLOAD_URL" >>"$LOG_FILE" 2>&1 || {
    err "下载 release 失败"
    return 1
}

    if [ ! -s "$APP_DIR/OnePanel.tar" ]; then
        err "下载的 OnePanel.tar 文件不存在或为空"
        return 1
    fi
    ok "下载完成"

    info "解压到目录..."
    tar -xvf "$APP_DIR/OnePanel.tar" -C "$APP_DIR" >>"$LOG_FILE" 2>&1 || {
    err "解压失败"
    return 1
}

    if [ ! -d "$FIN_DIR/app" ] || [ ! -f "$FIN_DIR/requirements.txt" ]; then
        err "解压后目录不完整，请检查 OnePanel.tar 是否完整"
        ls -l "$FIN_DIR" >>"$LOG_FILE" 2>&1
        return 1
    fi
    ok "解压成功，文件完整"

    # ---------------------------
    # 创建虚拟环境
    # ---------------------------
    python3 -m venv "$FIN_DIR/venv"
    source "$FIN_DIR/venv/bin/activate"

    # ---------------------------
    # 安装依赖
    # ---------------------------
    info "安装 Python 依赖..."
    pip install --upgrade pip >>"$LOG_FILE" 2>&1 || warn "pip 升级失败，查看日志 $LOG_FILE"
    pip install -r "$FIN_DIR/requirements.txt" >>"$LOG_FILE" 2>&1 || warn "依赖安装失败，查看日志 $LOG_FILE"

    # ---------------------------
    # 移动到正式目录
    # ---------------------------
    #rm -rf "$APP_DIR"
    #mv "$TMP_DIR" "$APP_DIR"
    #chmod +x "$APP_DIR/start.sh"

    # ---------------------------
    # 创建 systemd 服务
    # ---------------------------
    cat >/etc/systemd/system/onepanel.service <<EOF
[Unit]
Description=OnePanel Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$FIN_DIR
ExecStart=/opt/OnePanel/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload >/dev/null 2>&1
    systemctl enable onepanel >/dev/null 2>&1
    systemctl restart onepanel >/dev/null 2>&1

    # ---------------------------
    # 完成信息
    # ---------------------------
    clear
    info "====================================="
    info "✅ OnePanel 安装完成"
    info "访问地址: http://服务器IP:$PORT"
    info ""
    info "管理命令:"
    info "  查看状态: systemctl status $APP_NAME"
    info "  重启服务: systemctl restart $APP_NAME"
    info "  查看日志: journalctl -u $APP_NAME -f"
    info ""
    info "建议安装快捷指令，方便管理服务"
    info "====================================="
    pause
}


install_docker() { 
    clear
    info "Docker 部署正在整备中" ; 

    pause    
} 


install_panel() {
    while true; do
        clear
        echo ""
        echo "====== 安装 OnePanel ======"
        echo "1. 源码安装"
        echo "2. Docker 安装（预留）"
        echo "3. 返回主菜单"
        read -p "请选择安装方式: " choice
        case "$choice" in
            1) install_source ;;
            2) install_docker ;;
            3) break ;;
            *) err "无效选项" ;;
        esac
    done
}

# -------------------------------
# 卸载逻辑
# -------------------------------
uninstall_panel() {
    while true; do
        clear
        echo ""
        echo "====== 卸载 OnePanel ======"
        echo "1. 卸载 OnePanel"
        echo "2. 返回主菜单"
        read -p "请选择: " choice
        case "$choice" in
            1)
                clear
                echo "====== 卸载 OnePanel ======"
                info "检测安装方式..."
                if [ -d "$FIN_DIR" ]; then
                    ok "检测到源码安装"
                    info "开始卸载源码安装..."
                    systemctl stop onepanel >/dev/null 2>&1 || true
                    systemctl disable onepanel >/dev/null 2>&1 || true
                    rm -f /etc/systemd/system/onepanel.service
                    systemctl daemon-reload
                    rm -rf "$FIN_DIR"
                    ok "源码安装已卸载"
                elif docker ps --format '{{.Names}}' | grep -q "onepanel"; then
                    ok "检测到 Docker 安装"
                    info "开始卸载 Docker 安装..."
                    docker stop onepanel >/dev/null 2>&1 || true
                    docker rm onepanel >/dev/null 2>&1 || true
                    ok "Docker 安装已卸载"
                else
                    warn "未检测到已安装的 OnePanel"
                fi

                # 卸载快捷命令
                if [ -f "$CLI_PATH" ]; then
                    rm -f "$CLI_PATH"
                    ok "快捷命令已卸载"
                fi
                pause
                ;;
            2) break ;;
            *) err "无效选项" ;;
        esac
    done
}

# -------------------------------
# 升级逻辑
# -------------------------------
upgrade_panel() {
    clear
    info "====== OnePanel 升级 ======"

    # ---------------------------
    # 检查是否安装源码
    # ---------------------------
    if [ ! -d "$FIN_DIR" ]; then
        error_exit "未检测到源码安装的 OnePanel，请先安装"
    fi

    # ---------------------------
    # 读取当前版本
    # ---------------------------
    CURRENT_VERSION="1.0.0"
    if [ -f "$FIN_DIR/VERSION" ]; then
        CURRENT_VERSION=$(cat "$FIN_DIR/VERSION" | tr -d '\r\n')
    fi
    info "当前版本: $CURRENT_VERSION"

    # ---------------------------
    # 判断国内外，获取最新 release 版本号
    # ---------------------------
    USE_CN=0
    if curl -s --connect-timeout 5 https://github.com >/dev/null; then
        API_URL="https://api.github.com/repos/AimeiSoul/OnePanel/releases/latest"
        USE_CN=0
        LATEST_VERSION=$(curl -s $API_URL | grep '"tag_name":' | head -1 | cut -d '"' -f4)
        LATEST_VERSION=$(echo "$LATEST_VERSION" | tr -d '\r\n')
        DOWNLOAD_URL="https://github.com/AimeiSoul/OnePanel/releases/latest/download/OnePanel.tar"
    else
        API_URL="https://gitee.com/api/v5/repos/aimeisoul/onepanel/tags"
        USE_CN=1
        LATEST_VERSION=$(curl -s $API_URL | jq -r '.[].name' | sort -V | tail -1)
        LATEST_VERSION=$(echo "$LATEST_VERSION" | tr -d '\r\n')
        DOWNLOAD_URL="https://gitee.com/aimeisoul/onepanel/releases/download/${LATEST_VERSION}/OnePanel.tar"
    fi

    if [ -z "$LATEST_VERSION" ]; then
        error_exit "无法获取最新版本"
    fi

    info "检测到最新版本: $LATEST_VERSION"

    if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
        ok "已经是最新版本，无需升级"
        pause
        return
    fi

    # ---------------------------
    # 备份数据库
    # ---------------------------
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    if [ -f "$FIN_DIR/data/onepanel.db" ]; then
        tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" -C "$FIN_DIR/data" onepanel.db
        ok "数据库已备份: backup_$TIMESTAMP.tar.gz"
    fi

    # ---------------------------
    # 下载最新版 release
    # ---------------------------
    info "下载最新版本 release..."
    wget -qO "$APP_DIR/OnePanel.tar" "$DOWNLOAD_URL" >>"$LOG_FILE" 2>&1 || {
        err "下载 release 失败"
        return 1
    }

    if [ ! -s "$APP_DIR/OnePanel.tar" ]; then
        err "下载的 OnePanel.tar 文件不存在或为空"
        return 1
    fi
    ok "下载完成"

    # ---------------------------
    # 覆盖解压 release
    # ---------------------------
    info "解压 release 到目录..."
    tar -xvf "$APP_DIR/OnePanel.tar" -C "$APP_DIR" >>"$LOG_FILE" 2>&1 || {
        err "解压 release 失败"
        return 1
    }

    # ---------------------------
    # 更新虚拟环境依赖
    # ---------------------------
    if [ ! -d "$FIN_DIR/venv" ]; then
        python3 -m venv "$FIN_DIR/venv"
    fi
    source "$FIN_DIR/venv/bin/activate"

    pip install --upgrade pip >>"$LOG_FILE" 2>&1
    pip install -r "$FIN_DIR/requirements.txt" >>"$LOG_FILE" 2>&1

    # ---------------------------
    # 替换应用目录
    # ---------------------------
    #rsync -a --delete "$TMP_DIR/" "$APP_DIR/"

    # 更新 VERSION 文件
    echo "$LATEST_VERSION" > "$FIN_DIR/VERSION"

    # ---------------------------
    # 重启 systemd 服务
    # ---------------------------
    systemctl restart onepanel >/dev/null 2>&1

    ok "升级完成，当前版本: $LATEST_VERSION"

    pause

}

# -------------------------------
# 服务管理
# -------------------------------
service_menu() {
    while true; do
        clear
        echo ""
        echo "====== 服务管理 ======"
        echo "1. 启动"
        echo "2. 停止"
        echo "3. 重启"
        echo "4. 查看状态"
        echo "5. 返回主菜单"
        read -p "请选择: " choice
        case "$choice" in
            1) systemctl start onepanel 
                ok "服务已启动"
                pause
                ;;
            2) systemctl stop onepanel 
                ok "服务已停止"
                pause
                ;;
            3) systemctl restart onepanel 
                ok "服务已重启"
                pause
                ;;
            4) systemctl status onepanel 
                pause
                ;;
            5) break ;;
            *) err "无效选项" ;;
        esac
    done
}

# -------------------------------
# 备份管理
# -------------------------------
backup_menu() {
    mkdir -p "$BACKUP_DIR"
    while true; do
        clear
        echo ""
        echo "====== 备份管理 ======"
        echo "1. 数据库备份"
        echo "2. 查看备份"
        echo "3. 返回主菜单"
        read -p "请选择: " choice
        case "$choice" in
            1)
                clear
                echo "====== 数据库备份 ======"
                info "开始备份数据库..."
                TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" -C "$FIN_DIR/data" onepanel.db
                ok "备份完成: backup_$TIMESTAMP.tar.gz"
                pause
                ;;
            2)
                clear
                echo "====== 查看备份内容 ======"
                echo "现有备份文件:"
                ls -1 "$BACKUP_DIR"
                pause
                ;;
            3) break ;;
            *) err "无效选项" ;;
        esac
    done
}

# -------------------------------
# 快捷指令管理
# -------------------------------
cli_menu() {
    while true; do
        clear
        echo ""
        echo "====== 快捷命令管理 ======"
        echo "1. 安装快捷命令 op"
        echo "2. 卸载快捷命令 op"
        echo "3. 返回主菜单"
        read -p "请选择: " choice

        case "$choice" in
            1)
                if [ -f "$CLI_PATH" ]; then
                    warn "快捷命令已存在"
                else
                    cat >$CLI_PATH <<EOF
#!/bin/bash
bash $FIN_DIR/start.sh "\$@"
EOF
                    chmod +x $CLI_PATH
                    ok "快捷命令安装完成，可使用 op 管理"
                fi
                pause
                ;;
            2)
                if [ -f "$CLI_PATH" ]; then
                    rm -f "$CLI_PATH"
                    ok "快捷命令已卸载"
                else
                    warn "快捷命令不存在"
                fi
                pause
                ;;
            3) break ;;
            *) err "无效选项" ;;
        esac
    done
}

# -------------------------------
# 主菜单
# -------------------------------
while true; do
    clear
    echo ""
    echo "====== OnePanel 管理中心 ======"
    echo "1. 安装 OnePanel"
    echo "2. 卸载 OnePanel"
    echo "3. 升级 OnePanel"
    echo "4. 状态管理"
    echo "5. 备份管理"
    echo "6. 快捷指令管理"
    echo "7. 退出"
    read -p "请选择: " input

    case "$input" in
        1) install_panel ;;
        2) uninstall_panel ;;
        3) upgrade_panel ;;
        4) service_menu ;;
        5) backup_menu ;;
        6) cli_menu ;;
        7) exit 0 ;;
        *) err "无效选项" ;;
    esac
done
