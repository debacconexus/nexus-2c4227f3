const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database tables
const initializeDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delegates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        country VARCHAR(100) NOT NULL,
        title VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        delegation_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resolutions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        resolution_number VARCHAR(100) UNIQUE,
        category VARCHAR(100),
        status VARCHAR(50) DEFAULT 'draft',
        sponsor_country VARCHAR(100),
        introduction_date DATE,
        voting_date DATE,
        description TEXT,
        full_text TEXT,
        advocacy_priority VARCHAR(50),
        nasw_position VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS voting_records (
        id SERIAL PRIMARY KEY,
        resolution_id INTEGER REFERENCES resolutions(id) ON DELETE CASCADE,
        country VARCHAR(100) NOT NULL,
        vote VARCHAR(20) NOT NULL CHECK (vote IN ('yes', 'no', 'abstain', 'absent')),
        delegate_id INTEGER REFERENCES delegates(id),
        vote_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resolution_id, country)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS multilateral_submissions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        submission_type VARCHAR(100),
        target_body VARCHAR(200),
        lead_country VARCHAR(100),
        co_sponsors TEXT[],
        submission_date DATE,
        deadline_date DATE,
        status VARCHAR(50) DEFAULT 'pending',
        document_url VARCHAR(500),
        summary TEXT,
        advocacy_strategy TEXT,
        nasw_involvement VARCHAR(200),
        priority_level VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS advocacy_activities (
        id SERIAL PRIMARY KEY,
        activity_type VARCHAR(100) NOT NULL,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        target_delegates INTEGER[],
        target_countries VARCHAR(100)[],
        related_resolution_id INTEGER REFERENCES resolutions(id),
        related_submission_id INTEGER REFERENCES multilateral_submissions(id),
        activity_date DATE,
        organizer VARCHAR(200),
        outcome TEXT,
        follow_up_required BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        organization VARCHAR(255),
        message TEXT,
        contact_type VARCHAR(100) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

// Initialize database on startup
initializeDatabase();

// CRUD API Routes for Delegates
app.get('/api/delegates', async (req, res) => {
  try {
    const { country, status, delegation_type } = req.query;
    let query = 'SELECT * FROM delegates WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (country) {
      paramCount++;
      query += ` AND country ILIKE $${paramCount}`;
      params.push(`%${country}%`);
    }
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    if (delegation_type) {
      paramCount++;
      query += ` AND delegation_type = $${paramCount}`;
      params.push(delegation_type);
    }

    query += ' ORDER BY country, name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching delegates:', err);
    res.status(500).json({ error: 'Failed to fetch delegates' });
  }
});

app.get('/api/delegates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM delegates WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delegate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching delegate:', err);
    res.status(500).json({ error: 'Failed to fetch delegate' });
  }
});

app.post('/api/delegates', async (req, res) => {
  try {
    const { name, country, title, email, phone, delegation_type, status, notes } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '[IGM-GOVERNED] Created via UN Policy Advocacy Tracking System';
    
    const result = await pool.query(
      `INSERT INTO delegates (name, country, title, email, phone, delegation_type, status, notes, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP) RETURNING *`,
      [name, country, title, email, phone, delegation_type, status || 'active', noteWithTag]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating delegate:', err);
    res.status(500).json({ error: 'Failed to create delegate' });
  }
});

app.put('/api/delegates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, country, title, email, phone, delegation_type, status, notes } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '';
    
    const result = await pool.query(
      `UPDATE delegates SET name = $1, country = $2, title = $3, email = $4, phone = $5, 
       delegation_type = $6, status = $7, notes = $8, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $9 RETURNING *`,
      [name, country, title, email, phone, delegation_type, status, noteWithTag, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delegate not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating delegate:', err);
    res.status(500).json({ error: 'Failed to update delegate' });
  }
});

app.delete('/api/delegates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM delegates WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delegate not found' });
    }
    res.json({ message: 'Delegate deleted successfully' });
  } catch (err) {
    console.error('Error deleting delegate:', err);
    res.status(500).json({ error: 'Failed to delete delegate' });
  }
});

// CRUD API Routes for Resolutions
app.get('/api/resolutions', async (req, res) => {
  try {
    const { category, status, sponsor_country, advocacy_priority } = req.query;
    let query = 'SELECT * FROM resolutions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    if (sponsor_country) {
      paramCount++;
      query += ` AND sponsor_country ILIKE $${paramCount}`;
      params.push(`%${sponsor_country}%`);
    }
    if (advocacy_priority) {
      paramCount++;
      query += ` AND advocacy_priority = $${paramCount}`;
      params.push(advocacy_priority);
    }

    query += ' ORDER BY voting_date DESC, introduction_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching resolutions:', err);
    res.status(500).json({ error: 'Failed to fetch resolutions' });
  }
});

app.get('/api/resolutions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM resolutions WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resolution not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching resolution:', err);
    res.status(500).json({ error: 'Failed to fetch resolution' });
  }
});

