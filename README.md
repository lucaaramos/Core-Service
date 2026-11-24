# Core-Service — Plataforma de Oficios

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![Fiber](https://img.shields.io/badge/Fiber-v2-00ACD7?logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3_Management-FF6600?logo=rabbitmq&logoColor=white)
![AWS S3](https://img.shields.io/badge/LocalStack-S3-56C0A7?logo=amazonaws&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Alpine-009639?logo=nginx&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

Plataforma multi-actor integral para la gestión y contratación de servicios del hogar y oficios (plomería, electricidad, gas, cerrajería, etc.). Conecta **Clientes** que solicitan servicios con **Operarios / Técnicos** calificados y **Administradores**, garantizando trazabilidad, auditoría de estados, calificación por reputación, asignación atómica sin condiciones de carrera y arquitectura orientada a eventos.

---

## Stack Tecnológico

* **Backend (`core-service`):**
  * **Lenguaje & Framework:** Go 1.26, Fiber v2.
  * **Persistencia:** PostgreSQL 15 con `database/sql` y driver `lib/pq` (consultas SQL explícitas sin ORMs pesados).
  * **Migraciones de Base de Datos:** `golang-migrate` (`migrate/migrate:v4.18.3`).
  * **Seguridad & Autenticación:** Tokens JWT firmados con algoritmo `HS256` (`golang-jwt/jwt/v5`) y contraseñas hasheadas con `bcrypt`.
  * **Almacenamiento de Evidencias:** AWS SDK for Go v2 (`aws-sdk-go-v2/service/s3`) para generación de Presigned URLs seguras.
  * **Mensajería & Eventos:** `amqp091-go` con reconexión resiliente a RabbitMQ.
* **Frontend (`frontend/`):**
  * **Librerías principales:** React 19, Vite 8, TypeScript, React Router v7.
  * **Estilos:** Tailwind CSS v4, Heroicons / Lucide React.
  * **Servidor Web:** Nginx Alpine para servir la SPA en producción.
* **Infraestructura & Contenedores:**
  * **Docker Compose:** Orquestación multicontenedor completa.
  * **LocalStack 4.14.0:** Emulador local de AWS S3 para subida y visualización directa de evidencias.
  * **RabbitMQ 3 Management:** Broker de mensajería AMQP y consola de monitoreo web.
  * **Worker Consumidor (`cmd/worker`):** Proceso Go en segundo plano desacoplado del ciclo HTTP para el procesamiento de notificaciones y eventos.

---

## Arquitectura del Sistema

El sistema implementa una arquitectura desacoplada donde las operaciones transaccionales críticas se resuelven en la base de datos relacional de forma atómica, los archivos binarios pesados (fotos) se delegan al almacenamiento de objetos sin sobrecargar el backend, y las notificaciones se despachan asíncronamente mediante colas de mensajería.

```text
                      ┌────────────────────────────────────────┐
                      │          Navegador Web / SPA           │
                      │         (React 19 + TypeScript)        │
                      └───────────┬───────────────┬────────────┘
                                  │               │
     1. Peticiones HTTP / REST    │               │ 3. Subida directa de fotos (PUT)
     (JWT Bearer, CRUD, etc.)     │               │    usando S3 Presigned URL
                                  ▼               ▼
                      ┌──────────────────────┐  ┌─────────────────────────┐
                      │   Frontend (Nginx)   │  │   LocalStack (S3 Mock)  │
                      │   Puerto 3000 -> 80  │  │   Puerto 4566           │
                      └──────────┬───────────┘  │   Bucket: 'evidencias'  │
                                 │              └─────────────────────────┘
                                 │ HTTP Proxy / Direct API
                                 ▼
                      ┌────────────────────────────────────────┐
                      │       core-service (API Go/Fiber)      │
                      │               Puerto 8080              │
                      └──────────┬──────────────────┬──────────┘
                                 │                  │
        2. Consultas SQL / Trans.│                  │ 4. Publicación AMQP
           (lib/pq atómico)      │                  │    Exchange: tickets.events
                                 ▼                  ▼
                      ┌──────────────────────┐  ┌─────────────────────────┐
                      │     PostgreSQL 15    │  │   RabbitMQ Management   │
                      │       Puerto 5432    │  │   Puertos 5672 / 15672  │
                      └──────────────────────┘  └───────────┬─────────────┘
                                                            │
                                                            │ 5. Consumo de eventos
                                                            │    (ticket.created, etc.)
                                                            ▼
                                                ┌─────────────────────────┐
                                                │  core_worker (Go Worker)│
                                                │  Simulación de Emails   │
                                                └─────────────────────────┘
```

---

## Estructura del Proyecto

```text
.
├── cmd/
│   ├── api/
│   │   └── main.go                 # Entrypoint de la API, cableado de dependencias y graceful shutdown
│   └── worker/
│       └── main.go                 # Entrypoint del worker consumidor de eventos de RabbitMQ
├── db/
│   └── migrations/                 # Migraciones SQL secuenciales (000001 a 000005)
│       ├── 000001_init_schema.up.sql / .down.sql           # Tablas users, services, tickets
│       ├── 000002_create_operario_services.up.sql / .down.sql # Especialidades por operario
│       ├── 000003_create_ticket_reviews.up.sql / .down.sql    # Calificaciones y reseñas
│       ├── 000004_create_ticket_history.up.sql / .down.sql    # Historial y auditoría de tickets
│       └── 000005_add_operario_aprobacion.up.sql / .down.sql  # Estado de aprobación de operarios
├── documents/
│   └── swagger.yml                 # Contrato OpenAPI 3.0.3 (v1.9.0)
├── frontend/                       # Aplicación SPA en React 19 + TypeScript + Tailwind CSS v4
│   ├── src/
│   │   ├── api/                    # Cliente HTTP tipado (auth, tickets, services, reviews, history, admin)
│   │   ├── components/             # Navbar, StatusBadge, ProtectedRoute, Modales, etc.
│   │   ├── context/                # AuthContext y gestión de sesión JWT
│   │   ├── pages/                  # Login, Registro, Perfil, Dashboards (Cliente, Operario, Admin)
│   │   ├── types/                  # Modelos y contratos TypeScript sincronizados con OpenAPI
│   │   └── utils/                  # Formateadores de moneda/fecha y decodificación de JWT
│   ├── Dockerfile                  # Compilación multi-stage (Node 20 -> Nginx Alpine)
│   └── nginx.conf                  # SPA fallback, compresión gzip y caché de estáticos
├── internal/
│   ├── auth/                       # Dominio de usuario: registro, login, perfil y aprobación admin
│   ├── config/                     # Carga centralizada de variables de entorno y validación CORS
│   ├── messaging/                  # Cliente RabbitMQ: conexión resiliente, publicación y consumo
│   ├── middleware/                 # Middlewares HTTP de Fiber (JWTProtected, RequireRole)
│   ├── service/                    # Dominio y catálogo de servicios (ABM y tarifas)
│   ├── storage/                    # Adaptador S3 (AWS SDK v2) para Presigned URLs de evidencias
│   └── ticket/                     # Dominio de tickets: bolsa, asignación, estados, reseñas e historial
├── scripts/
│   └── init-s3.sh                  # Inicialización automática del bucket S3 y CORS en LocalStack
├── tests/
│   └── test_concurrence.js         # Script para verificar asignación atómica bajo concurrencia
├── Dockerfile                      # Multi-stage Go build con targets para `api` y `worker`
├── docker-compose.yml              # Orquestación de contenedores (postgres, localstack, rabbitmq, api, worker, frontend)
└── .env.example                    # Plantilla de variables de entorno
```

---

## Funcionalidades Implementadas

### 1. Seguridad y Concurrencia
* **Autenticación & RBAC:** Tokens JWT (`HS256`, 24h de validez) con verificación de roles (`CLIENTE`, `OPERARIO`, `ADMIN`) mediante middlewares de Fiber.
* **Mitigación Anti-IDOR:** Los casos de uso validan la pertenencia del ticket antes de devolver detalles o permitir transiciones de estado, limitando la visibilidad al cliente dueño, operario asignado o administradores.
* **Asignación Atómica Concurrente:** Mecanismo a nivel de base de datos (`UPDATE ... WHERE id = $3 AND estado = 'CREADO'`). Si múltiples operarios intentan tomar el mismo trabajo al mismo milisegundo, PostgreSQL garantiza un único ganador (`200 OK`) y devuelve `409 Conflict` a los demás sin condiciones de carrera.
* **Perfil de Usuario (`/users/me`):** Consulta y actualización de datos personales (`nombre`, `telefono`), y cambio seguro de contraseña (`PATCH /users/me/password`) con validación de contraseña actual y nuevo hashing bcrypt.

### 2. Flujo Cliente
* **Creación de Solicitudes:** Formulario para publicar tickets indicando servicio, descripción y dirección del trabajo.
* **Seguimiento en Tiempo Real:** Visualización del ciclo de vida del ticket (`CREADO`, `ASIGNADO`, `EN_CAMINO`, `EN_PROGRESO`, `FINALIZADO`, `CANCELADO`).
* **Cancelación Justificada:** Opción para cancelar tickets activos enviando un motivo opcional.
* **Visualización de Evidencias:** Galería fotográfica integrada para auditar las fotos de trabajo terminado almacenadas en S3.
* **Calificaciones y Reseñas:** Los clientes pueden calificar tickets finalizados (1 a 5 estrellas con comentario). El sistema garantiza mediante restricción `UNIQUE (ticket_id)` que solo exista una reseña por servicio.

### 3. Flujo Operario
* **Registro & Aprobación:** Al registrarse como `OPERARIO`, la cuenta se inicializa en estado `PENDIENTE`.
* **Configuración de Especialidades:** Selección interactiva de los oficios que realiza (`operario_services`), editable en cualquier momento desde su panel.
* **Bolsa de Trabajo Filtrada:** La bolsa (`GET /api/v1/tickets/disponibles`) filtra automáticamente los tickets disponibles según las especialidades del operario autenticado. Requiere que el operario esté en estado `APROBADO`.
* **Ciclo de Estados Operativo:** Avance de estados del trabajo (`ASIGNADO` → `EN_CAMINO` → `EN_PROGRESO`).
* **Carga de Evidencia Fotográfica:** Generación de Presigned URLs de S3 (`POST /api/v1/tickets/:id/evidencia-url`) y subida directa (HTTP `PUT`) desde el navegador a LocalStack antes de finalizar.
* **Cierre de Ticket:** Registro de precio final, método de pago y URL de evidencia fotográfica.
* **Reputación y Reseñas:** Consulta pública y privada de la puntuación promedio del operario y lista de comentarios recibidos de clientes anteriores.

### 4. Panel de Administración
* **Métricas Globales:** Indicadores clave de desempeño (KPIs), ingresos brutos acumulados y total de tickets según su estado.
* **Auditoría e Historial (`ticket_history`):** Registro inmutable y atómico de cada cambio de estado (quién lo cambió, rol, fecha, estado anterior, estado nuevo y motivo de transición), visualizable en una línea de tiempo cronológica.
* **ABM de Catálogo de Servicios:** Creación, edición y eliminación de servicios. La eliminación está protegida contra violaciones de clave foránea (`409 Conflict`) si existen tickets o especialidades asociadas.
* **Aprobación de Operarios:** Módulo para auditar operarios registrados, con la posibilidad de aprobar (`APROBADO`) o rechazar (`RECHAZADO`) su solicitud de ingreso a la plataforma.

### 5. Arquitectura Orientada a Eventos (EDA)
* **Publicación Asíncrona:** Publicación de eventos de dominio (`ticket.created`, `ticket.assigned`, `ticket.finished`) hacia el exchange `tickets.events` en RabbitMQ, ejecutada en goroutines no bloqueantes para no demorar la respuesta HTTP al usuario.
* **Reconexión Resiliente:** El cliente AMQP interno monitorea la conexión y reconecta automáticamente en caso de interrupción del broker.
* **Worker Desacoplado (`core_worker`):** Proceso Go en segundo plano que consume los eventos y simula el envío de notificaciones por correo electrónico a clientes y operarios según la etapa del ticket.

---

## Servicios y Puertos (Docker Compose)

| Servicio | Nombre Contenedor | Imagen / Dockerfile | Puertos (Host:Contenedor) | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| **frontend** | `core_frontend` | `./frontend/Dockerfile` | `3000:80` | Aplicación SPA React 19 servida por Nginx Alpine |
| **api** | `core_api` | `./Dockerfile` (target: api) | `8080:8080` | Servidor backend REST en Go (Fiber v2) |
| **worker** | `core_worker` | `./Dockerfile` (target: worker) | *(Interno — sin puerto)* | Worker en Go consumidor de eventos de RabbitMQ |
| **postgres** | `core_postgres` | `postgres:15-alpine` | `5432:5432` | Base de datos relacional con volumen persistente |
| **migrate** | `core_migrate` | `migrate/migrate:v4.18.3` | *(Termina al aplicar)* | Aplica migraciones secuenciales en `db/migrations/` |
| **localstack** | `core_localstack` | `localstack/localstack:4.14.0` | `4566:4566` | Emulador S3 local (almacenamiento de fotos de evidencia) |
| **rabbitmq** | `core_rabbitmq` | `rabbitmq:3-management-alpine` | `5672:5672`<br>`15672:15672` | Broker AMQP y panel de gestión web RabbitMQ Management |

---

## Variables de Entorno

El archivo [`.env.example`](.env.example) incluye la configuración predeterminada lista para desarrollo local:

| Variable | Descripción | Valor por Defecto Local |
| :--- | :--- | :--- |
| `PORT` | Puerto interno en el que escucha el servidor Go | `8080` |
| `API_PORT` | Puerto del host mapeado al servicio `api` en Docker Compose | `8080` |
| `JWT_SECRET` | Secreto criptográfico para firma y verificación de tokens `HS256` |  |
| `CORS_ALLOW_ORIGINS` | Orígenes web autorizados por CORS (separados por coma) | `http://localhost:3000,http://localhost:5173` |
| `VITE_API_URL` | URL base de la API consumida desde el navegador del cliente | `http://localhost:8080/api/v1` |
| `POSTGRES_USER` | Usuario de PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `cambia_esta_password` |
| `POSTGRES_DB` | Nombre de la base de datos de la plataforma | `core_service_db` |
| `POSTGRES_PORT` | Puerto del host expuesto para PostgreSQL | `5432` |
| `POSTGRES_HOST` | Host de base de datos cuando se corre Go fuera de Docker | `localhost` |
| `DATABASE_URL` | Cadena de conexión DSN para ejecución local fuera de Docker | `postgres://postgres:cambia_esta_password@localhost:5432/core_service_db?sslmode=disable` |
| `S3_PUBLIC_ENDPOINT` | Endpoint público de S3 accesible desde el navegador web | `http://localhost:4566` |
| `S3_REGION` | Región simulada de AWS S3 | `us-east-1` |
| `S3_BUCKET` | Nombre del bucket S3 para fotos y evidencias | `evidencias` |
| `S3_ACCESS_KEY` | Credencial Access Key de S3 (LocalStack) | `test` |
| `S3_SECRET_KEY` | Credencial Secret Key de S3 (LocalStack) | `test` |
| `RABBITMQ_USER` | Usuario administrativo del broker RabbitMQ | `guest` |
| `RABBITMQ_PASS` | Contraseña administrativa de RabbitMQ | `guest` |
| `RABBITMQ_URL` | URI de conexión AMQP usada por la API y el Worker | `amqp://guest:guest@rabbitmq:5672/` |
| `RABBITMQ_EXCHANGE` | Exchange de RabbitMQ donde se publican eventos de dominio | `tickets.events` |

---

## Guía de Inicio Rápido y Pruebas

### 1. Clonar y Configurar Entorno

```bash
git clone <URL_DEL_REPOSITORIO>
cd core-service
cp .env.example .env
```

### 2. Iniciar la Plataforma Completa

```bash
docker compose up --build -d
```

Este comando levanta los 7 servicios de forma ordenada, aplicando migraciones en PostgreSQL, creando el bucket `evidencias` en LocalStack con reglas CORS permisivas y levantando el broker RabbitMQ junto con la API, el Worker y la SPA.

### 3. Carga Inicial de Catálogo de Servicios (Seed)

Para poblar el catálogo de oficios iniciales en la base de datos, ejecutá:

```bash
docker exec -i core_postgres psql -U postgres -d core_service_db << 'EOF'
INSERT INTO services (nombre, descripcion, tarifa_base) VALUES
  ('Plomería', 'Reparación de cañerías, pérdidas e instalaciones sanitarias', 18000.00),
  ('Electricidad', 'Instalaciones eléctricas, tableros y cortocircuitos', 22000.00),
  ('Gasista Matriculado', 'Revisión de artefactos, pérdidas y habilitaciones', 25000.00),
  ('Cerrajería', 'Apertura de puertas y cambio de combinaciones', 15000.00),
  ('Pintura', 'Pintura de interiores y exteriores', 12000.00)
ON CONFLICT (nombre) DO NOTHING;
EOF
```

### 4. Usuarios de Prueba y Aprobación de Operarios

El endpoint público de registro permite crear usuarios con rol `CLIENTE` u `OPERARIO`.

1. **Crear un Cliente:**
   * Registrate desde la UI en `http://localhost:3000/register` con rol **Cliente** (ej: `cliente@example.com`).
   * Podrás ingresar de inmediato, crear solicitudes de servicio y calificar tickets completados.

2. **Crear un Operario (Técnico):**
   * Registrate en `http://localhost:3000/register` con rol **Operario** (ej: `operario@example.com`).
   * **Importante:** Todo nuevo operario se crea con `estado_aprobacion = 'PENDIENTE'`. En este estado no podrá acceder a la bolsa de trabajo ni aceptar tickets hasta ser aprobado por un Administrador.

3. **Crear / Promover un Administrador:**
   * Registrá un usuario estándar (ej: `admin@example.com`).
   * Promové su cuenta a `ADMIN` directamente en PostgreSQL:

   ```bash
   docker exec -it core_postgres psql -U postgres -d core_service_db \
     -c "UPDATE users SET rol = 'ADMIN' WHERE email = 'admin@example.com';"
   ```

   * Cerrá sesión y volvé a ingresar para obtener el JWT con rol de administrador.

4. **Flujo de Aprobación de Operarios (Admin):**
   * Ingresá con la cuenta `ADMIN` a [http://localhost:3000/admin](http://localhost:3000/admin).
   * Abrí la pestaña **"Operarios"**.
   * Localizá al operario pendiente y hacé clic en **"Aprobar"** (o utilizá `PATCH /api/v1/admin/operarios/:id/aprobacion` con `{"estado_aprobacion": "APROBADO"}`).
   * Ahora el operario podrá ingresar a su panel, seleccionar sus oficios en **"Mis Especialidades"** y comenzar a tomar tickets de la **Bolsa de Trabajo**.

---

## Enlaces y URLs de Acceso

| Servicio | URL | Credenciales / Notas |
| :--- | :--- | :--- |
| **Frontend Web (SPA)** | [http://localhost:3000](http://localhost:3000) | Aplicación principal para Clientes, Operarios y Administradores |
| **API REST Base** | `http://localhost:8080/api/v1` | Endpoints protegidos mediante Bearer JWT |
| **Healthcheck API** | [http://localhost:8080/health](http://localhost:8080/health) | Chequeo de estado HTTP (`{"status":"UP"}`) |
| **RabbitMQ Management UI** | [http://localhost:15672](http://localhost:15672) | Usuario: `guest` \| Contraseña: `guest` |
| **LocalStack S3 Endpoint** | `http://localhost:4566` | Bucket: `evidencias` |

---

## Comandos Útiles de Inspección y Monitoreo

```bash
# Ver estado y salud de todos los contenedores
docker compose ps

# Ver logs de la API Go en tiempo real
docker compose logs -f api

# Ver logs del worker de notificaciones RabbitMQ en tiempo real
docker compose logs -f worker

# Ver logs del broker RabbitMQ
docker compose logs -f rabbitmq

# Inspeccionar logs de LocalStack S3
docker compose logs -f localstack

# Listar el contenido del bucket S3 de evidencias en LocalStack
docker exec -it core_localstack awslocal s3 ls s3://evidencias

# Detener los contenedores conservando los datos de PostgreSQL y S3
docker compose down

# Reiniciar desde cero (eliminando volúmenes de base de datos y colas)
docker compose down -v
```

---

## Contrato de API (OpenAPI 1.9.0)

La especificación completa en formato OpenAPI 3.0.3 se encuentra en [`documents/swagger.yml`](documents/swagger.yml).

| Método | Endpoint | Roles Permitidos | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Verificación de disponibilidad de la API. |
| `POST` | `/api/v1/auth/register` | Público | Registro de nuevos usuarios (`CLIENTE` o `OPERARIO` en estado `PENDIENTE`). |
| `POST` | `/api/v1/auth/login` | Público | Autenticación y emisión de token JWT. |
| `GET` | `/api/v1/users/me` | Autenticado | Obtiene los datos del perfil del usuario autenticado. |
| `PATCH` | `/api/v1/users/me` | Autenticado | Actualiza nombre y teléfono del usuario autenticado. |
| `PATCH` | `/api/v1/users/me/password` | Autenticado | Actualiza la contraseña previa verificación de la actual con bcrypt. |
| `GET` | `/api/v1/admin/operarios` | `ADMIN` | Lista todos los operarios con su estado de aprobación. |
| `PATCH` | `/api/v1/admin/operarios/{id}/aprobacion`| `ADMIN` | Aprueba o rechaza a un operario (`PENDIENTE`, `APROBADO`, `RECHAZADO`). |
| `GET` | `/api/v1/services` | Autenticado | Consulta el catálogo de servicios con tarifas base. |
| `POST` | `/api/v1/services` | `ADMIN` | Crea un nuevo servicio en el catálogo (`409` si el nombre ya existe). |
| `PATCH` | `/api/v1/services/{id}` | `ADMIN` | Modifica nombre, descripción o tarifa de un servicio existente. |
| `DELETE`| `/api/v1/services/{id}` | `ADMIN` | Elimina un servicio (`409` si tiene tickets o especialidades asociadas). |
| `GET` | `/api/v1/operarios/me/servicios` | `OPERARIO` | Lista las especialidades configuradas por el operario autenticado. |
| `PUT` | `/api/v1/operarios/me/servicios` | `OPERARIO` | Actualiza en bloque las especialidades/oficios del operario autenticado. |
| `POST` | `/api/v1/tickets` | `CLIENTE` | Crea una nueva solicitud de servicio en estado `CREADO`. |
| `GET` | `/api/v1/tickets` | Autenticado | Lista tickets visibles según el rol del usuario (soporta `?estado=`). |
| `GET` | `/api/v1/tickets/disponibles` | `OPERARIO` (`APROBADO`) | Bolsa de trabajo filtrada automáticamente por las especialidades del operario. |
| `GET` | `/api/v1/tickets/{id}` | Involucrados*, `ADMIN` | Retorna el detalle completo del ticket (*dueño o técnico asignado). |
| `PATCH` | `/api/v1/tickets/{id}/asignar` | `OPERARIO` (`APROBADO`) | Asignación atómica del ticket al operario (`409 Conflict` si ya fue tomado). |
| `PATCH` | `/api/v1/tickets/{id}/estado` | `OPERARIO`*, `ADMIN` | Avanza el estado operativo (`ASIGNADO` → `EN_CAMINO` → `EN_PROGRESO`). |
| `POST` | `/api/v1/tickets/{id}/evidencia-url` | `OPERARIO`* | Genera una Presigned URL de S3 para subir fotos de trabajo terminado. |
| `POST` | `/api/v1/tickets/{id}/finalizar` | `OPERARIO`* | Registra precio final, método de pago, evidencia y marca `FINALIZADO`. |
| `PATCH` | `/api/v1/tickets/{id}/cancelar` | Involucrados*, `ADMIN` | Cancela un ticket activo indicando un motivo opcional. |
| `POST` | `/api/v1/tickets/{id}/review` | `CLIENTE`* | Califica con 1 a 5 estrellas y reseña un ticket finalizado. |
| `GET` | `/api/v1/tickets/{id}/history` | `ADMIN` | Línea de tiempo con historial de auditoría de transiciones del ticket. |
| `GET` | `/api/v1/operarios/{id}/reviews`| Autenticado | Retorna el promedio de calificación y reseñas recibidas por un operario. |
