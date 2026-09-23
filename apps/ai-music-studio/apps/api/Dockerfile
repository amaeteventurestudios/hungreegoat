FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY pyproject.toml alembic.ini ./
COPY src ./src
COPY migrations ./migrations
RUN pip install --no-cache-dir --no-deps . && useradd --uid 10001 --create-home studio
USER studio
EXPOSE 8000
CMD ["uvicorn", "studio_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
