FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY rewoo ./rewoo
ENV REWOO_HOST=0.0.0.0 REWOO_PORT=8787 REWOO_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["python", "-m", "rewoo", "serve", "--no-browser"]
