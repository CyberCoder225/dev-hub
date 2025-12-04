import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Helper functions for data structure
export const db = {
  // Users
  async createUser(userData) {
    const userId = `user:${Date.now()}`;
    await redis.hset(`users:${userId}`, userData);
    await redis.sadd('users:index', userId);
    return userId;
  },

  async getUser(userId) {
    return await redis.hgetall(`users:${userId}`);
  },

  async getUserByEmail(email) {
    const userIds = await redis.smembers('users:index');
    for (const userId of userIds) {
      const user = await redis.hgetall(`users:${userId}`);
      if (user.email === email) {
        return { ...user, id: userId };
      }
    }
    return null;
  },

  // Analytics
  async trackEvent(event) {
    const eventId = `event:${Date.now()}`;
    await redis.hset(`events:${eventId}`, {
      ...event,
      timestamp: new Date().toISOString(),
    });
    
    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    await redis.hincrby(`stats:daily:${today}`, event.type, 1);
    
    return eventId;
  },

  async getDailyStats(date) {
    return await redis.hgetall(`stats:daily:${date}`);
  },

  // Website Pages
  async createPage(pageData) {
    const pageId = `page:${Date.now()}`;
    await redis.hset(`pages:${pageId}`, {
      ...pageData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await redis.zadd('pages:index', Date.now(), pageId);
    return pageId;
  },

  async getPage(pageId) {
    return await redis.hgetall(`pages:${pageId}`);
  },

  async listPages(limit = 50) {
    const pageIds = await redis.zrevrange('pages:index', 0, limit - 1);
    const pages = await Promise.all(
      pageIds.map(id => redis.hgetall(`pages:${id}`))
    );
    return pages.map((page, index) => ({
      ...page,
      id: pageIds[index],
    }));
  },

  // Uptime Monitoring
  async recordUptimeCheck(checkData) {
    const checkId = `check:${Date.now()}`;
    await redis.hset(`uptime:${checkId}`, checkData);
    
    // Keep last 1000 checks
    await redis.zadd('uptime:index', Date.now(), checkId);
    await redis.zremrangebyrank('uptime:index', 0, -1001);
    
    return checkId;
  },

  async getUptimeStats(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const checkIds = await redis.zrangebyscore('uptime:index', cutoff, '+inf');
    
    const checks = await Promise.all(
      checkIds.map(id => redis.hgetall(`uptime:${id}`))
    );
    
    return {
      totalChecks: checks.length,
      successful: checks.filter(c => c.status === 'up').length,
      failed: checks.filter(c => c.status === 'down').length,
      avgResponseTime: checks.reduce((sum, c) => sum + parseFloat(c.responseTime || 0), 0) / checks.length,
      checks: checks.slice(-100), // Return last 100 checks
    };
  },
};
