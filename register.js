import { db } from '../../lib/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = await db.createUser({
      email,
      password: hashedPassword,
      name,
      role: 'developer',
      createdAt: new Date().toISOString(),
      avatarInitials: name.substring(0, 2).toUpperCase(),
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId, email, name, role: 'developer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        name,
        role: 'developer',
        avatarInitials: name.substring(0, 2).toUpperCase(),
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
}
