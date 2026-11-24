-- Agregar columna de estado de aprobación a la tabla users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS estado_aprobacion VARCHAR(20) NOT NULL DEFAULT 'APROBADO'
    CHECK (estado_aprobacion IN ('PENDIENTE', 'APROBADO', 'RECHAZADO'));

-- Índice compuesto para acelerar el listado y filtrado de operarios por estado de aprobación
CREATE INDEX IF NOT EXISTS idx_users_rol_estado_aprobacion
    ON users(rol, estado_aprobacion);
