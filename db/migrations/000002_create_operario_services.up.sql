-- Tabla intermedia de especialidades por operario (operario_services)
CREATE TABLE IF NOT EXISTS operario_services (
    operario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    servicio_id INT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (operario_id, servicio_id)
);

-- Índice en servicio_id para optimizar el filtrado de tickets disponibles
CREATE INDEX IF NOT EXISTS idx_operario_services_servicio_id ON operario_services(servicio_id);
