const amqplib = require('amqplib');
const mongoose = require('mongoose');

// Definir esquema y modelo para la reserva
const bookingSchema = new mongoose.Schema({
  patientName: String,
  patientEmail: String,
  date: Date,
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Booking = mongoose.model('Booking', bookingSchema);

// Configuración
const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://database:27017/clinic';
const MIN_DELAY_MS = parseInt(process.env.PROCESS_DELAY_MIN || '2000');
const MAX_DELAY_MS = parseInt(process.env.PROCESS_DELAY_MAX || '5000');
const MAX_RETRIES = parseInt(process.env.RETRY_ATTEMPTS || '3');

// Para simular disponibilidad (70% probabilidad de confirmar)
function simulateAvailability() {
  return Math.random() < 0.7;
}

// Para generar un retraso aleatorio entre MIN_DELAY_MS y MAX_DELAY_MS
function getRandomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

// Función principal del worker
async function start() {
  let connection;
  let channel;
  
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado a MongoDB');
    
    // Conectar a RabbitMQ con reintentos
    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        connection = await amqplib.connect(AMQP_URL);
        break;
      } catch (err) {
        console.log(`Intento ${attempts + 1} de conexión a RabbitMQ fallido. Reintentando en 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (!connection) {
      throw new Error('No se pudo conectar a RabbitMQ después de múltiples intentos');
    }
    
    console.log('Conectado a RabbitMQ');
    
    // Manejar desconexiones
    connection.on('error', (err) => {
      console.error('Error de conexión RabbitMQ:', err);
      setTimeout(start, 10000);
    });
    
    connection.on('close', () => {
      console.log('Conexión a RabbitMQ cerrada. Intentando reconectar...');
      setTimeout(start, 10000);
    });
    
    // Crear canal
    channel = await connection.createChannel();
    
    // Configurar colas
    await channel.assertQueue('booking_requests', { durable: true });
    await channel.assertQueue('booking_retry', { 
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'booking_requests',
        'x-message-ttl': 10000 // 10s antes de reintentar
      }
    });
    
    // Configurar exchange para notificaciones
    await channel.assertExchange('booking_notifications', 'fanout', { durable: true });
    
    // Configurar prefetch
    channel.prefetch(1);
    
    console.log('Worker listo y esperando mensajes...');
    
    // Consumir mensajes
    channel.consume('booking_requests', async (msg) => {
      if (!msg) return;
      
      try {
        console.log(`[*] Mensaje recibido: ${msg.content.toString()}`);
        const bookingData = JSON.parse(msg.content.toString());
        const bookingId = bookingData._id;
        
        // Verificar si la reserva existe en la BD
        const booking = await Booking.findById(bookingId);
        
        if (!booking) {
          console.log(`[!] Reserva ${bookingId} no encontrada`);
          channel.ack(msg);
          return;
        }
        
        // Verificar si ya fue procesada y confirmada/rechazada
        if (booking.status !== 'pending') {
          console.log(`[!] Reserva ${bookingId} ya procesada anteriormente (${booking.status})`);
          channel.ack(msg);
          return;
        }
        
        // Simular procesamiento con retraso
        const delay = getRandomDelay();
        console.log(`[*] Procesando reserva ${bookingId}, simulando delay de ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Simular decisión de disponibilidad
        const isAvailable = simulateAvailability();
        const newStatus = isAvailable ? 'confirmed' : 'rejected';
        
        // Actualizar estado en BD
        booking.status = newStatus;
        await booking.save();
        
        console.log(`[+] Reserva ${bookingId} ${newStatus}`);
        
        // Publicar notificación
        channel.publish('booking_notifications', '', 
          Buffer.from(JSON.stringify({
            bookingId: booking._id,
            patientName: booking.patientName,
            patientEmail: booking.patientEmail,
            status: newStatus,
            date: booking.date
          })),
          { persistent: true }
        );
        
        // Confirmar procesamiento exitoso
        channel.ack(msg);
        
      } catch (err) {
        console.error('Error procesando reserva:', err);
        
        // Manejar reintentos
        const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
        
        if (retryCount < MAX_RETRIES) {
          // Enviar a la cola de reintentos con contador actualizado
          channel.sendToQueue('booking_retry',
            Buffer.from(msg.content.toString()),
            { 
              persistent: true,
              headers: {
                'x-retry-count': retryCount + 1
              }
            }
          );
          console.log(`[!] Reintento ${retryCount + 1}/${MAX_RETRIES} programado`);
        } else {
          console.log(`[!] Máximo de reintentos alcanzado (${MAX_RETRIES}), descartando mensaje`);
          
          try {
            // Intentar marcar la reserva como fallida en la BD
            const bookingData = JSON.parse(msg.content.toString());
            await Booking.findByIdAndUpdate(
              bookingData._id, 
              { status: 'rejected', processingError: err.message },
              { new: true }
            );
            
            // Notificar error
            channel.publish('booking_notifications', '', 
              Buffer.from(JSON.stringify({
                bookingId: bookingData._id,
                status: 'rejected',
                error: 'Error de procesamiento después de múltiples intentos'
              })),
              { persistent: true }
            );
          } catch (updateErr) {
            console.error('Error actualizando estado de reserva fallida:', updateErr);
          }
        }
        
        // Confirmar mensaje procesado (aunque haya fallado)
        channel.ack(msg);
      }
    });
    
  } catch (err) {
    console.error('Error crítico en el worker:', err);
    
    // Intentar cerrar conexiones
    if (channel) try { await channel.close(); } catch (e) {}
    if (connection) try { await connection.close(); } catch (e) {}
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.connection.close(); } catch (e) {}
    }
    
    // Reiniciar después de un delay
    setTimeout(start, 10000);
  }
}

// Iniciar worker
start();