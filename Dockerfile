# ---------- Stage 1: builder ----------
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Dependencias del sistema necesarias para descargar módulos (ej. repos privados vía git)
RUN apk add --no-cache git

# Cachear dependencias: solo se re-descargan si cambian go.mod / go.sum
COPY go.mod go.sum ./
RUN go mod download

# Copiar el resto del código y compilar ambos binarios estáticos optimizados (API y Worker)
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/api ./cmd/api/main.go \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/worker ./cmd/worker/main.go

# ---------- Stage 2: runtime ----------
FROM alpine:latest

# Certificados TLS y datos de zona horaria
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S appgroup \
    && adduser -S -G appgroup appuser

WORKDIR /app

# Copiar los binarios compilados (api por defecto, worker invocable vía entrypoint)
COPY --from=builder /app/api /app/api
COPY --from=builder /app/worker /app/worker

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/api"]
