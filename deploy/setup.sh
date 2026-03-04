#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Gold Admin 自动化部署脚本 ===${NC}"

# 1. 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root 权限运行此脚本 (sudo ./deploy/setup.sh)${NC}"
  exit 1
fi

# 2. 安装环境 (Node.js, PM2, Nginx)
echo -e "${YELLOW}正在更新系统并安装环境...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get update
apt-get install -y nodejs nginx

# 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}正在安装 PM2...${NC}"
    npm install -g pm2
fi

# 3. 安装项目依赖
echo -e "${YELLOW}正在安装项目依赖...${NC}"
npm install

# 4. 构建前端
echo -e "${YELLOW}正在构建前端资源...${NC}"
npm run build

# 5. 启动后端服务
echo -e "${YELLOW}正在启动后端服务...${NC}"
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | bash

# 6. 配置 Nginx
echo -e "${YELLOW}正在配置 Nginx...${NC}"
# 提示用户输入域名或IP
read -p "请输入您的服务器公网IP或域名: " SERVER_NAME

# 读取模板并替换变量
TEMPLATE_FILE="./deploy/nginx.conf"
NGINX_CONF="/etc/nginx/conf.d/gold-admin.conf"
CURRENT_DIR=$(pwd)

# 简单的替换操作 (注意路径转义)
sed "s|server_name your_domain_or_ip;|server_name $SERVER_NAME;|g" $TEMPLATE_FILE > $NGINX_CONF
sed -i "s|root /var/www/gold-admin/dist;|root $CURRENT_DIR/dist;|g" $NGINX_CONF
sed -i "s|proxy_pass http://127.0.0.1:3001;|proxy_pass http://127.0.0.1:3001;|g" $NGINX_CONF

# 检查配置并重载
nginx -t
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo -e "${GREEN}Nginx 配置成功并已重载!${NC}"
else
    echo -e "${RED}Nginx 配置验证失败，请手动检查 /etc/nginx/conf.d/gold-admin.conf${NC}"
fi

echo -e "${GREEN}=== 部署完成! ===${NC}"
echo -e "请访问: http://$SERVER_NAME"
