FROM node:20-slim
ARG TARGETARCH
# cloudflared (phone link), Piper (voices on this PC), the browser Piper for the phones, and ffmpeg (small voice files)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
 && ARCH="${TARGETARCH:-amd64}" \
 && curl -fsSL -o /usr/local/bin/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" \
 && chmod +x /usr/local/bin/cloudflared \
 && PARCH=$([ "$ARCH" = "arm64" ] && echo aarch64 || echo x86_64) \
 && curl -fsSL -o /tmp/piper.tgz "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${PARCH}.tar.gz" \
 && tar -xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz \
 && PW=https://raw.githubusercontent.com/Poket-Jony/piper-tts-web/950f1f5c8278296a6698cc11e8b976594dad6687/dist \
 && for f in worker/PhonemizeWebWorker.js worker/OnnxWebWorker.js onnx/ort-wasm-simd-threaded.wasm piper/piper_phonemize.wasm piper/piper_phonemize.data; do \
      mkdir -p "/opt/piper-web/$(dirname $f)" && curl -fsSL -o "/opt/piper-web/$f" "$PW/$f"; done \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV PIPER_BIN=/opt/piper/piper
WORKDIR /app
COPY server.js voice.js manager.html ./
COPY catalog ./catalog
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8787
CMD ["node", "server.js"]
