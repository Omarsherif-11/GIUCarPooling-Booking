import { resolvers } from '../../graphql/resolvers/bookingResolver';
import { prisma } from '../../db';  
import { sendBookingCreatedEvent, sendBookingCanceledEvent } from '../../kafka/index.js';  

// Mock Prisma
jest.mock('../../db', () => ({
  __esModule: true,
  prisma: {
    booking: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    localRide: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock Kafka producer
jest.mock('../../kafka/index.js', () => ({
  sendBookingCreatedEvent: jest.fn().mockImplementation((booking) => {
    if (booking.status === 'PENDING') {
      return Promise.resolve();  // Simulate success
    } else {
      return Promise.reject(new Error('Failed to send event'));  
    }
  }),
  sendBookingCanceledEvent: jest.fn(),
  sendRideStatusUpdateEvent: jest.fn().mockResolvedValue(),
}));

// Mock RideService
jest.mock('../../services/rideService', () => ({
  RideService: jest.fn().mockImplementation(() => ({
    getPriceForMeetingPoint: jest.fn().mockResolvedValue(100),
    validateRideForBooking: jest.fn().mockResolvedValue(true),
  })),
}));


describe('Booking and Ride resolvers', () => {
  beforeEach(() => {
    jest.clearAllMocks(); 
  });

  describe('createBooking resolver', () => {
    it('should create a booking and trigger Kafka event', async () => {
      const mockBooking = { 
        id: 1, 
        user_id: 1, 
        ride_id: 1, 
        price: 100, 
        status: 'PENDING' 
      };

      // Mock rideService methods
      const mockRideService = {
        validateRideForBooking: jest.fn().mockResolvedValue(true),
        getPriceForMeetingPoint: jest.fn().mockResolvedValue(100),
      };

      // Mock Prisma and Kafka
      prisma.booking.create.mockResolvedValue(mockBooking);
      sendBookingCreatedEvent.mockResolvedValue();

      // Execute resolver
      const result = await resolvers.Mutation.createBooking(
        null, 
        { user_id: 1, ride_id: 1, meeting_point_id: 1 }
      );

      // Assertions
      expect(result).toEqual(mockBooking);
      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: {
          user_id: 1,
          ride_id: 1,
          meeting_point_id: 1,
          price: 100,
          status: 'PENDING',
        },
      });
      expect(sendBookingCreatedEvent).toHaveBeenCalledWith(mockBooking);
    });
  });

  describe('cancelBooking resolver', () => {
    it('should cancel a booking and trigger Kafka event', async () => {
      const mockBooking = {
        id: 1,
        status: 'PENDING',
        ride: { status: 'PENDING' }
      };
  
      // Mock Prisma calls
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });
      sendBookingCanceledEvent.mockResolvedValue();
  
      // Execute resolver
      const result = await resolvers.Mutation.cancelBooking(null, { id: 1 });
  
      // Assertions
      expect(result.status).toEqual('CANCELLED');
      expect(prisma.booking.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { ride: true },
      });
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CANCELLED', successful: false },
      });
      expect(sendBookingCanceledEvent).toHaveBeenCalledWith(result);
    });
  
    it('should throw error if booking not found', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
  
      await expect(resolvers.Mutation.cancelBooking(null, { id: 1 }))
        .rejects
        .toThrow('Failed to cancel booking: Booking not found');
    });
  
    it('should throw error if booking is already cancelled', async () => {
      const mockBooking = { id: 1, status: 'CANCELLED' };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
  
      await expect(resolvers.Mutation.cancelBooking(null, { id: 1 }))
        .rejects
        .toThrow('Failed to cancel booking: Booking is already cancelled');
    });
  
    it('should throw error if ride is not PENDING and booking cannot be canceled', async () => {
      const mockBooking = { id: 1, status: 'PENDING', ride: { status: 'IN_PROGRESS' } };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
  
      await expect(resolvers.Mutation.cancelBooking(null, { id: 1 }))
        .rejects
        .toThrow('Failed to cancel booking: Cannot cancel booking for a ride that is already in progress or completed');
    });
  });
  
  describe('updateRideStatus resolver', () => {
    it('should update ride status and trigger Kafka event', async () => {
      const mockRide = { id: 1, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
      prisma.localRide.update.mockResolvedValue({ ...mockRide, status: 'CANCELLED' });
      require('../../kafka/index.js').sendRideStatusUpdateEvent.mockResolvedValue(); 
  
      // Execute resolver
      const result = await resolvers.Mutation.updateRideStatus(null, { id: 1, status: 'CANCELLED' });
  
      // Assertions
      expect(result.status).toEqual('CANCELLED');
      expect(prisma.localRide.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CANCELLED' },
      });
      expect(require('../../kafka/index.js').sendRideStatusUpdateEvent).toHaveBeenCalledWith(result);
    });
  
  
    it('should cancel all associated bookings if ride is cancelled', async () => {
      const mockRide = { id: 1, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
      prisma.localRide.update.mockResolvedValue({ ...mockRide, status: 'CANCELLED' });
      prisma.booking.updateMany.mockResolvedValue({});
      require('../../kafka/index.js').sendRideStatusUpdateEvent.mockResolvedValue(); // Mock resolved value
  
      // Execute resolver
      const result = await resolvers.Mutation.updateRideStatus(null, { id: 1, status: 'CANCELLED' });
  
      // Assertions
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: {
          ride_id: 1,
          status: { not: 'CANCELLED' },
        },
        data: { status: 'CANCELLED', successful: false },
      });
      expect(result.status).toEqual('CANCELLED');
      expect(require('../../kafka/index.js').sendRideStatusUpdateEvent).toHaveBeenCalledWith(result);
    });
  
    it('should throw error if ride not found', async () => {
      prisma.localRide.findUnique.mockResolvedValue(null);
  
      await expect(resolvers.Mutation.updateRideStatus(null, { id: 1, status: 'CANCELLED' }))
        .rejects
        .toThrow('Failed to update ride status: Ride not found');
    });
    it('should throw error if status is already cancelled', async () => {
      const mockRide = { id: 1, status: 'CANCELLED' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
    
      await expect(resolvers.Mutation.updateRideStatus(null, { id: 1, status: 'PENDING' }))
        .rejects
        .toThrow('Cannot change status of a cancelled ride');
    });

    it('should throw error if status transition is invalid', async () => {
      const mockRide = { id: 1, status: 'COMPLETED' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
  
      await expect(resolvers.Mutation.updateRideStatus(null, { id: 1, status: 'PENDING' }))
        .rejects
        .toThrow('Failed to update ride status: Cannot change status of a completed ride');
    });
  });  
});
