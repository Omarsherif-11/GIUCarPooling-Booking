import { Kafka } from 'kafkajs';
import { prisma } from '../db.js';
import { sendBookingFailedEvent } from './index.js';

// Create the client with the broker list
const kafka = new Kafka({
  clientId: 'booking-service-consumer',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092']
});

// Create a consumer
const consumer = kafka.consumer({ groupId: 'booking-service-group' });

// Initialize consumer connection
export const initConsumer = async () => {
  try {
    await consumer.connect();
    console.log('Kafka consumer connected successfully');
    
    // Subscribe to topics
    await consumer.subscribe({ topic: 'passenger-added', fromBeginning: false });
    await consumer.subscribe({ topic: 'passenger-add-failed', fromBeginning: false });
    
    // Set up message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = JSON.parse(message.value.toString());
          
          if (topic === 'passenger-added') {
            // Update booking status to succeeded
            await prisma.booking.update({
              where: { id: messageValue.bookingId },
              data: { status: "succeeded", successful: true }
            });
            console.log(`Booking ${messageValue.bookingId} marked as succeeded`);
          } 
          else if (topic === 'passenger-add-failed') {
            // Update booking status to failed
            await prisma.booking.update({
              where: { id: messageValue.bookingId },
              data: { status: "failed", successful: false }
            });
            console.log(`Booking ${messageValue.bookingId} marked as failed: ${messageValue.reason}`);
          }
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Error setting up Kafka consumer:', error);
  }
};

// Disconnect consumer when app is shutting down
export const disconnectConsumer = async () => {
  try {
    await consumer.disconnect();
    console.log('Kafka consumer disconnected');
  } catch (error) {
    console.error('Error disconnecting Kafka consumer:', error);
  }
};