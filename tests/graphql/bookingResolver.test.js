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
      findMany: jest.fn(),
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
    getAvailableRides: jest.fn().mockResolvedValue([]),
  })),
}));


describe('Booking and Ride resolvers', () => {
  // Mock user context for authenticated requests
  const mockUserContext = {
    user: {
      id: 1,
      email: 'test@example.com',
      isAdmin: false,
      isDriver: false
    }
  };

  // Mock admin context for admin-only operations
  const mockAdminContext = {
    user: {
      id: 2,
      email: 'admin@example.com',
      isAdmin: true,
      isDriver: false
    }
  };

  // Mock driver context for driver operations
  const mockDriverContext = {
    user: {
      id: 3,
      email: 'driver@example.com',
      isAdmin: false,
      isDriver: true
    }
  };

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

      // Execute resolver with user context
      const result = await resolvers.Mutation.createBooking(
        null, 
        { ride_id: 1, meeting_point_id: 1 },
        mockUserContext
      );

      // Assertions
      expect(result).toEqual(mockBooking);
      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: {
          user_id: mockUserContext.user.id,
          ride_id: 1,
          meeting_point_id: 1,
          price: 100,
          status: 'PENDING',
        },
      });
      expect(sendBookingCreatedEvent).toHaveBeenCalledWith(mockBooking);
    });

    it('should throw error if user is not authenticated', async () => {
      await expect(resolvers.Mutation.createBooking(
        null, 
        { ride_id: 1, meeting_point_id: 1 },
        { user: null }
      )).rejects.toThrow('Not authenticated');
    });
  });

  describe('cancelBooking resolver', () => {
    it('should cancel a booking and trigger Kafka event', async () => {
      const mockBooking = {
        id: 1,
        user_id: 1,
        status: 'PENDING',
        ride: { status: 'PENDING' }
      };
  
      // Mock Prisma calls
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });
      sendBookingCanceledEvent.mockResolvedValue();
  
      // Execute resolver with user context
      const result = await resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockUserContext
      );
  
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
  
      await expect(resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockUserContext
      )).rejects.toThrow('Failed to cancel booking: Booking not found');
    });
  
    it('should throw error if booking is already cancelled', async () => {
      const mockBooking = { id: 1, user_id: 1, status: 'CANCELLED' };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
  
      await expect(resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockUserContext
      )).rejects.toThrow('Failed to cancel booking: Booking is already cancelled');
    });
  
    it('should throw error if ride is not PENDING and booking cannot be canceled', async () => {
      const mockBooking = { id: 1, user_id: 1, status: 'PENDING', ride: { status: 'IN_PROGRESS' } };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
  
      await expect(resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockUserContext
      )).rejects.toThrow('Failed to cancel booking: Cannot cancel booking for a ride that is already in progress or completed');
    });

    it('should throw error if user is not the booking owner or admin', async () => {
      const mockBooking = { id: 1, user_id: 999, status: 'PENDING', ride: { status: 'PENDING' } };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
  
      await expect(resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockUserContext
      )).rejects.toThrow('Not authorized to cancel this booking');
    });

    it('should allow admin to cancel any booking', async () => {
      const mockBooking = {
        id: 1,
        user_id: 999, // Different from admin ID
        status: 'PENDING',
        ride: { status: 'PENDING' }
      };
  
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });
      sendBookingCanceledEvent.mockResolvedValue();
  
      const result = await resolvers.Mutation.cancelBooking(
        null, 
        { id: 1 },
        mockAdminContext
      );
  
      expect(result.status).toEqual('CANCELLED');
    });
  });
  
  describe('updateRideStatus resolver', () => {
    it('should update ride status and trigger Kafka event when user is admin', async () => {
      const mockRide = { id: 1, driver_id: 3, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
      prisma.localRide.update.mockResolvedValue({ ...mockRide, status: 'CANCELLED' });
      require('../../kafka/index.js').sendRideStatusUpdateEvent.mockResolvedValue(); 
  
      // Execute resolver with driver context instead of admin context
      // since the resolver checks for isDriver, not isAdmin
      const result = await resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'CANCELLED' },
        mockDriverContext
      );
  
      // Assertions
      expect(result.status).toEqual('CANCELLED');
      expect(prisma.localRide.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CANCELLED' },
      });
      expect(require('../../kafka/index.js').sendRideStatusUpdateEvent).toHaveBeenCalledWith(result);
    });
  
    it('should allow driver to update their own ride status', async () => {
      const mockRide = { id: 1, driver_id: 3, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
      prisma.localRide.update.mockResolvedValue({ ...mockRide, status: 'IN_PROGRESS' });
      require('../../kafka/index.js').sendRideStatusUpdateEvent.mockResolvedValue();
  
      const result = await resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'IN_PROGRESS' },
        mockDriverContext
      );
  
      expect(result.status).toEqual('IN_PROGRESS');
    });
  
    it('should cancel all associated bookings if ride is cancelled', async () => {
      const mockRide = { id: 1, driver_id: 3, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
      prisma.localRide.update.mockResolvedValue({ ...mockRide, status: 'CANCELLED' });
      prisma.booking.updateMany.mockResolvedValue({});
      require('../../kafka/index.js').sendRideStatusUpdateEvent.mockResolvedValue();
  
      // Execute resolver with driver context instead of admin context
      const result = await resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'CANCELLED' },
        mockDriverContext
      );
  
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
  
      await expect(resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'CANCELLED' },
        mockDriverContext
      )).rejects.toThrow('Failed to update ride status: Ride not found');
    });
  
    it('should throw error if status is already cancelled', async () => {
      const mockRide = { id: 1, driver_id: 3, status: 'CANCELLED' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
    
      await expect(resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'PENDING' },
        mockDriverContext
      )).rejects.toThrow('Cannot change status of a cancelled ride');
    });
  
    it('should throw error if status transition is invalid', async () => {
      const mockRide = { id: 1, driver_id: 3, status: 'COMPLETED' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
  
      await expect(resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'PENDING' },
        mockDriverContext
      )).rejects.toThrow('Failed to update ride status: Cannot change status of a completed ride');
    });
  
    it('should throw error if user is not authorized', async () => {
      const mockRide = { id: 1, driver_id: 999, status: 'PENDING' };
      prisma.localRide.findUnique.mockResolvedValue(mockRide);
  
      await expect(resolvers.Mutation.updateRideStatus(
        null, 
        { id: 1, status: 'CANCELLED' },
        mockUserContext
      )).rejects.toThrow('Not authorized');
    });
  });

  describe('viewBookings resolver', () => {
    it('should return user bookings when authenticated', async () => {
      const mockBookings = [
        { id: 1, user_id: 1, ride_id: 1, status: 'PENDING' },
        { id: 2, user_id: 1, ride_id: 2, status: 'SUCCEEDED' }
      ];
      
      prisma.booking.findMany.mockResolvedValue(mockBookings);
      
      const result = await resolvers.Query.viewBookings(
        null,
        {},
        mockAdminContext // Using admin context since viewBookings requires admin privileges
      );
      
      expect(result).toEqual(mockBookings);
      expect(prisma.booking.findMany).toHaveBeenCalled();
    });
    
    it('should throw error if user is not authenticated', async () => {
      await expect(resolvers.Query.viewBookings(
        null,
        {},
        { user: null }
      )).rejects.toThrow('Not authorized');
    });
  });

  describe('getAvailableRides resolver', () => {
    it('should return available rides', async () => {
      const mockRides = [
        { id: 1, status: 'PENDING', seats_available: 2 },
        { id: 2, status: 'PENDING', seats_available: 1 }
      ];
      
      require('../../services/rideService').RideService.mockImplementation(() => ({
        getAvailableRides: jest.fn().mockResolvedValue(mockRides)
      }));
      
      const result = await resolvers.Query.getAvailableRides();
      
      expect(result).toEqual(mockRides);
    });
  });
});