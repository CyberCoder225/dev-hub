import { db } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    
    // Add metadata
    const enrichedEvent = {
      ...event,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      timestamp: new Date().toISOString(),
      type: event.type || 'pageview',
    };

    // Save event
    const eventId = await db.trackEvent(enrichedEvent);

    res.status(200).json({
      success: true,
      eventId,
      message: 'Event tracked successfully',
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({ error: error.message });
  }
}
