-- Tabla de Calificaciones y Reseñas de Tickets (ticket_reviews)
CREATE TABLE IF NOT EXISTS ticket_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES users(id),
    operario_id UUID NOT NULL REFERENCES users(id),
    puntuacion INT NOT NULL CHECK (puntuacion >= 1 AND puntuacion <= 5),
    comentario TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para acelerar el cálculo de promedio y listado de reseñas por operario
CREATE INDEX IF NOT EXISTS idx_ticket_reviews_operario_id ON ticket_reviews(operario_id);
