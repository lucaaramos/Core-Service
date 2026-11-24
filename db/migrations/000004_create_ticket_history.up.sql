-- Tabla de Auditoría de Estados de Tickets (ticket_history)
CREATE TABLE IF NOT EXISTS ticket_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(30),
    estado_nuevo VARCHAR(30) NOT NULL,
    usuario_id UUID NOT NULL REFERENCES users(id),
    motivo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice compuesto para consultar la línea de tiempo cronológica de un ticket
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id_created_at
    ON ticket_history(ticket_id, created_at ASC);
