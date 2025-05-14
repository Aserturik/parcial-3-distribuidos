const express = require('express');
const bookingController = require('../controllers/bookingController');

const router = express.Router();

// Ruta para crear una reserva
router.post('/book', bookingController.createBooking);

// Ruta para obtener estado de una reserva
router.get('/booking/:id', bookingController.getBooking);

// Ruta para listar todas las reservas
router.get('/bookings', bookingController.listBookings);

module.exports = router;