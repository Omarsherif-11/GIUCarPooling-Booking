import { Kafka } from 'kafkajs';
import { prisma } from '../db.js';

// Create the client with the broker list
const kafka = new Kafka({
  clientId: 'booking-service',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092']
});

// Create a producer
const producer = kafka.producer();

// Map to store pending booking promises
const pendingBookings = new Map();

// Initialize producer connection
export const initKafka = async () => {
  try {
    await producer.connect();
    console.log('Kafka producer connected successfully');
    
    // Create a consumer for responses
    const consumer = kafka.consumer({ groupId: 'booking-service-response-group' });
    await consumer.connect();
    
    // Subscribe to response topics
    await consumer.subscribe({ topic: 'passenger-added', fromBeginning: false });
    await consumer.subscribe({ topic: 'passenger-add-failed', fromBeginning: false });
    await consumer.subscribe({ topic: 'passenger-removed', fromBeginning: false });
    
    // Set up message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = JSON.parse(message.value.toString());
          const bookingId = messageValue.bookingId;
          
          if (!pendingBookings.has(bookingId)) {
            console.log(`No pending promise for booking ${bookingId}`);
            return;
          }
          
          const { resolve } = pendingBookings.get(bookingId);
          
          if (topic === 'passenger-added') {
            // Update booking status to succeeded
            await prisma.booking.update({
              where: { id: bookingId },
              data: { status: "succeeded", successful: true }
            });
            console.log(`Booking ${bookingId} marked as succeeded`);
            
            // Resolve the promise
            resolve({ status: 'succeeded', bookingId });
          } 
          else if (topic === 'passenger-add-failed') {
            // Update booking status to failed
            await prisma.booking.update({
              where: { id: bookingId },
              data: { status: "failed", successful: false }
            });
            console.log(`Booking ${bookingId} marked as failed: ${messageValue.reason}`);
            
            // Resolve the promise with error
            resolve({ status: 'failed', bookingId, reason: messageValue.reason });
          }
          else if (topic === 'passenger-removed') {
            console.log(`Passenger removed for booking ${bookingId}`);
            // This is a confirmation that the passenger was removed after a booking failure
          }
          
          // Remove from pending bookings
          pendingBookings.delete(bookingId);
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Error connecting to Kafka:', error);
  }
};

// Send booking created event and wait for result
export const sendBookingCreatedEvent = async (booking) => {
  try {
    // Create a promise that will be resolved when we get a response
    const resultPromise = new Promise((resolve, reject) => {
      // Set a timeout to reject the promise after 10 seconds
      const timeoutId = setTimeout(() => {
        if (pendingBookings.has(booking.id)) {
          pendingBookings.delete(booking.id);
          reject(new Error('Booking operation timed out'));
        }
      }, 10000); // 10 seconds timeout
      
      pendingBookings.set(booking.id, { resolve, reject, timeoutId });
    });
    
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
            passengerName: `User ${booking.user_id}` // You might want to fetch the actual name
          }) 
        },
      ],
    });
    console.log(`Booking created event sent for booking ${booking.id}`);
    
    // Wait for the result
    const result = await resultPromise;
    
    // If the booking failed, send an event to remove the passenger
    if (result.status === 'failed') {
      await sendBookingFailedEvent(booking.id, result.reason || 'Unknown error');
    }
    
    return result;
  } catch (error) {
    console.error('Error sending booking created event:', error);
    
    // Update booking status to failed if we can't send the event
    try {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "failed", successful: false }
      });
    } catch (updateError) {
      console.error('Error updating booking status:', updateError);
    }
    
    throw error;
  }
};

// Send booking failed event to trigger passenger removal
// Send booking failed event to trigger passenger removal
export const sendBookingFailedEvent = async (booking, reason) => {
    try {
      await producer.send({
        topic: 'booking-failed',
        messages: [
          { 
            key: String(booking.id), 
            value: JSON.stringify({
              bookingId: booking.id,
              rideId: booking.ride_id,
              userId: booking.user_id,
              reason: reason
            }) 
          },
        ],
      });
      console.log(`Booking failed event sent for booking ${booking.id}: ${reason}`);
    } catch (error) {
      console.error('Error sending booking failed event:', error);
    }
  };

// Disconnect producer when app is shutting down
export const disconnectKafka = async () => {
  try {
    await producer.disconnect();
    console.log('Kafka producer disconnected');
  } catch (error) {
    console.error('Error disconnecting from Kafka:', error);
  }
};