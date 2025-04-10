import { Kafka } from 'kafkajs';
import { prisma } from '../db.js';

// Create the client with the broker list
const kafka = new Kafka({
  clientId: 'booking-service',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092']
});

// Create a producer
const producer = kafka.producer();

// Initialize producer connection
export const initKafka = async () => {
  try {
    await producer.connect();
    console.log('Kafka producer connected successfully');
  } catch (error) {
    console.error('Error connecting to Kafka:', error);
  }
};

// Send booking created event asynchronously
export const sendBookingCreatedEvent = async (booking) => {
  try {
    // Get meeting point ID from the booking
    const meetingPointId = booking.meeting_point_id;
    
    // Send the event
    await producer.send({
      topic: 'booking-created',
      messages: [
        { 
          key: String(booking.id), 
          value: JSON.stringify({
            bookingId: booking.id,
            rideId: booking.ride_id,
            userId: booking.user_id,
            price: booking.price,
            status: booking.status,
            meetingPointId: meetingPointId
          }) 
        },
      ],
    });
    console.log(`Booking created event sent for booking ${booking.id}`);
    
    return { status: 'pending', bookingId: booking.id };
  } catch (error) {
    console.error(`Error sending booking created event: ${error.message}`);
    throw error;
  }
};

// Disconnect Kafka producer
export const disconnectKafka = async () => {
  try {
    await producer.disconnect();
    console.log('Kafka producer disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting from Kafka:', error);
  }
};
