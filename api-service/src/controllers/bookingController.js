const Booking = require('../models/booking');
const rabbitmqService = require('../services/rabbitmqService');

// Controlador para crear una nueva reserva
exports.createBooking = async (req, res) => {
  try {
    // Validar datos de entrada
    const { patientName, patientEmail, date } = req.body;
    
    if (!patientName || !patientEmail || !date) {
      return res.status(400).json({ 
        message: 'Los campos patientName, patientEmail y date son obligatorios' 
      });
    }
    
    // Crear nueva reserva en la base de datos
    const booking = new Booking({
      patientName,
      patientEmail,
      date: new Date(date),
      status: 'pending'
    });
    
    await booking.save();
    
    // Enviar a la cola para procesamiento asíncrono
    await rabbitmqService.publishBookingRequest(booking);
    
    res.status(201).json({
      message: 'Reserva creada exitosamente',
      booking: {
        id: booking._id,
        patientName: booking.patientName,
        date: booking.date,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Error al crear reserva:', error);
    res.status(500).json({ message: 'Error al procesar la solicitud' });
  }
};

// Controlador para obtener estado de una reserva
exports.getBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    
    res.status(200).json({
      id: booking._id,
      patientName: booking.patientName,
      patientEmail: booking.patientEmail,
      date: booking.date,
      status: booking.status,
      createdAt: booking.createdAt
    });
  } catch (error) {
    console.error('Error al obtener reserva:', error);
    res.status(500).json({ message: 'Error al procesar la solicitud' });
  }
};

// Controlador para listar todas las reservas
exports.listBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    
    // Mapear solo los campos necesarios para la respuesta
    const bookingsList = bookings.map(booking => ({
      id: booking._id,
      patientName: booking.patientName,
      date: booking.date,
      status: booking.status,
      createdAt: booking.createdAt
    }));
    
    res.status(200).json({
      count: bookingsList.length,
      bookings: bookingsList
    });
  } catch (error) {
    console.error('Error al listar reservas:', error);
    res.status(500).json({ message: 'Error al procesar la solicitud' });
  }
};