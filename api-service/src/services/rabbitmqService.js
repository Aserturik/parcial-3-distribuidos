const amqplib = require('amqplib');

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.connectPromise = null;
    this.connectionUrl = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
  }

  async connect() {
    if (this.connection) {
      return { connection: this.connection, channel: this.channel };
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise(async (resolve, reject) => {
      try {
        console.log('Conectando a RabbitMQ...');
        
        // Intentar conectar con reintentos
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
          try {
            this.connection = await amqplib.connect(this.connectionUrl);
            break;
          } catch (err) {
            attempts++;
            if (attempts >= maxAttempts) throw err;
            console.log(`Intento de conexión ${attempts} fallido. Reintentando en 5 segundos...`);
            await new Promise(r => setTimeout(r, 5000));
          }
        }

        // Configurar manejo de errores y reconexión
        this.connection.on('error', err => {
          console.error('Error en conexión RabbitMQ:', err);
          this.connection = null;
          this.channel = null;
          this.connectPromise = null;
          setTimeout(() => this.connect(), 5000);
        });

        this.connection.on('close', () => {
          console.log('Conexión RabbitMQ cerrada. Reconectando...');
          this.connection = null;
          this.channel = null;
          this.connectPromise = null;
          setTimeout(() => this.connect(), 5000);
        });

        // Crear canal
        this.channel = await this.connection.createChannel();
        
        // Asegurar que exista la cola para procesamiento de citas
        await this.channel.assertQueue('booking_requests', { 
          durable: true 
        });
        
        // Asegurar que existe el exchange para notificaciones
        await this.channel.assertExchange('booking_notifications', 'fanout', {
          durable: true
        });

        console.log('Conectado a RabbitMQ con éxito');
        
        resolve({ connection: this.connection, channel: this.channel });
      } catch (error) {
        console.error('Error al conectar con RabbitMQ:', error);
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  async publishBookingRequest(booking) {
    try {
      await this.connect();
      
      return this.channel.sendToQueue(
        'booking_requests',
        Buffer.from(JSON.stringify(booking)),
        { 
          persistent: true,
          messageId: booking._id.toString()
        }
      );
    } catch (error) {
      console.error('Error al publicar mensaje:', error);
      throw error;
    }
  }
}

module.exports = new RabbitMQService();