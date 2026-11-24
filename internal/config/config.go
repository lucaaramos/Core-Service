package config

import (
	"os"
	"strings"
)

// defaultCORSAllowOrigins permite el desarrollo local con los puertos típicos de
// React (3000) y Vite (5173). Nunca se usa "*" porque AllowCredentials está activo.
const defaultCORSAllowOrigins = "http://localhost:3000,http://localhost:5173"

// Config agrupa la configuración de la aplicación leída desde variables de entorno.
type Config struct {
	// CORSAllowOrigins es la lista de orígenes permitidos separados por coma.
	CORSAllowOrigins string

	// Configuración de almacenamiento compatible con S3 (MinIO / AWS S3).
	S3PublicEndpoint string
	S3Region         string
	S3Bucket         string
	S3AccessKey      string
	S3SecretKey      string
}

// Load construye la configuración a partir de las variables de entorno,
// aplicando valores por defecto seguros para desarrollo local.
func Load() Config {
	origins := os.Getenv("CORS_ALLOW_ORIGINS")
	if origins == "" || origins == "*" {
		// Con AllowCredentials=true el navegador rechaza "*", por eso se usa el fallback.
		origins = defaultCORSAllowOrigins
	}

	s3Endpoint := strings.TrimRight(envOr("S3_PUBLIC_ENDPOINT", "http://localhost:9000"), "/")

	return Config{
		CORSAllowOrigins: origins,
		S3PublicEndpoint: s3Endpoint,
		S3Region:         envOr("S3_REGION", "us-east-1"),
		S3Bucket:         envOr("S3_BUCKET", "evidencias"),
		S3AccessKey:      envOr("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:      envOr("S3_SECRET_KEY", "minioadmin123"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
