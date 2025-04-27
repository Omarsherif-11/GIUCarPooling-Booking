import { Kafka } from 'kafkajs';
import { prisma } from '../db.js';
import { NotificationService } from '../services/notificationService.js';

// Initialize notification service
const notificationService = new NotificationService();

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
    await consumer.subscribe({ topic: 'ride-created', fromBeginning: false });
    await consumer.subscribe({ topic: 'ride-updated', fromBeginning: false });
    await consumer.subscribe({ topic: 'passenger-added-to-ride', fromBeginning: false });
    await consumer.subscribe({ topic: 'passenger-removed-from-ride', fromBeginning: false });
    await consumer.subscribe({ topic: 'ride-status-changed', fromBeginning: false });
    
    // Set up message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = JSON.parse(message.value.toString());
          
          if (topic === 'passenger-added') {
            // Update booking status to succeeded
            await prisma.booking.update({
              where: { id: messageValue.bookingId },
              data: { status: "SUCCEEDED", successful: true }
            });
            console.log(`Booking ${messageValue.bookingId} marked as succeeded`);
            
            // Get booking details for notification
            const booking = await prisma.booking.findUnique({
              where: { id: messageValue.bookingId },
              include: { ride: true }
            });
            
            if (booking) {
              // Create user object directly from message data since there's no user table in this service
              const user = {
                id: booking.user_id,
                email: messageValue.email,
                name: messageValue.email
              };
              
              // Get meeting point details
              const meetingPoint = await prisma.localRideMeetingPoint.findUnique({
                where: { id: booking.meeting_point_id }
              }).catch(() => ({ name: 'Selected Meeting Point' }));
              
              // Send booking confirmation notification
              notificationService.sendBookingConfirmation(booking, user, booking.ride, meetingPoint);
            }
          } 
          else if (topic === 'passenger-add-failed') {
            // Update booking status to failed
            await prisma.booking.update({
              where: { id: messageValue.bookingId },
              data: { status: "FAILED", successful: false }
            });
            console.log(`Booking ${messageValue.bookingId} marked as failed: ${messageValue.reason}`);
            
            // Get booking details for notification
            const booking = await prisma.booking.findUnique({
              where: { id: messageValue.bookingId },
              include: { ride: true }
            });
            
            if (booking) {
              // Create user object directly from message data since there's no user table in this service
              const user = {
                id: booking.user_id,
                email: messageValue.email || 'user@example.com',
                name: messageValue.name || 'User'
              };
              
              // Get meeting point details
              const meetingPoint = await prisma.meetingPoint.findUnique({
                where: { id: booking.meeting_point_id }
              }).catch(() => ({ name: 'Selected Meeting Point' }));
              
              // Send booking failed notification
              notificationService.sendBookingFailed(booking, user, booking.ride, meetingPoint, messageValue.reason || 'Failed to add passenger to ride');
            }
          }
          else if (topic === 'ride-created') {
            // Create or update local ride data
            await syncRideData(messageValue);
          }
          else if (topic === 'ride-updated') {
            // Update local ride data
            await syncRideData(messageValue);
          }
          else if (topic === 'passenger-added-to-ride') {
            // Update local ride passenger data
            await updateRidePassenger(messageValue);
          }
          else if (topic === 'passenger-removed-from-ride') {
            // Remove passenger from local ride
            await removeRidePassenger(messageValue);
          }
          else if (topic === 'ride-status-changed') {
            // Update ride status and related bookings
            await updateRideStatus(messageValue);
          }
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Error connecting Kafka consumer:', error);
  }
};

// Disconnect Kafka consumer
export const disconnectConsumer = async () => {
  try {
    await consumer.disconnect();
    console.log('Kafka consumer disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting Kafka consumer:', error);
  }
};

