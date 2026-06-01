#!/bin/bash
set -e
stty erase ^H
stty erase ^?

APP_NAME="onepanel"
APP_DIR="/opt"
CLI_PATH="/usr/local/bin/op"
FIN_DIR="$APP_DIR/OnePanel"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="/var/log/onepanel-install.log"
PORT=8000

# 彩色输出
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"

draw_line() { echo -e "${CYAN}--------------------------------------------------${RESET}"; }

pause() {
    echo ""
    echo -ne "${YELLOW}按下回车键继续...${RESET}"
    read temp
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
# 实时获取服务状态和版本
############################################
get_status_label() {
    if systemctl is-active --quiet onepanel; then
        echo -e "${GREEN}运行中 (Running)${RESET}"
    else
        echo -e "${RED}已停止 (Stopped)${RESET}"
    fi
}

get_version() {
    if [ -f "$FIN_DIR/VERSION" ]; then
        cat "$FIN_DIR/VERSION" | tr -d '\r\n'
    else
        echo "未知"
    fi
}

############################################
# 检查 root
############################################
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}${BOLD}错误: 必须使用 root 或 sudo 权限运行此脚本！${RESET}"
    exit 1
fi

mkdir -p "$(dirname $LOG_FILE)"
touch "$LOG_FILE"

############################################
# 获取最新 release 下载 URL 并安装JQ
############################################
install_jq() {
    if ! command -v jq >/dev/null 2>&1; then
        info "检测到 jq 未安装，正在安装..."
        if command -v apt >/dev/null 2>&1; then
            apt install -y jq >>"$LOG_FILE" 2>&1
        elif command -v yum >/dev/null 2>&1; then
            yum install -y jq >>"$LOG_FILE" 2>&1
        else
            err "无法安装 jq，请手动安装"
            exit 1
        fi
        ok "jq 安装完成"
    fi
}

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
            echo "[ERROR] 获取 Gitee 最新版本失败，请检查网络" >>"$LOG_FILE"
            return 1
        fi
        DOWNLOAD_URL="https://gitee.com/aimeisoul/onepanel/releases/download/${LATEST_TAG}/OnePanel.tar"
        echo "[INFO] 使用 Gitee 下载最新 release: $LATEST_TAG" >>"$LOG_FILE"
    fi
    echo "$DOWNLOAD_URL"
}

create_env_file() {
    ENV_FILE="$FIN_DIR/.env"

    if [ -f "$ENV_FILE" ] && grep -q "^SECRET_KEY=" "$ENV_FILE"; then
        ok ".env exists, skip creating"
        return 0
    fi

    echo ""
    info "创建 .env 配置文件"
    warn "SECRET_KEY 用于登录令牌签名，请妥善保存，升级或迁移时保持不变"

    while true; do
        read -rsp "请输入 SECRET_KEY（建议至少 32 位随机字符串）: " SECRET_KEY_INPUT
        echo ""

        if [ -n "$SECRET_KEY_INPUT" ]; then
            break
        fi

        warn "SECRET_KEY 不能为空, 请重新输入"
    done

    umask 077
    printf "SECRET_KEY=%s\n" "$SECRET_KEY_INPUT" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    ok ".env 创建: $ENV_FILE"
}

# -------------------------------
# 安装逻辑
# -------------------------------
install_source() {
    clear
    draw_line
    echo -e "${BOLD}🚀 开始安装 OnePanel${RESET}"
    draw_line

    # ---------------------------
    # 检查包管理器
    # ---------------------------
    info "正在配置系统依赖环境..."

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

    install_jq

    # ---------------------------
    # 分流下载URL
    # ---------------------------
    info "正在检索最新版本..."
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
    info "下载安装包: $DOWNLOAD_URL"
    wget -O "$APP_DIR/OnePanel.tar" "$DOWNLOAD_URL" --show-progress || {
    err "下载失败，请检查网络后重试"
    return 1
}

    if [ ! -s "$APP_DIR/OnePanel.tar" ]; then
        err "下载的 OnePanel.tar 文件不存在或为空"
        return 1
    fi
    ok "下载完成"

    info "解压并部署文件..."
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
    info "创建 Python 虚拟环境..."
    create_env_file

    python3 -m venv "$FIN_DIR/venv"
    source "$FIN_DIR/venv/bin/activate"

    # ---------------------------
    # 安装依赖
    # ---------------------------
    info "安装项目依赖 (可能需要几分钟)..."
    pip install --upgrade pip >>"$LOG_FILE" 2>&1 || warn "pip 升级失败，查看日志 $LOG_FILE"
    pip install -r "$FIN_DIR/requirements.txt" >>"$LOG_FILE" 2>&1 || warn "依赖安装失败，查看日志 $LOG_FILE"

    # ---------------------------
    # 创建 systemd 服务
    # ---------------------------
    info "注册系统服务..."
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
    draw_line
    echo -e "${BOLD}🚀 开始安装 OnePanel${RESET}"
    draw_line
    info "Docker 正在整备中" ; 

    pause    
} 


