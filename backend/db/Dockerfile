FROM postgis/postgis:15-3.3-alpine

# Installation de pgvector pour la recherche sémantique vectorielle
RUN apk add --no-cache --virtual .build-deps \
        build-base \
        clang15 \
        llvm15-dev \
        git \
        postgresql15-dev && \
    git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git /tmp/pgvector && \
    cd /tmp/pgvector && \
    make && \
    make install && \
    rm -rf /tmp/pgvector && \
    apk del .build-deps