async function syncRideData(rideData) {
  try {
    // Check if ride already exists
    const existingRide = await prisma.localRide.findUnique({
      where: { id: rideData.id }
    });

    if (existingRide) {
      // Update existing ride
      await prisma.localRide.update({
        where: { id: rideData.id },
        data: {
          driver_id: rideData.driver_id || rideData.driverId,
          departure_time: new Date(rideData.departure_time || rideData.departureTime),
          seats_available: rideData.seats_available || rideData.seatsAvailable,
          status: rideData.status,
          girls_only: rideData.girls_only || rideData.girlsOnly,
          to_giu: rideData.to_giu || rideData.toGIU || false,
          area_id: rideData.area_id || rideData.areaId
        }
      });
    } else {
      // Create new ride
      await prisma.localRide.create({
        data: {
          id: rideData.id,
          driver_id: rideData.driver_id || rideData.driverId,
          departure_time: new Date(rideData.departure_time || rideData.departureTime),
          seats_available: rideData.seats_available || rideData.seatsAvailable,
          status: rideData.status,
          girls_only: rideData.girls_only || rideData.girlsOnly,
          to_giu: rideData.to_giu || rideData.toGIU || false,
          area_id: rideData.area_id || rideData.areaId
        }
      });
    }

    // Sync meeting points if available
    if (rideData.ride_meeting_points || rideData.meetingPoints) {
      const meetingPoints = rideData.ride_meeting_points || rideData.meetingPoints;
      
      // Delete existing meeting points
      await prisma.localRideMeetingPoint.deleteMany({
        where: { ride_id: rideData.id }
      });
      
      // Create new meeting points
      let index = 0;
      for (const mp of meetingPoints) {
        await prisma.localRideMeetingPoint.create({
          data: {
            ride_id: rideData.id,
            meeting_point_id: mp.meeting_point_id || mp.meetingPointId,
            price: mp.price,
            order_index: mp.order_index || mp.orderIndex || index++
          }
        });
      }
    }
    
    console.log(`Ride ${rideData.id} synced successfully`);
  } catch (error) {
    console.error(`Error syncing ride data: ${error.message}`);
  }
}

async function updateRidePassenger(passengerData) {
  try {
    const { rideId, passengerId } = passengerData;
    
    // Check if passenger already exists
    const existingPassenger = await prisma.localRidePassenger.findFirst({
      where: {
        ride_id: rideId,
        passenger_id: passengerId
      }
    });
    
    if (!existingPassenger) {
      // Add passenger to local ride
      await prisma.localRidePassenger.create({
        data: {
          ride_id: rideId,
          passenger_id: passengerId,
          passenger_name: `User ${passengerId}` // Default passenger name
        }
      });
      
      // Update seats available
      await prisma.localRide.update({
        where: { id: rideId },
        data: { seats_available: { decrement: 1 } }
      });
      
      console.log(`Passenger ${passengerId} added to local ride ${rideId}`);
    }
  } catch (error) {
    console.error(`Error updating ride passenger: ${error.message}`);
  }
}

async function removeRidePassenger(passengerData) {
  try {
    const { rideId, passengerId } = passengerData;
    
    // Check if passenger exists
    const existingPassenger = await prisma.localRidePassenger.findFirst({
      where: {
        ride_id: rideId,
        passenger_id: passengerId
      }
    });
    
    if (existingPassenger) {
      // Remove passenger from local ride
      await prisma.localRidePassenger.delete({
        where: { id: existingPassenger.id }
      });
      
      // Update seats available
      await prisma.localRide.update({
        where: { id: rideId },
        data: { seats_available: { increment: 1 } }
      });
      
      console.log(`Passenger ${passengerId} removed from local ride ${rideId}`);
    }
  } catch (error) {
    console.error(`Error removing ride passenger: ${error.message}`);
  }
}

async function updateRideStatus(statusData) {
  try {
    const { rideId, status } = statusData;
    
    // Update ride status
    await prisma.localRide.update({
      where: { id: rideId },
      data: { status }
    });
    
    // If ride is canceled, update all associated bookings
    if (status === "CANCELED") {
      await prisma.booking.updateMany({
        where: { 
          ride_id: rideId,
          status: {
            not: "canceled"
          }
        },
        data: { 
          status: "canceled",
          successful: false
        }
      });
      console.log(`All bookings for ride ${rideId} marked as canceled`);
    }
    
    console.log(`Ride ${rideId} status updated to ${status}`);
  } catch (error) {
    console.error(`Error updating ride status: ${error.message}`);
  }
}