install_panel() {
    while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BOLD}⚙️  安装面板${RESET}           "
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. 📥 源码安装"
        echo -e "  2. 🐳 Docker"
        echo -e "  3. 🔙 返回主菜单"
        draw_line
        read -p "请输入选项 [1-3]: " in_choice
        case "$in_choice" in
            1) install_source ;;
            2) install_docker ;;
            3) break ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 卸载逻辑
# -------------------------------
uninstall_source() {
    clear
    draw_line
    echo -e "${BOLD}🗑️ 开始卸载 OnePanel${RESET}"
    draw_line
    warn "该操作将删除所有程序和数据！"
    read -p "⚠️  确定要卸载吗？(y/N): " confirm
    if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
        if [ -d "$FIN_DIR" ]; then
            info "开始卸载源码安装..."
            systemctl stop onepanel >/dev/null 2>&1 || true
            systemctl disable onepanel >/dev/null 2>&1 || true
            rm -f /etc/systemd/system/onepanel.service
            systemctl daemon-reload
            rm -rf "$FIN_DIR"
            ok "源码安装已卸载"

            info "检测是否需要卸載快捷命令..."
            if [ -f "$CLI_PATH" ]; then
                info "正在卸载快捷命令..."
                rm -f "$CLI_PATH"
                ok "快捷命令已卸载"
            else
                ok "未检测到快捷命令"
            fi
            ok "卸载已全部完成"
            info "卸载成功，感謝使用OnePanel，愿今后仍能相会。"
            exit 0
        else
            ok "未检测到已安装的 OnePanel，请返回安装"
            pause
        fi
    else
    err "取消卸载"
    pause
    fi
}

uninstall_docker() {
    clear
    draw_line
    echo -e "${BOLD}🗑️ 开始卸载 OnePanel${RESET}"
    draw_line
    warn "该操作将删除所有程序和数据！"
    read -p "⚠️  确定要卸载吗？(y/N): " confirm
    if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
        if docker ps --format '{{.Names}}' | grep -q "onepanel"; then
            info "开始卸载 Docker 安装..."
            docker stop onepanel >/dev/null 2>&1 || true
            docker rm onepanel >/dev/null 2>&1 || true
            ok "Docker 安装已卸载"
            exit 0
        else
            warn "未检测到已安装的 OnePanel，请返回安装"
            pause
        fi
    else
        err "取消卸载"
        pause
    fi
}

uninstall_panel() {
    while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BLOD}⚙️  卸載面板${RESET}           "
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. 📥 卸載源码"
        echo -e "  2. 🐳 卸載Docker"
        echo -e "  3. 🔙 返回主菜单"
        draw_line
        read -p "请输入选项 [1-3]: " un_choice
        case "$un_choice" in
            1) uninstall_source ;;
            2) uninstall_docker ;;
            3) break ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 升级逻辑
# -------------------------------
upgrade_source() {
    clear
    draw_line
    echo -e "${BOLD}🗑️ 开始升级 OnePanel${RESET}"
    draw_line

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

    if [ "$USE_CN" = "1" ]; then
        info "已从Gitee检测到最新版本: $LATEST_VERSION"
    else
        info "已从Github检测到最新版本: $LATEST_VERSION"
    fi

    if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
        ok "已经是最新版本，无需升级"
        pause
        return
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
    # 备份数据库
    # ---------------------------
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    if [ -f "$FIN_DIR/data/onepanel.db" ]; then
        tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" -C "$FIN_DIR/data" onepanel.db
        ok "数据库已备份: backup_$TIMESTAMP.tar.gz"
    fi

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


upgrade_docker() { 
    clear
    draw_line
    echo -e "${BOLD}🗑️ 开始升级 OnePanel${RESET}"
    draw_line
    info "Docker 正在整备中" ; 

    pause    
} 

upgrade_panel() {
    while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BLOD}⚙️  升级面板${RESET}           "
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. 📥 升级源码"
        echo -e "  2. 🐳 升级Docker"
        echo -e "  3. 🔙 返回主菜单"
        draw_line
        read -p "请输入选项 [1-3]: " up_choice
        case "$up_choice" in
            1) upgrade_source ;;
            2) upgrade_docker ;;
            3) break ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 服务管理
