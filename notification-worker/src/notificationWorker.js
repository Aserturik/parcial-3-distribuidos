const amqplib = require('amqplib');

// Configuración
const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';

// Simula el envío de email (solo imprime en consola)
function simulateEmailSending(notification) {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log('\n========== SIMULACIÓN DE EMAIL ==========');
      console.log(`Para: ${notification.patientEmail || 'cliente@ejemplo.com'}`);
      console.log(`Asunto: Actualización de su cita médica`);
      console.log(`Cuerpo: Estimado/a ${notification.patientName || 'paciente'},\n`);
      
      if (notification.status === 'confirmed') {
        console.log(`Su cita para el ${new Date(notification.date).toLocaleString()} ha sido CONFIRMADA.`);
        console.log('Por favor, llegue 15 minutos antes de la hora programada.');
      } else {
        console.log(`Lamentamos informarle que su cita para el ${new Date(notification.date).toLocaleString()} ha sido RECHAZADA.`);
        console.log('Por favor, intente reservar en otro horario disponible.');
      }
      
      console.log('\nGracias por confiar en nuestra clínica.');
      console.log('=======================================\n');
      
      resolve();
    }, 1000); // Simula 1 segundo de retraso para envío
  });
}

// Función principal del notification worker
async function start() {
  let connection;
  let channel;
  
  try {
    // Conectar a RabbitMQ con reintentos
    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        console.log(`Conectando a RabbitMQ (intento ${attempts + 1})...`);
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
    
    // Configurar exchange para notificaciones
    await channel.assertExchange('booking_notifications', 'fanout', { durable: true });
    
    // Crear cola para este consumidor
    const { queue } = await channel.assertQueue('email_notifications', {
      durable: true
    });
    
    // Vincular cola al exchange
    await channel.bindQueue(queue, 'booking_notifications', '');
    
    console.log('Worker de notificaciones listo y esperando mensajes...');
    
    // Consumir notificaciones
    channel.consume(queue, async (msg) => {
      if (!msg) return;
      
      try {
        const notification = JSON.parse(msg.content.toString());
        console.log(`[*] Notificación recibida para reserva ID: ${notification.bookingId}`);
        
        // Simular envío de email
        await simulateEmailSending(notification);
        
        // Confirmar mensaje procesado
        channel.ack(msg);
        
      } catch (err) {
        console.error('Error procesando notificación:', err);
        // Rechazar mensaje para volver a intentarlo
        channel.nack(msg, false, true);
      }
    });
    
  } catch (err) {
    console.error('Error crítico en el worker de notificaciones:', err);
    
    // Intentar cerrar conexiones
    if (channel) try { await channel.close(); } catch (e) {}
    if (connection) try { await connection.close(); } catch (e) {}
    
    // Reiniciar después de un delay
    setTimeout(start, 10000);
  }
}

// Iniciar worker
start();