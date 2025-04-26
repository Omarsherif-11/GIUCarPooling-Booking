import axios from 'axios';

// Configure the notification service URL
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3001/notifications';

/**
 * Service to handle sending notifications through the notification service
 */
export class NotificationService {
  /**
   * Send a booking confirmation notification
   * @param {Object} booking - The booking object
   * @param {Object} user - The user who made the booking
   * @param {Object} ride - The ride details
   * @param {Object} meetingPoint - The meeting point details
   * @returns {Promise<Object>} - Response from notification service
   */
  async sendBookingConfirmation(booking, user, ride, meetingPoint) {
    try {
      const payload = {
        type: 'booking',
        to: user.email,
        subject: 'Booking Confirmation - GIU Carpooling',
        payload: {
          username: user.name || user.email,
          date: new Date(ride.departure_time).toLocaleString(),
          fromPlace: meetingPoint.name || 'Meeting Point',
          toPlace: ride.to_giu ? 'GIU' : 'Home Area',
        }
      };

      const response = await axios.post(`${NOTIFICATION_SERVICE_URL}/notify`, payload);
      console.log(`Booking confirmation notification sent to ${user.email}`);
      return response.data;
    } catch (error) {
      console.error('Error sending booking confirmation notification:', error.message);
      // Don't throw the error to prevent disrupting the main flow
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a booking cancellation notification
   * @param {Object} booking - The booking object
   * @param {Object} user - The user who made the booking
   * @param {Object} ride - The ride details
   * @param {Object} meetingPoint - The meeting point details
   * @returns {Promise<Object>} - Response from notification service
   */
  async sendBookingCancellation(booking, user, ride, meetingPoint) {
    try {
      const payload = {
        type: 'booking',
        to: user.email,
        subject: 'Booking Cancellation - GIU Carpooling',
        payload: {
          username: user.name || user.email,
          date: new Date(ride.departure_time).toLocaleString(),
          fromPlace: meetingPoint.name || 'Meeting Point',
          toPlace: ride.to_giu ? 'GIU' : 'Home Area',
          details: 'Your booking has been cancelled.'
        }
      };

      const response = await axios.post(`${NOTIFICATION_SERVICE_URL}/notify`, payload);
      console.log(`Booking cancellation notification sent to ${user.email}`);
      return response.data;
    } catch (error) {
      console.error('Error sending booking cancellation notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a booking failed notification
   * @param {Object} booking - The booking object
   * @param {Object} user - The user who made the booking
   * @param {Object} ride - The ride details
   * @param {Object} meetingPoint - The meeting point details
   * @param {string} reason - The reason for failure
   * @returns {Promise<Object>} - Response from notification service
   */
  async sendBookingFailed(booking, user, ride, meetingPoint, reason) {
    try {
      const payload = {
        type: 'bookingFailed',
        to: user.email,
        subject: 'Booking Failed - GIU Carpooling',
        payload: {
          username: user.name || user.email,
          date: new Date(ride.departure_time).toLocaleString(),
          fromPlace: meetingPoint.name || 'Meeting Point',
          toPlace: ride.to_giu ? 'GIU' : 'Home Area',
          details: `Your booking could not be completed. Reason: ${reason}`
        }
      };

      const response = await axios.post(`${NOTIFICATION_SERVICE_URL}/notify`, payload);
      console.log(`Booking failed notification sent to ${user.email}`);
      return response.data;
    } catch (error) {
      console.error('Error sending booking failed notification:', error.message);
      return { success: false, error: error.message };
    }
  }
}