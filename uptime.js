import { db } from '../../lib/db.js';

// Services to monitor
const SERVICES = [
  { id: 'api', name: 'API', url: process.env.VERCEL_URL || 'https://vercel.com' },
  { id: 'database', name: 'Database', type: 'internal' },
  { id: 'auth', name: 'Authentication', type: 'internal' },
];

async function checkService(service) {
  const start = Date.now();
  
  try {
    if (service.type === 'internal') {
      // Simulate internal service check
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        service: service.id,
        status: 'up',
        responseTime: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    } else {
      // HTTP check
      const response = await fetch(service.url, { 
        method: 'HEAD',
        timeout: 5000,
      });
      
      return {
        service: service.id,
        status: response.ok ? 'up' : 'down',
        responseTime: Date.now() - start,
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    return {
      service: service.id,
      status: 'down',
      responseTime: Date.now() - start,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check all services
    const checks = await Promise.all(
      SERVICES.map(service => checkService(service))
    );

    // Save checks
    for (const check of checks) {
      await db.recordUptimeCheck(check);
    }

    // Get historical stats
    const stats = await db.getUptimeStats();

    // Calculate overall status
    const successful = checks.filter(c => c.status === 'up').length;
    const total = checks.length;
    const uptimePercentage = ((successful / total) * 100).toFixed(2);

    res.status(200).json({
      status: 'operational',
      uptime: uptimePercentage,
      services: checks,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Uptime check error:', error);
    res.status(500).json({ error: error.message });
  }
}
