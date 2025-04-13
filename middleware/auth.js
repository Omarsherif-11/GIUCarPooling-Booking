import jwt from 'jsonwebtoken';

export const authMiddleware = async ({ req }) => {
  try {
    // Get the token from the authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return { user: null };
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Return the user information in the context
    return {
      user: {
        id: decoded.userId,
        email: decoded.email,
        isAdmin: decoded.isAdmin,
        isDriver: decoded.isDriver,
      }
    };
  } catch (error) {
    // If token is invalid or expired, return null user
    return { user: null };
  }
}; 