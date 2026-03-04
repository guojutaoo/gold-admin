# 金价监控系统 (Gold Admin) 阿里云 ECS 部署指南

本指南将帮助你将项目部署到阿里云 ECS 服务器（推荐使用 Ubuntu 20.04/22.04 LTS 系统）。

## 方式一：自动化部署脚本（推荐）

我们在 `deploy/setup.sh` 中提供了一个自动化脚本，可以帮你完成环境安装、代码构建和服务启动。

**步骤：**
1.  参考下文“1. 准备工作”购买服务器并连接。
2.  参考下文“3.1 上传代码”将项目上传到服务器。
3.  在项目根目录下运行脚本：
    ```bash
    # 赋予执行权限
    chmod +x deploy/setup.sh
    
    # 使用 root 权限运行
    sudo ./deploy/setup.sh
    ```
4.  脚本执行过程中会提示输入服务器公网 IP，按提示操作即可。
5.  完成后访问 `http://<你的公网IP>` 即可看到系统。

---

## 方式二：手动分步部署

如果你希望了解每一步细节，或脚本执行失败，请参考以下步骤。

## 1. 准备工作

### 1.1 购买与配置 ECS
1.  登录阿里云控制台，购买 ECS 实例。
2.  操作系统选择 **Ubuntu 22.04 64位**。
3.  配置**安全组规则**，开放以下端口：
    *   `22` (SSH远程连接)
    *   `80` (HTTP Web服务)
    *   `443` (HTTPS Web服务，可选)
    *   `3001` (后端API端口，仅用于测试，生产环境通过Nginx转发)

### 1.2 连接服务器
使用终端连接到你的服务器：
```bash
ssh root@<你的公网IP>
# 输入密码登录
```

## 2. 环境安装

### 2.1 更新系统软件包
```bash
apt update && apt upgrade -y
```

### 2.2 安装 Node.js (v18 LTS)
```bash
# 安装 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# 安装 Node.js
apt install -y nodejs

# 验证安装
node -v
npm -v
```

### 2.3 安装 PM2 (进程管理器)
用于在后台运行 Node 服务并保持其在线。
```bash
npm install -g pm2
```

### 2.4 安装 Nginx (Web 服务器)
```bash
apt install -y nginx

# 启动 Nginx 并设置开机自启
systemctl start nginx
systemctl enable nginx
```

## 3. 代码部署

### 3.1 上传代码
你可以通过 `git clone` 或 `scp` 上传代码。这里假设将代码放在 `/var/www/gold-admin` 目录。

**方法 A: 使用 Git (推荐)**
1.  将代码推送到 GitHub/GitLab。
2.  在服务器上克隆：
    ```bash
    mkdir -p /var/www
    cd /var/www
    git clone <你的仓库地址> gold-admin
    cd gold-admin
    ```

**方法 B: 本地上传压缩包**
1.  在本地压缩项目 (排除 `node_modules`, `dist`, `.git`)：
    ```bash
    tar -czvf gold-admin.tar.gz --exclude=node_modules --exclude=dist --exclude=.git .
    ```
2.  上传到服务器：
    ```bash
    scp gold-admin.tar.gz root@<你的公网IP>:/var/www/
    ```
3.  在服务器解压：
    ```bash
    mkdir -p /var/www/gold-admin
    tar -xzvf /var/www/gold-admin.tar.gz -C /var/www/gold-admin
    cd /var/www/gold-admin
    ```

### 3.2 安装依赖与构建
```bash
# 安装项目依赖
npm install

# 构建前端静态资源 (生成 dist 目录)
npm run build
```

## 4. 启动后端服务

### 4.1 配置环境变量
如果需要修改默认配置，创建 `.env` 文件：
```bash
cp .env.example .env  # 如果有示例文件
# 或者直接创建
nano .env
```
写入内容（按需修改）：
```env
PORT=3001
JWT_SECRET=your_secure_secret
SMTP_HOST=smtp.qq.com
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_password
```

### 4.2 使用 PM2 启动
```bash
# 使用项目根目录下的配置文件启动
pm2 start ecosystem.config.cjs

# 保存当前进程列表，以便开机自启
pm2 save
pm2 startup
```

## 5. 配置 Nginx 反向代理

### 5.1 配置站点
1.  创建 Nginx 配置文件：
    ```bash
    nano /etc/nginx/sites-available/gold-admin
    ```
2.  复制 `deploy/nginx.conf` 的内容到文件中。
3.  **重要**：修改配置文件中的 `server_name` 为你的 IP 或域名，修改 `root` 路径为 `/var/www/gold-admin/dist`。

### 5.2 启用站点
```bash
# 建立软链接
ln -s /etc/nginx/sites-available/gold-admin /etc/nginx/sites-enabled/

# 检查配置语法
nginx -t

# 如果通过检查，重启 Nginx
systemctl restart nginx
```

## 6. 验证部署

1.  打开浏览器访问 `http://<你的公网IP>`。
2.  应该能看到前端页面。
3.  尝试登录或注册，验证后端 API 是否正常工作。

## 常见问题排查

*   **页面 404 / 502**: 检查 Nginx 配置中的 `root` 路径是否正确，后端端口是否为 3001。
*   **后端报错**: 使用 `pm2 logs gold-admin-api` 查看后端日志。
*   **数据库无法写入**: 确保 `data` 目录有写入权限：
    ```bash
    chmod -R 755 data
    ```
