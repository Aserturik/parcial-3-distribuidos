const express = require('express');
const mongoose = require('mongoose');
const bookingRoutes = require('./routes/bookingRoutes');

// Inicializar app
const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/clinic';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/', bookingRoutes);

// Ruta para verificar estado del servicio
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-service' });
});

// Conexión a MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Conectado a MongoDB');
    
    // Iniciar servidor una vez conectado a MongoDB
    app.listen(PORT, () => {
      console.log(`API service escuchando en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  });

// Manejar errores de cierre
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Conexión MongoDB cerrada');
  process.exit(0);
});