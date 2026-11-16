# Contexto del Proyecto: Plataforma de Oficios (MVP)
Nombre del Servicio: `Core-Service`

## 1. Visión General
Este es el backend (Monolito Modular) para una plataforma multilateral que conecta a Clientes con Operarios de oficios (plomería, electricidad, etc.). 
El foco crítico del sistema es manejar correctamente la concurrencia y la máquina de estados de un "Ticket" de servicio.
a
## 2. Stack Tecnológicos
*   **Lenguaje:** Go (Golang)
*   **Base de Datos:** PostgreSQL
*   **Arquitectura:** Clean Architecture + Domain-Driven Design (DDD)
*   **Infraestructura:** Docker / Docker Compose

## 3. Máquina de Estados (El Core)
El ciclo de vida estricto de un Ticket es:
1. `CREADO` (El cliente lo solicita).
2. `ASIGNADO` (Un operario lo acepta. *Requiere concurrencia segura/Locks en base de datos*).
3. `EN_CAMINO` (El operario se dirige al domicilio).
4. `EN_PROGRESO` (El operario llegó y está trabajando).
5. `FINALIZADO` (Trabajo terminado, precio final definido, foto adjuntada).
6. `PAGADO` / `CANCELADO` (Estados finales).

## 4. Estructura de Base de Datos (PostgreSQL)
*   **USUARIOS:** `id` (UUID), `email`, `password_hash`, `nombre`, `telefono`, `rol` (CLIENTE, ADMIN).
*   **OPERARIOS:** `id` (UUID), `usuario_id` (FK 1:1), `estado_disponibilidad`, `calificacion_promedio`.
*   **SERVICIOS:** `id` (INT), `nombre`, `tarifa_base`, `activo`.
*   **TICKETS:** `id` (UUID), `cliente_id` (FK), `operario_id` (FK, Nullable al inicio), `servicio_id` (FK), `estado`, `direccion`, `descripcion_problema`, `precio_final` (Nullable).
*   **HISTORIAL_ESTADOS:** `id` (UUID), `ticket_id` (FK), `estado_anterior`, `estado_nuevo`, `cambiado_por` (FK), `created_at`.
*   **PAGOS:** `id` (UUID), `ticket_id` (FK), `monto`, `metodo_pago`, `estado`.

## 5. Reglas de Arquitectura Estrictas
1. Todo el código de negocio vive en `internal/` separado por dominios (ej. `internal/ticket`, `internal/user`).
2. Capas de cada dominio: `domain` (entidades), `usecase` (lógica), `infrastructure` (SQL/DB), `delivery` (REST Handlers).
3. No se utilizan ORMs mágicos pesados. Las consultas SQL (especialmente el manejo del estado ASIGNADO) deben ser explícitas para controlar bloqueos (Row-level locks).