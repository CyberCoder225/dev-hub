import { db } from '../../lib/db.js';
import jwt from 'jsonwebtoken';

function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  const token = authHeader.replace('Bearer ', '');
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Public: GET all pages
  if (req.method === 'GET') {
    try {
      const { limit = 50 } = req.query;
      const pages = await db.listPages(parseInt(limit));
      res.status(200).json({ pages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  // Protected: Create page
  if (req.method === 'POST') {
    const user = authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const pageData = {
        ...req.body,
        author: user.name,
        authorId: user.userId,
        status: 'draft',
        views: 0,
      };

      const pageId = await db.createPage(pageData);
      res.status(201).json({ 
        success: true, 
        pageId,
        message: 'Page created successfully' 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
