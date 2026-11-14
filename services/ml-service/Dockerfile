FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv==0.5.4
COPY pyproject.toml ./
COPY ml ./ml
RUN uv pip install --system .
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "affinity_ml.training.train"]

