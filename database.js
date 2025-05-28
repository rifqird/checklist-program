const http = require('http');
const url = require('url');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'rdzkey';

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // change as needed
  database: 'inventory_management',
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL database.');
});

function sendResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      callback(null, JSON.parse(body));
    } catch (err) {
      callback(err);
    }
  });
}
function verifyToken(req, callback) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return callback(new Error('Token missing'));
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return callback(err);
    callback(null, user);
  });
}
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  // GET /products
  if (req.method === 'POST' && pathname === '/login') {
    parseBody(req, (err, body) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid JSON' }));
      }

      const { username, password } = body;

      const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';
      db.query(sql, [username, password], (err, results) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Database error' }));
        }

        if (results.length > 0) {
          // Generate JWT token
          const user = { id: results[0].id, username: results[0].username };
          const token = jwt.sign(user, SECRET_KEY, { expiresIn: '1h' });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Login successful', token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid credentials' }));
        }
      });
    });
  }
  else if (req.url === '/profile' && req.method === 'GET') {
    // Protected route
    verifyToken(req, (err, user) => {
      if (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Unauthorized' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Protected data', user }));
    });
  }
  else if (req.method === 'POST' && pathname === '/register') {
    parseBody(req, (err, data) => {
      if (err || !data.email || !data.password || !data.username) {
        return sendResponse(res, 400, { error: 'Invalid input' });
      }
      const { email,password,username } = data;
      db.query(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, password, email],
        (err, result) => {
          if (err) return sendResponse(res, 500, { error: err.message });
          sendResponse(res, 201, { message: 'Users created', usersId: result.insertId });
        }
      );
    });
  }
  else if (req.method === 'GET' && pathname === '/products') {
    verifyToken(req, (err, user) => {
      if (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Unauthorized' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Protected data', user }));
    });
  }

  // GET /product?id=1
  else if (req.method === 'GET' && pathname === '/checklist') {
    verifyToken(req, (err, user) => {
      if (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Unauthorized' }));
      }
      const id = parseInt(query.id);
      db.query('SELECT * FROM checklists', [id], (err, results) => {
        if (err) return sendResponse(res, 500, { error: err.message });
        if (results.length === 0) return sendResponse(res, 404, { error: 'Checklist not found' });
        sendResponse(res, 200, results[0]);
      });
    });
  }

  else if (req.method === 'POST' && pathname === '/checklist') {
    verifyToken(req, (err, user) => {
      if (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Unauthorized' }));
      }

      parseBody(req, (err, data) => {
        if (err || !data.name ) {
          return sendResponse(res, 400, { error: 'Invalid input' });
        }
        const { name } = data;
        db.query(
          'INSERT INTO checklists (name) VALUES (?)',
          [name],
          (err, result) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 201, { message: 'Checklists', checklistId: result.insertId });
          }
        );
      });
    });
    
  }
  // POST /product
  else if (req.method === 'POST' && pathname === '/products') {
    parseBody(req, (err, data) => {
      if (err || !data.name || !data.price || !data.stock || !data.category) {
        return sendResponse(res, 400, { error: 'Invalid input' });
      }
      const { name, price, stock, category } = data;
      db.query(
        'INSERT INTO products (name, price, stock, category) VALUES (?, ?, ?, ?)',
        [name, price, stock, category],
        (err, result) => {
          if (err) return sendResponse(res, 500, { error: err.message });
          sendResponse(res, 201, { message: 'Product created', productId: result.insertId });
        }
      );
    });
  }

  // PUT /product?id=1
  else if (req.method === 'PUT' && pathname === '/products') {
    const id = parseInt(query.id);
    parseBody(req, (err, data) => {
      if (err || !data.name || !data.price || !data.stock || !data.category) {
        return sendResponse(res, 400, { error: 'Invalid input' });
      }
      const { name, price, stock, category } = data;
      db.query(
        'UPDATE products SET name=?, price=?, stock=?, category=? WHERE productId=?',
        [name, price, stock, category, id],
        (err, result) => {
          if (err) return sendResponse(res, 500, { error: err.message });
          if (result.affectedRows === 0) return sendResponse(res, 404, { error: 'Product not found' });
          sendResponse(res, 200, { message: 'Product updated' });
        }
      );
    });
  }
  else if (req.method === 'GET' && pathname === '/transactions') {
    db.query('SELECT * FROM transactions', (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      sendResponse(res, 200, results);
    });
  }
  else if (req.method === 'GET' && pathname === '/transaction') {
    const id = parseInt(query.id);
    db.query('SELECT * FROM transactions WHERE transactionId = ?', [id], (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      if (results.length === 0) return sendResponse(res, 404, { error: 'Transaction not found' });
      sendResponse(res, 200, results[0]);
    });
  }
  else if (req.method === 'POST' && pathname === '/transaction') {
    parseBody(req, (err, data) => {
      if (err || !data.productId || !data.quantity || !data.type) {
        return sendResponse(res, 400, { error: 'Invalid input' });
      }
  
      const { productId, quantity, type, customerId = null } = data;
  
      // Step 1: Check product exists
      db.query('SELECT * FROM products WHERE productId = ?', [productId], (err, results) => {
        if (err) return sendResponse(res, 500, { error: err.message });
        if (results.length === 0) return sendResponse(res, 404, { error: 'Product not found' });
  
        const product = results[0];
        let newStock = product.stock;
  
        if (type === 'IN') {
          newStock += quantity;
        } else if (type === 'OUT') {
          if (product.stock < quantity) {
            return sendResponse(res, 400, { error: 'Not enough stock' });
          }
          newStock -= quantity;
        } else {
          return sendResponse(res, 400, { error: 'Invalid transaction type' });
        }
  
        // Step 2: Insert transaction
        db.query(
          'INSERT INTO transactions (productId, quantity, type, customerId) VALUES (?, ?, ?, ?)',
          [productId, quantity, type, customerId],
          (err, result) => {
            if (err) return sendResponse(res, 500, { error: err.message });
  
            // Step 3: Update product stock
            db.query(
              'UPDATE products SET stock = ? WHERE productId = ?',
              [newStock, productId],
              (err2) => {
                if (err2) return sendResponse(res, 500, { error: err2.message });
  
                return sendResponse(res, 201, {
                  message: 'Transaction completed',
                  transactionId: result.insertId,
                  newStock
                });
              }
            );
          }
        );
      });
    });
  }

  // DELETE /product?id=1
  else if (req.method === 'DELETE' && pathname === '/checklist') {
    const id = parseInt(query.id);
    db.query('DELETE FROM checklists WHERE id = ?', [id], (err, result) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      if (result.affectedRows === 0) return sendResponse(res, 404, { error: 'checklist not found' });
      sendResponse(res, 200, { message: 'Checklist deleted' });
    });
  }
  else if (req.method === 'GET' && pathname === '/product_category') {
    const category = query.category;
  
    let sql = 'SELECT * FROM products';
    let params = [];
  
    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }
  
    db.query(sql, params, (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      sendResponse(res, 200, results);
    });
  }
  else if (req.method === 'GET' && pathname === '/inventory/value') {
    const productId = parseInt(query.productId);
    if (!productId) {
      return sendResponse(res, 400, { error: 'productId is required' });
    }
  
    const sql = 'SELECT productId, name, price, stock, (price * stock) AS totalValue FROM products WHERE productId = ?';
    db.query(sql, [productId], (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      if (results.length === 0) return sendResponse(res, 404, { error: 'Product not found' });
      sendResponse(res, 200, results[0]);
    });
  }
  else if (req.method === 'GET' && pathname === '/transactions/product') {
    const productId = parseInt(query.productId);
    if (!productId) {
      return sendResponse(res, 400, { error: 'productId is required' });
    }
  
    db.query(
      'SELECT * FROM transactions WHERE productId = ? ORDER BY transactionId DESC',
      [productId],
      (err, results) => {
        if (err) return sendResponse(res, 500, { error: err.message });
        sendResponse(res, 200, results);
      }
    );
  }
  // Not Found
  else if (req.method === 'GET' && pathname === '/reports/inventory') {
    const sql = 'SELECT SUM(price * stock) AS totalValue FROM products';
    db.query(sql, (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      const total = results[0].totalValue || 0;
      sendResponse(res, 200, { totalInventoryValue: total });
    });
  }
  else if (req.method === 'GET' && pathname === '/reports/low-stock') {
    const sql = `
      SELECT * FROM products
      ORDER BY stock ASC
      LIMIT 1
    `;
    db.query(sql, (err, results) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      if (results.length === 0) return sendResponse(res, 404, { error: 'No products found' });
      sendResponse(res, 200, results[0]);
    });
  }
  else {
    sendResponse(res, 404, { error: 'Not Found' });
  }
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});