# -------------------------------
service_menu() {
while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BOLD}⚙️  服务状态管理${RESET}           "
        echo -e "   当前状态: $(get_status_label)"
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. ${GREEN}▶  启动服务${RESET}"
        echo -e "  2. ${RED}■  停止服务${RESET}"
        echo -e "  3. ${BLUE}🔄 重启服务${RESET}"
        echo -e "  4. ${CYAN}📋 查看运行状态${RESET}"
        echo -e "  5. 🔙 返回主菜单"
        draw_line
        read -p "请输入选项 [1-5]: " ser_choice
        case "$ser_choice" in
            1) systemctl start onepanel && ok "服务启动成功" && pause ;;
            2) systemctl stop onepanel && warn "服务已停止" && pause ;;
            3) systemctl restart onepanel && ok "服务重启成功" && pause ;;
            4) 
                echo -e "${CYAN}--------------------- 服务详细信息 ---------------------${RESET}"
                systemctl status onepanel --no-pager -l
                draw_line
                pause 
                ;;
            5) break ;;
            *) err "无效选项" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 备份管理
# -------------------------------
backup_menu() {
    while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BOLD}💾 备份与恢复管理${RESET}           "
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. 📝 立即备份数据库"
        echo -e "  2. 🔍 查看备份列表"
        echo -e "  3. ${RED}🗑️  清理旧备份${RESET}"
        echo -e "  4. 🔙 返回主菜单"
        draw_line
        read -p "请选择 [1-4]: " bak_choice
        case "$bak_choice" in
            1)
                mkdir -p "$BACKUP_DIR"
                local b_name="manual_bak_$(date +%Y%m%d_%H%M%S).db"
                cp "$FIN_DIR/data/onepanel.db" "$BACKUP_DIR/$b_name"
                ok "备份成功: $b_name" && pause ;;
            2)
                echo "目录: $BACKUP_DIR"
                ls -lh "$BACKUP_DIR" | grep ".db" || echo "无备份文件"
                pause ;;
            3)
                warn "该操作将删除所有备份文件！"
                read -p "⚠️  确定要刪除吗？(y/N): " confirm
                if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
                    rm -rf "$BACKUP_DIR"/* && ok "备份已清空" && pause
                else
                    err "取消刪除" && pause
                fi
                ;;
            4) break ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 快捷指令管理
# -------------------------------
cli_menu() {
    while true; do
        clear
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "           ${BOLD}⌨️  快捷指令管理${RESET}           "
        echo -e "${CYAN}==================================================${RESET}"
        echo -e "  1. ⚡ 安装快捷指令 (op)"
        echo -e "  2. ${RED}🗑️  卸载快捷指令${RESET}"
        echo -e "  3. 🔙 返回主菜单"
        draw_line
        read -p "请输入选项 [1-3]: " cli_choice
        case "$cli_choice" in
            1)
                SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
                cat >$CLI_PATH <<EOF
#!/bin/bash
# 自动寻找脚本位置并执行
exec bash "$SCRIPT_PATH" "\$@"
EOF
                chmod +x $CLI_PATH
                ok "安装成功！现在可以在任何地方输入 ${BOLD}op${RESET} 唤起此菜单。"
                pause
                ;;
            2)
                rm -f "$CLI_PATH" && ok "快捷指令已移除"
                pause
                ;;
            3) break ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

# -------------------------------
# 主菜单
# -------------------------------
main_menu() {
    while true; do
        clear
        echo -e "${CYAN}╔════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}║${RESET}            ${BOLD}🌟 OnePanel 综合管理中心${RESET}            ${CYAN}║${RESET}"
        echo -e "${CYAN}║${RESET}     ${BOLD}状态:${RESET} $(get_status_label)     ${BOLD}版本:${RESET} $(get_version)     ${CYAN}║${RESET}"
        echo -e "${CYAN}╚════════════════════════════════════════════════╝${RESET}"
        echo -e "  1. ${CYAN}📥${RESET} 安装面板"
        echo -e "  2. ${CYAN}🔄${RESET} 升级更新"
        echo -e "  3. ${CYAN}⚡${RESET} 服务管理"
        echo -e "  4. ${CYAN}💾${RESET} 备份管理"
        echo -e "  5. ${CYAN}🛠️ ${RESET} 快捷指令"
        echo -e "  6. ${RED}🗑️  卸载面板${RESET}"
        echo -e "  7. ${YELLOW}❌ 退出脚本${RESET}"
        draw_line
        read -rp "请选择操作 [1-7]: " main_choice

        case "$main_choice" in
            1) install_panel ;;
            2) upgrade_panel ;;
            3) service_menu ;;
            4) backup_menu ;;
            5) cli_menu ;;
            6) uninstall_panel ;;
            7) echo -e "${BLUE}再见！${RESET}"; exit 0 ;;
            *) err "无效输入，请重新选择" && sleep 1 ;;
        esac
    done
}

main_menu
