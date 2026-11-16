# Arquitectura y Reglas de Negocio - Core Service (MVP)

## Descripción General
Este repositorio contiene el backend (Core Service) para la plataforma de oficios y servicios (MVP). Su objetivo principal es gestionar la solicitud de servicios por parte de clientes y la asignación / ejecución de los mismos por parte de operarios calificados.

## Estructura de Base de Datos (PostgreSQL 15)
El modelo relacional soporta las siguientes entidades principales:

1. **users** (Usuarios de la plataforma)
   - `id`: UUID (Primary Key, nativo de PostgreSQL `uuid_generate_v4()`)
   - `nombre`: VARCHAR(150) NOT NULL
   - `email`: VARCHAR(150) UNIQUE NOT NULL
   - `password_hash`: VARCHAR(255) NOT NULL
   - `rol`: VARCHAR(50) NOT NULL CHECK (rol IN ('CLIENTE', 'OPERARIO', 'ADMIN'))
   - `telefono`: VARCHAR(50)
   - `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   - `updated_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

2. **services** (Catálogo de servicios ofrecidos)
   - `id`: SERIAL (Primary Key)
   - `nombre`: VARCHAR(100) NOT NULL UNIQUE
   - `descripcion`: TEXT
   - `tarifa_base`: NUMERIC(10,2) NOT NULL
   - `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

3. **tickets** (Solicitudes de servicio / Trabajos)
   - `id`: UUID (Primary Key, nativo de PostgreSQL `uuid_generate_v4()`)
   - `cliente_id`: UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
   - `operario_id`: UUID REFERENCES users(id) ON DELETE SET NULL
   - `servicio_id`: INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT
   - `estado`: VARCHAR(50) NOT NULL DEFAULT 'CREADO' CHECK (estado IN ('CREADO', 'ASIGNADO', 'EN_CAMINO', 'EN_PROGRESO', 'FINALIZADO', 'CANCELADO'))
   - `direccion`: TEXT NOT NULL
   - `descripcion_problema`: TEXT NOT NULL
   - `precio_final`: NUMERIC(10,2)
   - `metodo_pago`: VARCHAR(50) CHECK (metodo_pago IN ('EFECTIVO', 'QR', 'TRANSFERENCIA'))
   - `evidencia_url`: TEXT
   - `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   - `updated_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

## Máquina de Estados de los Tickets
1. `CREADO`: Ticket creado por el cliente, disponible en la bolsa de trabajo para operarios.
2. `ASIGNADO`: El operario aceptó el trabajo (mecanismo de concurrencia para evitar doble asignación).
3. `EN_CAMINO`: El operario se dirige al domicilio.
4. `EN_PROGRESO`: El operario comenzó el trabajo en el domicilio.
5. `FINALIZADO`: Trabajo completado con evidencia y método de pago registrado.
6. `CANCELADO`: Cancelado por el cliente o admin.
