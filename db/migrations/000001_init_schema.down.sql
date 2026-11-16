-- Eliminar índices
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_tickets_estado;
DROP INDEX IF EXISTS idx_tickets_operario_id;
DROP INDEX IF EXISTS idx_tickets_cliente_id;

-- Eliminar tablas en orden inverso de dependencia por claves foráneas
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;

-- Deshabilitar extensiones si es deseado (opcional, normalmente se mantienen a nivel base de datos)
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";
