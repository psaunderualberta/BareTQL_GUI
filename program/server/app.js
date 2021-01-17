const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

const results = require('./routes/api/results');

app.use('/api/results', results);

const port = process.env.PORT || 3000;

app.listen(port, 'localhost', function(req, res) {
    console.log(`Server started on port ${port}`);
});