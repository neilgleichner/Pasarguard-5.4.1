ARG PYTHON_VERSION=3.14

FROM ghcr.io/astral-sh/uv:python$PYTHON_VERSION-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

ENV UV_PYTHON_DOWNLOADS=0

WORKDIR /build
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev
ADD . /build
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


FROM python:$PYTHON_VERSION-slim-bookworm

COPY --from=builder /build /code
WORKDIR /code

ENV PATH="/code/.venv/bin:$PATH"

# Keep the runtime trust store explicit. Outbound notification clients use it
# without replacing Python's process-wide SSLContext.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    bash \
    unzip \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The dashboard is built at application startup so it can use runtime settings.
# Keep Bun and the locked dashboard dependencies in the image for that build.
ENV PATH="/root/.bun/bin:/code/.venv/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | bash \
    && cd /code/dashboard \
    && bun install --frozen-lockfile

COPY cli_wrapper.sh /usr/bin/pasarguard-cli
RUN chmod +x /usr/bin/pasarguard-cli

COPY tui_wrapper.sh /usr/bin/pasarguard-tui
RUN chmod +x /usr/bin/pasarguard-tui

# Copy healthcheck script
COPY healthcheck.sh /code/healthcheck.sh
RUN chmod +x /code/healthcheck.sh

RUN chmod +x /code/start.sh

ENTRYPOINT ["/code/start.sh"]
