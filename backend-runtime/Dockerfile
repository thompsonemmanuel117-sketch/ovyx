FROM docker.io/cloudflare/sandbox:0.12.14

USER root
RUN mkdir -p /opt/ovyx-runtime/scripts /workspace \
    && npm install --prefix /opt/ovyx-runtime --ignore-scripts --no-audit --no-fund wrangler@4.141.0
COPY scripts/ovyx-generated-backend-runtime-eval.mjs /opt/ovyx-runtime/scripts/ovyx-generated-backend-runtime-eval.mjs
WORKDIR /opt/ovyx-runtime
CMD ["sleep", "infinity"]
