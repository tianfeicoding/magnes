FROM python:3.11-slim

WORKDIR /app

RUN sed -i "s/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g" /etc/apt/sources.list.d/debian.sources
RUN apt-get update && apt-get install -y \
    wget gnupg libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf-2.0-0 \
    libgtk-3-0 libgbm-dev libnss3 libxss1 libasound2 fonts-liberation \
    libappindicator3-1 libu2f-udev xdg-utils curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

RUN mkdir -p data/uploads exports chroma_db storage

# 复制后端代码到 /app
COPY backend /app

# 关键修改：frontend 复制到根目录 /frontend（不是 /app/frontend）
COPY frontend /frontend

EXPOSE 8088

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088"]
