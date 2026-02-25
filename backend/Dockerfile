# Build Stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Dépendances système pour CGO et parsing PDF
RUN apk add --no-cache git build-base poppler-utils

# Mise en cache des modules
COPY go.mod ./
RUN go mod download

# Copie du code source
COPY . .
RUN go mod tidy

# Compilation
RUN CGO_ENABLED=1 GOOS=linux go build -o main ./cmd/api/main.go

# Run Stage
FROM alpine:latest

WORKDIR /root/

# Certificats CA, Timezone et Utilitaires PDF
RUN apk --no-cache add ca-certificates tzdata poppler-utils

COPY --from=builder /app/main .
COPY --from=builder /app/migration ./migration

# Exposition du port
EXPOSE 8095

CMD ["./main"]
