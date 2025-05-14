# Sistema de Gestión de Citas Médicas

Este proyecto implementa un sistema distribuido para la gestión de citas médicas en una clínica online, utilizando RabbitMQ para procesamiento asíncrono de solicitudes y notificaciones.

## Arquitectura del Sistema

El sistema está compuesto por los siguientes componentes

### Servicios

1. **API REST (api-service)**
   - Proporciona endpoints para crear y consultar reservas
   - Almacena las reservas en MongoDB
   - Publica mensajes a RabbitMQ para procesamiento asíncrono

2. **Worker de Procesamiento (booking-worker)**
   - Consume mensajes de la cola `booking_requests`
   - Simula la verificación de disponibilidad médica (2-5 segundos)
   - Actualiza el estado de la reserva (confirmed/rejected)
   - Publica notificaciones de cambio de estado

3. **Worker de Notificaciones (notification-worker)**
   - Suscrito al exchange `booking_notifications`
   - Simula el envío de emails a los pacientes
   - Procesa las notificaciones de cambios de estado

4. **Base de Datos (MongoDB)**
   - Almacena información de las reservas
   - Mantiene el estado actual de cada reserva

5. **RabbitMQ**
   - Gestiona colas de trabajo
   - Implementa patrón de publicación/suscripción para notificaciones

## Decisiones Arquitectónicas

### 1. Colas vs. Exchange

- **Cola `booking_requests`**: Utiliza patrón Work Queues para distribuir el procesamiento de reservas entre múltiples workers.
- **Exchange `booking_notifications` (fanout)**: Permite que múltiples servicios (email, SMS, etc.) reciban la misma notificación sin duplicar el procesamiento.

### 2. Política de Reintentos

- **Workers**: Implementación de reintentos con backoff exponencial:
  - Cola de reintentos `booking_retry` con dead-letter exchange
  - Máximo 3 intentos configurables por variable de entorno
  - TTL de 10 segundos antes de reintento

- **Conexión a RabbitMQ**:
  - Mecanismo de reconexión automática con reintentos
  - Manejo de eventos de desconexión

### 3. Almacenamiento de Estado

- **MongoDB**: Elegido por:
  - Esquema flexible para evolución del modelo de datos
  - Escalabilidad horizontal
  - Operaciones atómicas para actualizar estados
  - Persistencia para garantizar consistencia en caso de fallos

### 4. Tolerancia a Fallos

- **Mensajes Durables**: Los mensajes persisten incluso si RabbitMQ se reinicia
- **Confirmaciones Manuales**: Garantizan que un mensaje se procesa correctamente antes de eliminarlo
- **Reconexión Automática**: Todos los servicios implementan reconexión automática
- **Volúmenes Persistentes**: Para mantener los datos en caso de reinicio de contenedores
- **Restart: Always**: Configuración de Docker para reiniciar los contenedores automáticamente

## API REST

### Endpoints

1. **POST /book**
   - Crear una nueva reserva
   - Body: `{ "patientName": "Nombre", "patientEmail": "correo@ejemplo.com", "date": "2023-05-21T14:30:00Z" }`
   - Respuesta: `{ "booking": { "id": "...", "status": "pending", ... } }`

2. **GET /booking/{id}**
   - Consultar estado de una reserva
   - Respuesta: `{ "id": "...", "status": "pending|confirmed|rejected", ... }`
3. **GET /bookings/**
   - Consulta todas las reservas
   - Respuesta: `{ "id": "...", "status": "pending|confirmed|rejected", ... }`

## Ejecución del Sistema

```bash
# Iniciar todos los servicios
docker-compose up -d
```

## Pruebas del Sistema

1. Crear una reserva:
```bash
curl -X POST http://localhost:3000/book \
  -H "Content-Type: application/json" \
  -d '{"patientName":"Juan Pérez","patientEmail":"juan@example.com","date":"2023-06-15T10:30:00Z"}'
```

1. Consultar estado:
```bash
curl http://localhost:3000/booking/{id}
```

```bash
curl http://localhost:3000/bookings/
```