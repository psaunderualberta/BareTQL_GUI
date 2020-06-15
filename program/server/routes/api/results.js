const express = require('express');
const Database = require('../../data/db.js');

const router = express.Router();

const db = new Database('server/data/database.db');

router.get('/keyword', (req, res) => {
    /* Route used when performing keyword searches */
    db.keywordSearch(req.query.keyword)
    .then((query) => {
        res.send(query);
    })
    .catch((err) => {   
        res.send(err);
    })
});

router.get('/seed-set', (req, res) => {
    /* Route used when 'posting' the seed-set to the database */
    db.postSeedSet(req.query.tableIDs, req.query.rowIDs)
    .then((seedSet) => {
        res.send(seedSet);
    })
    .catch((err) => {
        res.send(err);
    })
});

router.get('/delete', (req, res) => {
    /* Used to delete columns from the user's table */
    db.deleteCols(req.query.del)
    .then((result) => {
        res.send(result)
    })
    .catch((err) => {
        res.send(err);
    })
})

router.get('/dot-op', (req, res) => {
    /* Route used when handling dot operations */
    db.handleDotOps(req.query.dotOp, req.query.sliders)
    .then((result) => {
        res.send(result);
    })
    .catch((err) => {
        res.send(err);
    })
})

module.exports = router;