app.post('/api/resolutions', async (req, res) => {
  try {
    const { 
      title, resolution_number, category, status, sponsor_country, 
      introduction_date, voting_date, description, full_text, 
      advocacy_priority, nasw_position, notes 
    } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '[IGM-GOVERNED] Created via UN Policy Advocacy Tracking System';
    
    const result = await pool.query(
      `INSERT INTO resolutions (title, resolution_number, category, status, sponsor_country, 
       introduction_date, voting_date, description, full_text, advocacy_priority, 
       nasw_position, notes, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP) RETURNING *`,
      [title, resolution_number, category, status || 'draft', sponsor_country, 
       introduction_date, voting_date, description, full_text, advocacy_priority, 
       nasw_position, noteWithTag]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating resolution:', err);
    res.status(500).json({ error: 'Failed to create resolution' });
  }
});

app.put('/api/resolutions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, resolution_number, category, status, sponsor_country, 
      introduction_date, voting_date, description, full_text, 
      advocacy_priority, nasw_position, notes 
    } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '';
    
    const result = await pool.query(
      `UPDATE resolutions SET title = $1, resolution_number = $2, category = $3, 
       status = $4, sponsor_country = $5, introduction_date = $6, voting_date = $7, 
       description = $8, full_text = $9, advocacy_priority = $10, nasw_position = $11, 
       notes = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13 RETURNING *`,
      [title, resolution_number, category, status, sponsor_country, introduction_date, 
       voting_date, description, full_text, advocacy_priority, nasw_position, noteWithTag, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resolution not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating resolution:', err);
    res.status(500).json({ error: 'Failed to update resolution' });
  }
});

app.delete('/api/resolutions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM resolutions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resolution not found' });
    }
    res.json({ message: 'Resolution deleted successfully' });
  } catch (err) {
    console.error('Error deleting resolution:', err);
    res.status(500).json({ error: 'Failed to delete resolution' });
  }
});

// CRUD API Routes for Voting Records
app.get('/api/voting-records', async (req, res) => {
  try {
    const { resolution_id, country, vote } = req.query;
    let query = `
      SELECT vr.*, r.title as resolution_title, r.resolution_number, d.name as delegate_name
      FROM voting_records vr
      LEFT JOIN resolutions r ON vr.resolution_id = r.id
      LEFT JOIN delegates d ON vr.delegate_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (resolution_id) {
      paramCount++;
      query += ` AND vr.resolution_id = $${paramCount}`;
      params.push(resolution_id);
    }
    if (country) {
      paramCount++;
      query += ` AND vr.country ILIKE $${paramCount}`;
      params.push(`%${country}%`);
    }
    if (vote) {
      paramCount++;
      query += ` AND vr.vote = $${paramCount}`;
      params.push(vote);
    }

    query += ' ORDER BY vr.vote_date DESC, vr.country';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching voting records:', err);
    res.status(500).json({ error: 'Failed to fetch voting records' });
  }
});

app.post('/api/voting-records', async (req, res) => {
  try {
    const { resolution_id, country, vote, delegate_id, vote_date, notes } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '[IGM-GOVERNED] Vote recorded via UN Policy Advocacy Tracking System';
    
    const result = await pool.query(
      `INSERT INTO voting_records (resolution_id, country, vote, delegate_id, vote_date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [resolution_id, country, vote, delegate_id, vote_date, noteWithTag]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating voting record:', err);
    res.status(500).json({ error: 'Failed to create voting record' });
  }
});

app.put('/api/voting-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_id, country, vote, delegate_id, vote_date, notes } = req.body;
    const noteWithTag = notes ? `[IGM-GOVERNED] ${notes}` : '';
    
    const result = await pool.query(
      `UPDATE voting_records SET resolution_id = $1, country = $2, vote = $3, 
       delegate_id = $4, vote_date = $5, notes = $6 WHERE id = $7 RETURNING *`,
      [resolution_id, country, vote, delegate_id, vote_date, noteWithTag, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voting record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating voting record:', err);
    res.status(500).json({ error: 'Failed to update voting record' });
  }
});

app.delete('/api/voting-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM voting_records WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voting record not found' });
    }
    res.json({ message: 'Voting record deleted successfully' });
  } catch (err) {
    console.error('Error deleting voting record:', err);
    res.status(500).json({ error: 'Failed to delete voting record' });
  }
});

// CRUD API Routes for Multilateral Submissions
app.get('/api/multilateral-submissions', async (req, res) => {
  try {
    const { submission_type, target_body, lead_country, status, priority_level } = req.query;
    let query = 'SELECT * FROM multilateral_submissions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (submission_type) {
      paramCount++;
      query += ` AND submission_type = $${paramCount}`;
      params.push(submission_type);
    }
    if (target_body) {
      paramCount++;
      query += ` AND target_body ILIKE $${paramCount}`;
      params.push(`%${target_body}%`);
    }
    if (lead_country) {
      paramCount++;
      query += ` AND lead_country ILIKE $${paramCount}`;
      params.push(`%${lead_country}%`);
    }
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    if (priority_level) {
      paramCount++;
      query += ` AND priority_level = $${param