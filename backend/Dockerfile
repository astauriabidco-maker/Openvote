# Build Stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Dépendances système pour CGO (si besoin, mais on essaie de faire du statique)
RUN apk add --no-cache git build-base

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

# Certificats CA pour les requêtes HTTPS sortantes et Timezone
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/main .
COPY --from=builder /app/migration ./migration

# Exposition du port
EXPOSE 8095

CMD ["./main"]
