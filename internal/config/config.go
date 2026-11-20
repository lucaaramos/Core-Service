package config

import "os"

// defaultCORSAllowOrigins permite el desarrollo local con los puertos típicos de
// React (3000) y Vite (5173). Nunca se usa "*" porque AllowCredentials está activo.
const defaultCORSAllowOrigins = "http://localhost:3000,http://localhost:5173"

// Config agrupa la configuración de la aplicación leída desde variables de entorno.
type Config struct {
	// CORSAllowOrigins es la lista de orígenes permitidos separados por coma.
	CORSAllowOrigins string
}

// Load construye la configuración a partir de las variables de entorno,
// aplicando valores por defecto seguros para desarrollo local.
func Load() Config {
	origins := os.Getenv("CORS_ALLOW_ORIGINS")
	if origins == "" || origins == "*" {
		// Con AllowCredentials=true el navegador rechaza "*", por eso se usa el fallback.
		origins = defaultCORSAllowOrigins
	}

	return Config{
		CORSAllowOrigins: origins,
	}
}
