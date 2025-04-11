import { prisma } from '../db.js';

export class RideService {
  // Validate if a ride is available for booking
  async validateRideForBooking(rideId, userId) {
    const ride = await prisma.localRide.findUnique({
      where: { id: rideId },
      include: { 
        passengers: true,
        meeting_points: true
      }
    });

    if (!ride) {
      throw new Error("Ride not found");
    }

    if (ride.departure_time < new Date()) {
      throw new Error("Ride has already departed");
    }

    if (ride.status !== "PENDING") {
      throw new Error("Ride is not available");
    }

    // Check if there are seats available
    if (ride.seats_available <= 0) {
      throw new Error("No seats available");
    }

    // Check if passenger is already in the ride
    const existingPassenger = ride.passengers.find(
      (p) => p.passenger_id === userId
    );
    
    if (existingPassenger) {
      throw new Error("Passenger already added to this ride");
    }

    return ride;
  }

  // Get price for a meeting point
  async getPriceForMeetingPoint(rideId, meetingPointId) {
    const meetingPoint = await prisma.localRideMeetingPoint.findFirst({
      where: {
        ride_id: rideId,
        meeting_point_id: meetingPointId
      }
    });

    if (!meetingPoint) {
      throw new Error("Meeting point not found for this ride");
    }

    return meetingPoint.price;
  }

  // Get all available rides
  async getAvailableRides() {
    return prisma.localRide.findMany({
      where: {
        status: "PENDING",
        seats_available: { gt: 0 },
        departure_time: { gt: new Date() }
      },
      include: {
        meeting_points: true
      }
    });
  }
}