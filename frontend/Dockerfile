# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el código fuente
COPY . .

# Argumentos y variables de entorno para Vite (embebidas en tiempo de build)
ARG VITE_API_URL=http://localhost:8080/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Compilar para producción
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM nginx:alpine

# Copiar configuración de Nginx para SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar artefactos compilados desde el builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
