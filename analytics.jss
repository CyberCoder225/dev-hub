const Model = require('../../../models/model');

const track = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const timestamp = new Date().toISOString();
    
    const {
      eventType = 'pageview',
      pageUrl,
      pageTitle,
      referrer,
      userAgent,
      screenResolution,
      language,
      userId,
      sessionId,
      metadata = {},
    } = body;
    
    // Generate event ID
    const eventId = `EVENT#${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Save event
    await Model.create(
      `ANALYTICS#${eventType.toUpperCase()}`,
      eventId,
      {
        timestamp,
        pageUrl,
        pageTitle,
        referrer: referrer || 'direct',
        userAgent: userAgent || '',
        screenResolution: screenResolution || 'unknown',
        language: language || 'unknown',
        userId: userId || 'anonymous',
        sessionId: sessionId || 'anonymous',
        metadata,
        ipAddress: event.requestContext?.identity?.sourceIp || 'unknown',
        country: metadata.country || 'unknown',
        deviceType: getDeviceType(userAgent),
        browser: getBrowser(userAgent),
        os: getOS(userAgent),
      }
    );
    
    // Update daily stats
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    await updateDailyStats(date, eventType);
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'Event tracked successfully' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

const get = async (event) => {
  try {
    const user = event.requestContext.authorizer;
    const {
      period = '7d',
      metric = 'pageviews',
      startDate,
      endDate,
    } = event.queryStringParameters || {};
    
    // Calculate date range
    let dateRange;
    if (startDate && endDate) {
      dateRange = { start: startDate, end: endDate };
    } else {
      dateRange = getDateRange(period);
    }
    
    // Get analytics data based on metric
    let analyticsData;
    
    switch (metric) {
      case 'pageviews':
        analyticsData = await getPageViews(dateRange);
        break;
      case 'users':
        analyticsData = await getUniqueUsers(dateRange);
        break;
      case 'sessions':
        analyticsData = await getSessions(dateRange);
        break;
      case 'popular-pages':
        analyticsData = await getPopularPages(dateRange);
        break;
      case 'referrers':
        analyticsData = await getTopReferrers(dateRange);
        break;
      case 'devices':
        analyticsData = await getDeviceStats(dateRange);
        break;
      case 'browsers':
        analyticsData = await getBrowserStats(dateRange);
        break;
      default:
        analyticsData = await getOverview(dateRange);
    }
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(analyticsData),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// Helper functions
async function updateDailyStats(date, eventType) {
  const statsId = `STATS#DAILY#${date}`;
  
  try {
    const existing = await Model.get('ANALYTICS_STATS', statsId);
    
    if (existing) {
      const updates = {
        [eventType]: (existing[eventType] || 0) + 1,
        totalEvents: (existing.totalEvents || 0) + 1,
      };
      
      await Model.update('ANALYTICS_STATS', statsId, updates);
    } else {
      await Model.create(
        'ANALYTICS_STATS',
        statsId,
        {
          date,
          [eventType]: 1,
          totalEvents: 1,
          pageviews: eventType === 'pageview' ? 1 : 0,
          uniqueUsers: 0, // Will be calculated separately
          sessions: 0,
          bounceRate: 0,
          avgSessionDuration: 0,
        }
      );
    }
  } catch (error) {
    console.error('Error updating daily stats:', error);
  }
}

async function getPageViews(dateRange) {
  // Query pageview events for date range
  const params = {
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': 'ANALYTICS#PAGEVIEW',
      ':start': `EVENT#${dateRange.start}`,
      ':end': `EVENT#${dateRange.end}`,
    },
  };
  
  const result = await Model.query(params);
  
  // Group by day
  const dailyStats = {};
  result.Items.forEach(event => {
    const date = event.timestamp.split('T')[0];
    if (!dailyStats[date]) {
      dailyStats[date] = 0;
    }
    dailyStats[date]++;
  });
  
  // Convert to array format for charts
  const chartData = Object.entries(dailyStats).map(([date, count]) => ({
    date,
    value: count,
  }));
  
  return {
    total: result.Count,
    chartData,
    period: dateRange,
  };
}

async function getOverview(dateRange) {
  // Get daily stats for the period
  const params = {
    KeyConditionExpression: 'begins_with(pk, :pk) AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'ANALYTICS_STATS',
      ':sk': `STATS#DAILY#${dateRange.start.substring(0, 7)}`, // Month prefix
    },
  };
  
  const result = await Model.query(params);
  
  // Filter by date range and aggregate
  const overview = {
    totalPageviews: 0,
    totalUsers: 0,
    totalSessions: 0,
    bounceRate: 0,
    avgSessionDuration: 0,
    dailyStats: [],
  };
  
  result.Items.forEach(stat => {
    const statDate = stat.sk.split('#')[2];
    if (statDate >= dateRange.start && statDate <= dateRange.end) {
      overview.totalPageviews += stat.pageviews || 0;
      overview.totalUsers += stat.uniqueUsers || 0;
      overview.totalSessions += stat.sessions || 0;
      
      overview.dailyStats.push({
        date: statDate,
        pageviews: stat.pageviews || 0,
        users: stat.uniqueUsers || 0,
        sessions: stat.sessions || 0,
      });
    }
  });
  
  // Calculate averages
  if (overview.dailyStats.length > 0) {
    const totalBounceRate = overview.dailyStats.reduce((sum, day) => sum + (day.bounceRate || 0), 0);
    const totalSessionDuration = overview.dailyStats.reduce((sum, day) => sum + (day.avgSessionDuration || 0), 0);
    
    overview.bounceRate = totalBounceRate / overview.dailyStats.length;
    overview.avgSessionDuration = totalSessionDuration / overview.dailyStats.length;
  }
  
  return overview;
}

function getDateRange(period) {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
    case '1d':
      start.setDate(end.getDate() - 1);
      break;
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '90d':
      start.setDate(end.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(end.getFullYear() - 1);
      break;
    default:
      start.setDate(end.getDate() - 7);
  }
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getDeviceType(userAgent) {
  if (!userAgent) return 'desktop';
  
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile/.test(ua)) {
    return 'mobile';
  } else if (/tablet|ipad/.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('edge')) return 'Edge';
  if (ua.includes('opera')) return 'Opera';
  if (ua.includes('msie') || ua.includes('trident')) return 'IE';
  return 'Other';
}

function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('ios') || ua.includes('iphone')) return 'iOS';
  return 'Other';
}

module.exports = {
  track,
  get,
};
