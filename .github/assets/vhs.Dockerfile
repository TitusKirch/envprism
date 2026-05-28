# VHS + Bun, for rendering the README demo GIF.
# The official VHS image has no Bun, and envprism needs it (opentui/bun:ffi).
#
# Build:  docker build -f .github/assets/vhs.Dockerfile -t envprism-vhs .
# Render: docker run --rm -v "$PWD:/vhs" envprism-vhs .github/assets/demo.tape
FROM ghcr.io/charmbracelet/vhs

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
