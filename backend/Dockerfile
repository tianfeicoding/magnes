# 使用官方 Python 3.11 镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（Playwright 需要这些）
    RUN sed -i "s/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g" /etc/apt/sources.list.d/debian.sources
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgdk-pixbuf-2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    libu2f-udev \
    xdg-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 安装 Playwright 浏览器
RUN playwright install chromium

# 创建必要的目录
RUN mkdir -p data/uploads exports chroma_db storage

# 复制后端代码
COPY . .

# 暴露端口
EXPOSE 8088

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088"]
