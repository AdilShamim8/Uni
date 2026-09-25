# ---- build the web app (optional: rewoo/web/dist is committed, this keeps images reproducible) ----
FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web/ ./
RUN mkdir -p /rewoo/web && npx vite build --outDir /out

# ---- runtime ----
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY rewoo ./rewoo
COPY --from=web /out ./rewoo/web/dist
ENV REWOO_HOST=0.0.0.0 REWOO_PORT=8787 REWOO_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8787/api/health')"
CMD ["python", "-m", "rewoo", "serve", "--no-browser"]
