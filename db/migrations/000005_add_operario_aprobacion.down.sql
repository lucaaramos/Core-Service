DROP INDEX IF EXISTS idx_users_rol_estado_aprobacion;
ALTER TABLE users DROP COLUMN IF EXISTS estado_aprobacion;
