-- Habilitar extensiones requeridas para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla de Usuarios (users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN ('CLIENTE', 'OPERARIO', 'ADMIN')),
    telefono VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Catálogo de Servicios (services)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    tarifa_base NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Solicitudes y Trabajos (tickets)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operario_id UUID REFERENCES users(id) ON DELETE SET NULL,
    servicio_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    estado VARCHAR(50) NOT NULL DEFAULT 'CREADO' CHECK (estado IN ('CREADO', 'ASIGNADO', 'EN_CAMINO', 'EN_PROGRESO', 'FINALIZADO', 'CANCELADO')),
    direccion TEXT NOT NULL,
    descripcion_problema TEXT NOT NULL,
    precio_final NUMERIC(10,2),
    metodo_pago VARCHAR(50) CHECK (metodo_pago IN ('EFECTIVO', 'QR', 'TRANSFERENCIA')),
    evidencia_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices recomendados para rendimiento y consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_tickets_cliente_id ON tickets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_operario_id ON tickets(operario_id);
CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
