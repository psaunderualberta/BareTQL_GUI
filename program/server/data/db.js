/* REFERENCES 
 * https://stackabuse.com/a-sqlite-tutorial-with-node-js/
 * https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md */

const sqlite3 = require('better-sqlite3');
const leven = require('leven');
const ttest = require('ttest');
const statistics = require('simple-statistics')
const combinatorics = require('js-combinatorics')

/* SCHEMA 
 * cells(table_id, row_id, col_id, value)
 * titles(table_id, title)
 * captions(table_id, caption)
 * headers(table_id, col_id, header)
 * keywords_cell_header(keyword, table_id, row_id, col_id,location)
 * keywords_title_caption(table_id, location, keyword) */

/* An instance of the Database class represents a database */
class Database {

    /* Constructor to initialize the database class */
    constructor(dbPath) {
        try {
            this.db = new sqlite3(dbPath, {
                readonly: true,
            })
        } catch (error) {
            console.log(`Something went wrong with dbPath: ${dbPath}: ${error}`);
            return
        }

        console.log(`Connected to database at ${dbPath}`);

        this.seedSet = {
            sliders: [],
            rows: [],
            types: [],
            table_ids: '',
            row_ids: '',
            numCols: 0,
        };

        this.functions = {
            xr: this.xr,
            xc: this.xc,
            fill: this.fill,
        }

        this.cellSep = ' || '

        /* Aggregate function to turn col into array 
         * https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
         * Accessed June 23rd, 2020 */
        this.db.aggregate('toArr', {
            start: () => [],
            step: (array, nextValue) => {
                array.push(nextValue);
            },
            result: array => JSON.stringify(array)
        });

        /* We are using Welch's t-test to calculate the probability
         * of two numerical columns being related
         * https://en.wikipedia.org/wiki/Welch%27s_t-test
         * Accessed June 23 2020 */
        this.db.function('T_TEST', (arr1, arr2) => {

            arr1 = JSON.parse(arr1).map(num => Number(num))
            arr2 = JSON.parse(arr2).map(num => Number(num))

            return this.ttestCases(arr1, arr2)
        })

        this.db.function('SEM', (arr) => {
            arr = JSON.parse(arr).map(num => Number(num))

            if (arr.length === 0) { // Entire column is NULL, don't want in result
                return Infinity
            }

            return statistics.standardDeviation(arr) / (Math.sqrt(arr.length)) // division by 0 won't happen
        })

        this.db.function('OVERLAP_SIM', (ssCol, keyCol) => {
            ssCol = JSON.parse(ssCol).map(v => String(v))
            keyCol = JSON.parse(keyCol)

            return this.overlapSim(ssCol, keyCol)
        })
    }

    keywordSearch(keywords) {
        /* This object queries the database for keywords found in cells, headers, 
            titles, and captions and returns the rows that matched
    
            Arguments: 
            - keyword: The keyword to be searched.
            - params: Optional parameters
    
            Returns:
            - Promise
        */
        var results = [];

        keywords = this.makeStrArr(keywords)

        var keywordQMarks = this.getQMarks(keywords);

        /* Nested query is due to same keyword appearing in multiple
         * locations on same table, leading to repeated rows in output */
        const stmt = this.db.prepare(`
            SELECT r.table_id, title, row_id, value, rowCount
            FROM
            (
                SELECT t.table_id, t.title , c.row_id, GROUP_CONCAT(c.value, ' || ') AS value
                FROM (
                    SELECT DISTINCT table_id, row_id 
                    FROM keywords_cell_header 
                    WHERE keyword IN ${keywordQMarks}
                ) k NATURAL JOIN titles t NATURAL JOIN cells c
                WHERE c.location != 'header'
                GROUP BY t.table_id, c.row_id
    
                UNION
    
                SELECT t.table_id, t.title , c.row_id, GROUP_CONCAT(c.value, ' || ') AS value
                FROM (
                    SELECT DISTINCT table_id 
                    FROM keywords_title_caption 
                    WHERE keyword IN ${keywordQMarks}
                ) k NATURAL JOIN titles t NATURAL JOIN cells c
                GROUP BY t.table_id, c.row_id
    
                ORDER BY t.table_id, c.row_id
            ) r

            LEFT JOIN 
            
            (
                SELECT table_id, COUNT(DISTINCT row_id) AS rowCount
                FROM cells
                GROUP BY table_id
            ) c
            
            ON r.table_id = c.table_id;

        `)
        return new Promise((resolve, reject) => {
            this.all(
                stmt,
                [...keywords, ...keywords],
                results
            )
                .then(() => {
                    resolve(results)
                })
                .catch((err) => {
                    reject(err)
                })
        })
    }

    postSeedSet(tableIDs, rowIDs) {
        /* This method 'posts' the seed set to the database.
         * In reality, we store the seed set as an attribute of the db instance,
         * so that the seed set does not persist. We use the term 'post' in order to
         * clarify that we are giving information to the instance, although it is not the 
         * same as a POST http request.
         * 
         * Arguments:
         * - tableIDs: the list of tableIDs. 
         * - rowIDs: the list of rowIDs, organized to correspond 1-1 with tableIDs based on index.
         * - sliderValues: the values of the sliders used to determine 'stickiness', based on the user's input
         * 
         * Returns:
         * - Promise: resolves with nothing, rejects with error.
         */
        var customTable = [];
        rowIDs = this.makeStrArr(rowIDs)
        tableIDs = this.makeStrArr(tableIDs)

        this.seedSet = {
            table_ids: tableIDs.map(id => id.trim()),
            row_ids: rowIDs.map(id => id.trim()),
            uniqueCols: [],
            sliders: [],
            numCols: 0,
            types: [],
            rows: [],
        };

        /* Create 'table' based on values of tableIDs, rowIDs
         * https://stackoverflow.com/questions/985295/can-you-define-literal-tables-in-sql
         * Accessed June 9th, 2020
         * 
         * This breaks if we have more than 500 rows in the seed set, but if a user is selecting 500
         * rows then that's their problem. */
        for (let i = 0; i < rowIDs.length; i++) {
            customTable.push(`SELECT ${tableIDs[i].trim()} AS table_id, ${rowIDs[i].trim()} AS row_id`)
        }
        customTable = `(${customTable.join(' UNION ALL ')})`

        const stmt = this.db.prepare(` 
            SELECT DISTINCT table_id, row_id, GROUP_CONCAT(value, '${this.cellSep}') AS value
            FROM cells c NATURAL JOIN ${customTable}
            GROUP BY table_id, row_id;
        `)

        return new Promise((resolve, reject) => {
            this.all(stmt, [], this.seedSet['rows'])
                .then(() => {
                    /* 'unpack' results of query */
                    this.seedSet['rows'] = this.seedSet['rows'].map(row => row['value'])

                    this.cleanRows(true, false);

                    /* Set sliders to defaults */
                    for (let i = 0; i < this.seedSet['rows'][0].split(this.cellSep).length; i++) {
                        this.seedSet['sliders'].push(50);
                    }



                    resolve()
                })
                .catch((err) => {
                    console.log(err)
                    reject(err)
                })
        })
    }

    cleanRows(changeSeed, grouping) {
        /* Performs the steps to clean the rows of the seed set,
         * including finding the number of cols, filling Null values, 
         * grouping columns, and getting the types of the columns
         * 
         * Returns: 
         * - None, as it does the operations in-place */

        if (changeSeed)
            this.seedSet['numCols'] = this.seedSet['rows'].map(row => row.split(' || ').length).reduce((a, b) => Math.max(a, b), 0)

        this.fillNulls(this.seedSet['rows'])

        /* Group cols only if we have a lot of data, otherwise let the user perform all organization */
        if (grouping && (new Set(this.seedSet['table_ids']).size > 2 || this.seedSet['rows'].length > 10)) {
            this.groupCols(this.seedSet['rows'])
        }


        if (changeSeed)
            this.seedSet['types'] = this.getTypes(this.seedSet['rows'])

        /* We access these values often enough that they are worth storing to save time */
        this.seedSet['numNumerical'] = this.seedSet['types'].filter(type => type === 'numerical').length
        this.seedSet['numTextual'] = this.seedSet['types'].filter(type => type === 'text').length
        this.seedSet['numNULL'] = this.seedSet['types'].filter(type => type === 'NULL').length
    }

    groupCols(rows) {
        /* Attempts to group columns based on similar datatypes
         * The datatypes we are considering are: 'null', 'numerical',
         * and 'text' if neither of these two options are satisfied.
         * This is designed to be a general grouping measure, as 
         * we provide the user with the option to manually rearrange cells themselves.
         * Cells are only swapped across columns; they are not swapped between rows.
         * 
         * We are grouping the columns thusly: 
         * [PRIMARY KEY (unchanged), ...text, ...numerical, ...empty cells]
         * 
         * Arguments:
         * - rows: The array of rows, with cells separated with the phrase '||'
         * 
         * Returns:
         * - the 'rows' argument with each row (possibly) rearranged according
         *   to the description above.
         */

        var curRow;

        for (let i = 0; i < rows.length; i++) {

            /* Split rows into arrays of cells */
            curRow = rows[i].split(' || ');

            /* I created this O(n) 'sorting' algorithm for 3 items w/ duplicates
            * when solving the leetcode problem 'sort colours': 
            * https://leetcode.com/problems/sort-colors/ */
            var numPointer = 1;
            var emptyPointer = 1;

            for (let j = 1; j < curRow.length; j++) {
                if (curRow[j] === "NULL") continue;

                this.swap(curRow, emptyPointer, j)
                if (isNaN(curRow[emptyPointer])) {
                    this.swap(curRow, emptyPointer, numPointer)
                    numPointer++;
                }

                emptyPointer++;
            }

            rows[i] = curRow.join(' || ');
        }
    }

    swapCells(rowIDs, colIDs) {
        /* Swaps the two cells selected by the user, denoted
         * by the positions of values in rowIDs, colIDs
         * 
         * Arguments:
         * - rowIDs: the row ids of the cells to be swapped in the seed set
         * - colIDs: the column ids of the cells to be swapped, matching indices
         *      with rowIDs
         * 
         * Returns:
         * - Promise which resolves if cells were successfully swapped, rejection otherwise */

        return new Promise((resolve, reject) => {
            try {
                var rows = this.seedSet['rows'].map(row => row.split(' || '))

                var tmp = rows[rowIDs[0]][colIDs[0]]
                rows[rowIDs[0]][colIDs[0]] = rows[rowIDs[1]][colIDs[1]]
                rows[rowIDs[1]][colIDs[1]] = tmp;

                this.seedSet['rows'] = rows.map(row => row.join(' || '))

                this.cleanRows(true, false)

                resolve(this.seedSet);

            } catch (err) {
                reject(err);
            }

        })
    }

    deleteCols(cols) {
        /* Deletes the specified columns from the user's table.
         * 
         * Arguments:
         * - cols: The array of columns to delete
         * 
         * Returns:
         * - Promise, resolving if successfully deleted columns, otherwise rejected.
         */
        cols = this.makeStrArr(cols);
        var row;
        return new Promise((resolve, reject) => {
            try {

                /* Delete slider cells */
                cols.forEach(col => {
                    delete this.seedSet['sliders'][col - 1]
                })
                this.seedSet['sliders'] = this.seedSet['sliders'].filter(val => typeof val !== 'undefined')

                /* Delete columns in the table */
                for (let i = 0; i < this.seedSet['rows'].length; i++) {
                    row = this.seedSet['rows'][i].split(this.cellSep)
                    cols.forEach(col => {
                        delete row[col - 1] // We use 1-indexing on front-end, convert to 0-indexing
                    })

                    row = row.filter(cell => typeof cell !== 'undefined')
                    if (row.length > 0) {
                        this.seedSet['rows'][i] = row.join(this.cellSep);
                    } else {
                        this.seedSet['rows'][i] = row
                    }
                }

                this.cleanRows(true, false)

                resolve(this.seedSet);
            } catch (error) {
                reject(error)
            }
        })
    }

    handleDotOps(dotOp, sliderValues, uniqueCols) {
        /* Handles all dot operations, calling the correct functions to mutate the 
         * seed set attribute. The first time this method is called, we are initializing 
         * the operations page and so return the rows of the seed set without changing them.
         * 
         * Arguments:
         * - dotOp: the operation to be performed on the seed set.
         * 
         * Returns:
         * - Promise: resolves with new rows of seed set, rejects with error.
         */

        var seedCopy;

        return new Promise((resolve, reject) => {
            try {

                /* Rather than adjusting existing slider values and unique columns,
                 * we just reset all values to those currently set by the user 
                 * (even if they haven't changed) */
                for (let i = 0; i < sliderValues.length; i++) {
                    this.seedSet['sliders'][i] = Number(sliderValues[i])
                }

                this.seedSet['uniqueCols'] = []
                for (let i = 0; i < uniqueCols.length; i++) {
                    this.seedSet['uniqueCols'].push(uniqueCols[i] - 1)
                }

                /* Handle specific dot op */
                new Promise((res, rej) => {
                    /* Only upon initialization of the dot-ops page OR user deleted all columns */
                    if (dotOp === 'undefined' || this.seedSet['rows'].every(row => row.length === 0)) {
                        res(this.seedSet['rows'].flat())
                    } else if (dotOp === 'xr') {
                        this.xr().then((results) => { res(results) })
                    } else {
                        rej(`dotOp specified (${dotOp}) is not possible`)
                    }
                }).then((results) => {
                    seedCopy = { ...this.seedSet }

                    if (typeof results['rows'] !== 'undefined') {
                        this.fillNulls(results['rows'])
                        seedCopy['rows'] = results['rows']
                        seedCopy['info'] = results['info']
                    } else {
                        this.fillNulls(results)
                        seedCopy['rows'] = results
                    }

                    resolve(seedCopy)
                })
            } catch (error) {
                reject(error)
            }
        })
    }

    xr() {
        /* Delegates tasks related to the set expansion of
         * seed set rows.
         *
         * Returns:
         * - Promise which resolves if successfully completed search,
         *      rejects otherwise
         *
         */

        return new Promise((resolve, reject) => {
            try {
                this.getMatchingTables()
                    .then((results) => {
                        return this.getTextualMatches(results)
                    }).then((results) => {
                        return this.getNumericalMatches(results)
                    }).then((results) => {
                        return this.getNULLMatches(results)
                    }).then((results) => {
                        return this.getPermutedRows(results)
                    }).then((results) => {
                        return this.rankResults(results);
                    }).then((results) => {
                        resolve(results)
                    })
                    .catch((error) => {
                        console.log(error);
                        resolve([])
                    })
            } catch (error) {
                console.log(error);
                reject(error);
            }
        })
    }

    getMatchingTables() {
        /* Detects the tables which are likely to be related to the 
         * seed set. This is done by evaluating the similarity between
         * the LH-most textual column in the seed set and textual 
         * columns in a table, and similarly for numerical columns. We then 
         * take the intersection of the tables which matched textually and numerically
         * 
         * Arguments:
         * None
         * 
         * Returns:
         * - Promise which resolves with tables if querying is successful, rejects otherwise. */
        var rows = this.seedSet['rows'].map(row => row.split(' || '));
        var textSlider = [];
        var numSlider = [];
        var textCol = [];
        var numCol = [];
        var tables = [];
        var params = [];
        var stmt = "";

        var getFirstCol = function (seedSet, type, slider, arr) {
            for (let i = 0; i < seedSet['types'].length; i++) {
                if (seedSet['types'][i] !== type)
                    continue

                slider.push(seedSet['sliders'][i])
                for (let j = 0; j < rows.length; j++) {
                    if (rows[j][i] !== "NULL")
                        arr.push(rows[j][i])
                }
                break
            }
        }

        getFirstCol(this.seedSet, 'text', textSlider, textCol)
        getFirstCol(this.seedSet, 'numerical', numSlider, numCol)

        textSlider = textSlider[0]; numSlider = numSlider[0];
        textCol = JSON.stringify(textCol); numCol = JSON.stringify(numCol.map(num => Number(num)));

        return new Promise((resolve, reject) => {
            try {
                if (this.seedSet['numTextual']) {
                    stmt += `
                        SELECT table_id, title
                        FROM columns NATURAL JOIN titles NATURAL JOIN (
                            SELECT table_id
                            FROM cells NATURAL JOIN columns
                            WHERE type = 'text'
                            AND col_id = 0
                            GROUP BY table_id, col_id
                            HAVING OVERLAP_SIM(?, toArr(value)) >= ?
                        )
                        WHERE type = 'text'
                        GROUP BY table_id
                        HAVING COUNT(DISTINCT col_id) >= ?
        
                        INTERSECT
                    `
                    params.push(...[textCol, textSlider / 100, this.seedSet['numTextual']])
                }

                if (this.seedSet['numNumerical']) {
                    stmt += `
                        SELECT DISTINCT table_id, title
                        FROM cells c NATURAL JOIN columns col NATURAL JOIN titles   
                        NATURAL JOIN
                        (
                            SELECT table_id
                            FROM columns
                            WHERE type = 'numerical'
                            GROUP BY table_id
                            HAVING COUNT(DISTINCT col_id) >= ?
                        )
                        WHERE col.type = 'numerical' 
                        AND c.location != 'header'
                        AND c.value != ''
                        GROUP BY table_id, col_id
                        HAVING MAX(OVERLAP_SIM(?, toArr(value)), T_TEST(?, toArr(value))) >= ?
        
                        INTERSECT
                    `
                    params.push(...[this.seedSet['numNumerical'], numCol, numCol, numSlider / 100])
                }

                stmt += `
                    SELECT table_id, title
                    FROM cells NATURAL JOIN titles
                    GROUP BY table_id
                    HAVING MAX(col_id) >= ?;
                `
                params.push(this.seedSet['types'].length - 1)

                stmt = this.db.prepare(stmt)
                this.all(stmt, params, tables)

                resolve(tables)
            } catch (error) {
                reject(error)
            }
        })
    }

    getTextualMatches(tables) {
        /* Gets the 'best' textual permutation for all 
         * tables found by getMatchingTables(), where 'best' 
         * is determined by the largest cumulative overlap similarity
         * for a permutation.
         * 
         * Arguments:
         * - tables: The array of tables that satisfy the constraints of getMatchingTables()
         * 
         * Returns:
         * - Promise that resolves if querying is successful, rejects otherwise */
        var rows = this.seedSet['rows'].map(row => row.split(' || '));
        var sliderIndices = [];
        var curCumProbs = [];
        var ssCols = [];
        var pValDP = [];
        var cols = [];
        var bestPerm;
        var column;
        var pass;
        var stmt;



        for (let i = 0; i < this.seedSet['types'].length; i++) {
            if (this.seedSet['types'][i] !== 'text')
                continue

            ssCols.push([])
            sliderIndices.push(this.seedSet['sliders'][i])
            column = ssCols[ssCols.length - 1]
            for (let j = 0; j < rows.length; j++) {
                if (rows[j][i] !== "NULL")
                    column.push(rows[j][i])
            }
        }

        for (let i = 0; i < sliderIndices.length; i++)
            pValDP.push([])

        return new Promise((resolve, reject) => {
            try {

                /* The steps required to find the permutations of the textual columns
                * are quite similar to the steps for finding numerical column permutations.
                * However, there are a few important differences that prevent the two operations
                * from being combined into one function, such as the method used to score the permutations
                * and the format required of the columns retrieved */
                var result;
                for (let i = 0; i < tables.length; i++) {
                    result = tables[i]
                    cols = [];
                    stmt = this.db.prepare(`
                        SELECT table_id, col_id, toArr(value) AS column
                        FROM cells c NATURAL JOIN columns col
                        WHERE col.type = 'text'
                        AND c.value != ''
                        AND c.location != 'header'
                        AND table_id = ?
                        GROUP BY table_id, col_id
                    `)

                    this.all(stmt, [result['table_id']], cols)

                    /* 'refine' result of query */
                    cols = {
                        columns: cols.map(res => JSON.parse(res['column'])),
                        colIDs: cols.map(res => res['col_id'])
                    }

                    /* Re-initialize dynamic programming array */
                    this.resetDPArr(pValDP, sliderIndices.length, Math.max(...cols['colIDs']))

                    /* Fill DP array */
                    for (let i = 0; i < ssCols.length; i++) {
                        cols['columns'].forEach((col, j) => {
                            pValDP[i][cols['colIDs'][j]] = this.overlapSim(ssCols[i], col)
                        })
                    }

                    bestPerm = {
                        table_id: result['table_id'],
                        textualPerm: [],
                        textScore: 0,
                    };
                    /* If the key column in the seed set has a successful mapping,
                    * Iterate over all permutations of the columns, 
                    * finding the one that returns the lowest cumulative overlap similarity */

                    if (this.seedSet['numTextual']) {
                        combinatorics.permutation(cols['colIDs'], this.seedSet['numTextual']).forEach(perm => {
                            curCumProbs = [];

                            for (let i = 0; i < ssCols.length; i++) {
                                curCumProbs.push(pValDP[i][perm[i]])
                            }

                            pass = curCumProbs.every((val, i) => val >= sliderIndices[i] / 100)
                            curCumProbs = curCumProbs.reduce((a, b) => a + b, 0)

                            if (pass && curCumProbs > bestPerm['textScore']) {
                                bestPerm['textualPerm'] = perm;
                                bestPerm['textScore'] = curCumProbs
                            }
                        })
                    }

                    if (!this.seedSet['numTextual'] || bestPerm['textualPerm'].length !== 0)
                        tables[i] = bestPerm
                    else
                        tables.splice(i--, 1)
                }

                resolve(tables)
            } catch (error) {
                reject(error)
            }
        })
    }

    getNumericalMatches(tables) {
        /* For each table in the list of tables from 'getMatchingTables',
         * we check all permutations of the table's numerical columns in order
         * to see which permutation is the 'best'. A permutation is scored using "Fisher's 
         * method" of combining p-values, where the p-value for each pair of columns
         * is the maximum of overlap similarity and the p-value of Welch's t-test. These
         * p-values are combined using Fisher's Method in order to produce a Chi-square test statistic,
         * and the permutation with the highest test statistic is determined to be the best.
         * 
         * Arguments:
         * - tables: The list of tables from getMatchingTables()
         * 
         * Returns:
         * - Promise which resolves if column mapping is successful, rejects otherwise.*/
        var rows = this.seedSet['rows'].map(row => row.split(' || '));
        var sliderIndices = [];
        var column = [];
        var ssCols = [];
        var table;
        var pValDP = [];
        var cols = [];
        var curChiTestStat;
        var stmt;

        for (let i = 0; i < this.seedSet['types'].length; i++) {
            if (this.seedSet['types'][i] !== 'numerical')
                continue

            ssCols.push([])
            sliderIndices.push(this.seedSet['sliders'][i])
            column = ssCols[ssCols.length - 1]
            for (let j = 0; j < rows.length; j++) {
                if (rows[j][i] !== "NULL")
                    column.push(Number(rows[j][i]))
            }
        }

        return new Promise((resolve, reject) => {
            try {
                for (let i = 0; i < this.seedSet['numNumerical']; i++)
                    pValDP.push([])
                /* Get the best permutation for numerical columns for each table */
                for (let i = 0; i < tables.length; i++) {
                    table = tables[i]
                    cols = [];
                    stmt = this.db.prepare(`
                        SELECT table_id, col_id, toArr(value) AS column
                        FROM cells c NATURAL JOIN columns col
                        WHERE col.type = 'numerical'
                        AND c.value != ''
                        AND c.location != 'header'
                        AND table_id = ?
                        GROUP BY table_id, col_id
                        `)

                    this.all(stmt, [table['table_id']], cols)

                    /* 'refine' result of query */
                    cols = {
                        columns: cols.map(res => JSON.parse(res['column']).map(num => Number(num))),
                        colIDs: cols.map(res => res['col_id'])
                    }

                    /* Re-initialize dynamic programming array */
                    this.resetDPArr(pValDP, this.seedSet['numNumerical'], Math.max(...cols['colIDs']))

                    /* Fill DP array */
                    for (let i = 0; i < ssCols.length; i++) {
                        cols['columns'].forEach((col, j) => {
                            pValDP[i][cols['colIDs'][j]] = Math.log(
                                Math.max(this.ttestCases(ssCols[i], col), this.overlapSim(ssCols[i], col))
                            )
                        })
                    }

                    table['numericalPerm'] = [];
                    table['chiTestStat'] = Infinity;

                    curChiTestStat = 0;

                    /* Iterate over all permutations of the columns, 
                    * finding the one that returns the highest chi^2 test statistic
                    * by using Fisher's method */
                    if (this.seedSet['numNumerical'] && cols['colIDs'].length < Math.max(this.seedSet['numCols'], 14)) {
                        combinatorics.permutation(cols['colIDs'], this.seedSet['numNumerical']).forEach(idPerm => {
                            curChiTestStat = 0;

                            for (let i = 0; i < ssCols.length; i++) {
                                curChiTestStat += pValDP[i][idPerm[i]]
                            }

                            curChiTestStat *= -2;

                            if (curChiTestStat < table['chiTestStat']) {

                                table['numericalPerm'] = idPerm;
                                table['chiTestStat'] = curChiTestStat
                            }
                        })
                    }
                    if (this.seedSet['numNumerical'] && table['numericalPerm'].length === 0)
                        tables.splice(i--, 1)

                    /* Set a 'base score' for the table to be used when ranking rows */
                    else if (this.seedSet['numNumerical'])
                        table['score'] = table['chiTestStat'] + table['textScore']
                    else
                        table['score'] = table['textScore']
                }

                resolve(tables);
            } catch (error) {
                reject(error);
            }
        })
    }

    getNULLMatches(tables) {
        /* If there are 'n' columns in the seed set which are entirely filled with
         * 'NULL', this function will find the first 'n' columns in ascending order which 
         * are not already in the numericalPerm or textualPerm for the table. It will then add them
         * to the table's 'NULLperm'.
         * 
         * Arguments:
         * - tables: The list of table objects from getMatchingTables(), after textual and numerical column mapping
         * 
         * Returns:
         * - Promise which resolves if querying is successful, rejects otherwise */
        var indices;
        var stmt;

        return new Promise((resolve, reject) => {
            try {
                /* If there are no NULL columns, bypass the querying */
                if (this.seedSet['numNULL']) {
                    for (let table of tables) {
                        table['NULLperm'] = []
                        indices = `(${table['numericalPerm'].concat(table['textualPerm'])})`

                        stmt = this.db.prepare(`
                            SELECT col_id
                            FROM cells
                            WHERE table_id = ?
                            AND col_id NOT IN ${indices}
                            GROUP BY col_id
                            LIMIT ?;
                        `)

                        this.all(stmt, [table['table_id'], this.seedSet['numNULL']], table['NULLperm'])
                        table['NULLperm'] = table['NULLperm'].map(col => { return col['col_id'] })
                    }
                }

                resolve(tables);
            } catch (error) {
                reject(error)
            }
        })
    }

    getPermutedRows(tables) {
        /* Retrieves the rows of the tables found in the previous step,
         * permuted to the 'best' possible permutations found in 
         * getNumericalMatches() and getTextualMatches()
         * 
         * Arguments:
         * - tables: The results of getNumericalMatches & getTextualMatches
         * 
         * Returns:
         * - Promise which resolves if querying is successful, Rejects otherwise
         */
        var cases;
        var stmt;

        return new Promise((resolve, reject) => {
            try {
                var nP = 0;
                var tP = 0;
                var nullP = 0;

                for (let table of tables) {
                    table['rows'] = [];
                    table['titles'] = [];

                    // Create custom CASE statement for col_id for ordering of columns based on ideal permutations
                    var ignoredCols = table['textualPerm'].length + table['numericalPerm'].length + 1
                    nP = 0;
                    tP = 0;
                    nullP = 0;

                    cases = "";

                    for (let i = 0; i < this.seedSet['types'].length; i++) {
                        if (this.seedSet['types'][i] === 'text')
                            cases += `WHEN ${table['textualPerm'][tP++]} THEN ${i}\n`
                        else if (this.seedSet['types'][i] === 'numerical')
                            cases += `WHEN ${table['numericalPerm'][nP++]} THEN ${i}\n`
                        else
                            cases += `WHEN ${table['NULLperm'][nullP++]} THEN ${i}\n`
                    }

                    // Columns that are not in the column range of the seed set are ignored.
                    cases += `ELSE ${ignoredCols}`

                    stmt = this.db.prepare(`
                        SELECT GROUP_CONCAT(value, ' || ') AS value, title
                        FROM titles NATURAL JOIN (
                            SELECT table_id, row_id, CASE col_id ${cases} END AS col_order, value
                            FROM cells c
                            WHERE table_id = ?
                            AND c.location != 'header'
                            ORDER BY table_id, row_id, col_order, value ASC
                        ) 
                        WHERE col_order != ?
                        GROUP BY table_id, row_id
                    `)

                    this.all(stmt, [table['table_id'], ignoredCols], table['rows'])

                    for (let i = 0; i < table['rows'].length; i++) {
                        table['titles'].push(table['rows'][i]['title'])
                        table['rows'][i] = table['rows'][i]['value']
                    }
                }

                resolve(tables)
            } catch (error) {
                reject(error)
            }
        })
    }

    rankResults(tables) {
        /* Ranks the results that are gotten from getTextualMatches
         * by comparing each potential row with each row in the seed set, giving
         * that comparison a score, then averaging the scores across seed set rows
         * returns the 10 best
         * 
         * Arguments:
         * - results: an array of rows from the tables that were identified to fit best with the data
         * 
         * Returns:
         * - Promise which resolves if ranking is successful, rejects otherwise */

        var rows = this.seedSet['rows'].map(row => row.split(' || '))
        var results = [];
        var score = 0;
        var tableRow;
        var scores;

        return new Promise((resolve, reject) => {
            try {
                for (let table of tables) {
                    score = table['score'];
                    for (let i = 0; i < table['rows'].length; i++) {
                        tableRow = table['rows'][i];
                        tableRow = tableRow.split(' || ')

                        /* For a particular row to be scored, scores[o][p] represents the 
                         * similarty score with the values at column 'o' and row 'p' of the seed set 
                         * and column 'o' of the particular row. */
                        scores = this.createColArr()

                        for (let j = 0; j < rows.length; j++) {
                            for (let k = 0; k < rows[j].length; k++) {
                                if (!isNaN(rows[j][k]) && !isNaN(tableRow[k]))
                                    scores[k].push(Math.abs(Number(rows[j][k] === "NULL" ? tableRow[k] : rows[j][k]) - Number(tableRow[k])))
                                else
                                    scores[k].push(leven(rows[j][k], tableRow[k]))
                            }
                        }

                        results.push({
                            row: tableRow,
                            title: table['titles'][i],
                            score: scores,
                        })
                    }
                }

                var maxes = scores = this.createColArr()

                results.forEach(res => {
                    maxes.forEach((col, i) => {
                        col.push(...res['score'][i])
                    })
                })

                /* Get max of each column */
                maxes = maxes.map(arr => arr.reduce((a, b) => Math.max(a, b), 0))
                
                /* For each row, divide each column score for that 
                 * row by the maximum similarity score for that column
                 * across ALL rows scored. That is, normalize each array of scores (one for each column)
                 * to be between 0 and 1 (1 being the maximum measured score for that column), 
                 * then multiply each score by the slider value.
                 * This ensures that each column is equally weighted before the sliders are applied */
                maxes.forEach((max, i) => {
                    results.forEach(res => {
                        res['score'][i] = res['score'][i].map(val => val * this.seedSet['sliders'][i] / (!max ? 1 : max))
                    })
                })

                /* Sum each 2-D array to give a final numerical
                 * score for each row */
                results.forEach(res => {
                    res['score'] = res['score'].reduce((num, arr) => arr.reduce((n1, n2) => n1 + n2, 0) + num, 0)
                })

                /* Sort the rows in ascending order according to score */
                results = results.sort((res1, res2) => { return res1['score'] - res2['score'] }); 
                var tmp = { rows: [], info: [] }
                results.forEach(res => {
                    /* RegExp for inserting commas into a number
                     * http://stackoverflow.com/questions/721304/ddg#721415
                     * Accessed July 20th 2020 */
                    res['score'] = String(res['score']).replace(new RegExp(`(?<!\\.[^.]*)(\\d)(?=(\\d{3})+(?:$|\\.))`, 'gi'), match => {
                        return match + ','
                    })

                    tmp['rows'].push(res['row']);
                    tmp['info'].push(`Title: List of ${res['title'].trim()}<br>Score: ${res['score']}`)
                })

                results = tmp;

                results = this.applyUniqueConstraints(results)

                resolve(results)
            } catch (error) {
                reject(error)
            }
        })
    }

    applyUniqueConstraints(rankedRows) {
        /* Ensures that each column that the user tagged as 'unique' is, in fact, unique.
         * 
         * Arguments:
         * - rankedRows: The rows that are sorted in ascending order according to their score
         * 
         * Returns: The top 10 results (or less), checked to ensure unique constraints are valid */
        var columnSets = [];
        var uniqueRows = { rows: [], info: [] };
        var rrIndex = 0;
        for (const _ of this.seedSet['uniqueCols']) columnSets.push(new Set())

        while (uniqueRows['rows'].length < 10 && rrIndex < rankedRows['rows'].length) {
            if (uniqueRows['rows'].indexOf(rankedRows['rows'][rrIndex].join(' || ')) !== -1 || rankedRows['rows'][rrIndex].indexOf('NULL') > 0)
                rrIndex++;
            /* No values in rankedRows['rows'][rrIndex] are in the uniqueCols' sets */
            else if (this.seedSet['uniqueCols'].map((col, i) => columnSets[i].has(rankedRows['rows'][rrIndex][col])).every(inSet => inSet === false)) {
                for (let [i, el] of this.seedSet['uniqueCols'].entries())
                    columnSets[i].add(rankedRows['rows'][rrIndex][el])
                uniqueRows['rows'].push(rankedRows['rows'][rrIndex].join(' || '))
                uniqueRows['info'].push(rankedRows['info'][rrIndex++])
                /* A unique constraint is broken if we show the row to the user */
            } else
                rrIndex++;
        }

        return uniqueRows
    }

    all(stmt, params, results) {
        /* Custom definition of db.all used to work with
         * our use of promises.
         * 
         * Arguments:
         * - sql: A string containing the SQL query
         * - params: An optional string containing the parameters of the SQL query
         * - results: The array to which the results will be pushed
         * 
         * Returns:
         * - Promise
        */
        return new Promise((res, rej) => {
            try {
                const rows = stmt.all(params)
                rows.forEach((row) => {
                    // Set empty cells to be 'NULL'
                    if (typeof row['value'] !== 'undefined')
                        row['value'] = row['value'].split(' || ').map(cell => cell.length === 0 ? "NULL" : cell).join(' || ')

                    results.push(row);
                })
                res();
            } catch (error) {
                console.log(error);
                rej(error)
            }
        })
    }

    fillNulls(table) {
        /* Pad each row with NULL until the table is a rectangle 
         * 
         * Arguments:
         * - table: The table we want to pad with NULLs
         * 
         * Returns:
         * - undefined, since we modify table in place*/
        var row;
        for (let i = 0; i < table.length; i++) {
            row = table[i].split(' || ')
            for (let j = row.length; j < this.seedSet['numCols']; j++) row.push("NULL")
            table[i] = row.join(' || ')
        }
    }

    getTypes(table) {
        /* Gets the type of each column in 'table'. 
         * If every cell is a number, it is labelled as 'number'
         * Otherwise, it is of type 'text'
         * 
         * Assumes table has at least one row
         * 
         * Arguments:
         * - table: The table for which column types will be found
         * 
         * Returns:
         * - An array of dtypes */
        
        var types = [];
        var column = [];
        var rows = table.map(row => row.split(' || '))

        for (let i = 0; i < rows[0].length; i++) {
            column = [];
            for (let j = 0; j < rows.length; j++) {
                if (rows[j][i] !== "NULL")
                column.push(rows[j][i])
            }

            column = column.map(value => isNaN(value));
            
            if (column.indexOf(true) === -1 && column.length > 0)
            types.push("numerical")
            else if (column.length === 0)
            types.push("NULL")
            else
                types.push("text");
            }

            return types
    }
    
    ttestCases(arr1, arr2) {
        /* Handles the different cases of the t-test, 
         * returning the p-value in each case 
         * 
         * Arguments:
         * - arr1, arr2: the two arrays to use the t-test with
         * 
         * Returns:
         * - p-value of the t-test */

        var p;
        if (arr1.length === 0 || arr2.length === 0)
        return 0 // Lowest p-value possible => worst result (want the best match)

        if (arr1.length === 1 && arr2.length === 1)
            p = 0.98 * Number(arr1[0] === arr2[0]) + 0.01
            
            else if (statistics.standardDeviation(arr1) === 0 && statistics.standardDeviation(arr2) === 0)
            p = 0.98 * (Number(arr1[0] === arr2[0])) + 0.01 // Map between 0.01 and 0.99 to avoid log(0)

            /* If only one row in seedSet's numerical col, use one-sample t-test */
        else if (arr1.length === 1)
            p = Number(ttest(arr2, { mu: arr1[0] }).pValue())
            else
            p = Number(ttest(arr1, arr2).pValue())

        return p
    }

    makeStrArr(str) {
        /* Since the SQL arguments need to be an array, 
        * if the argument passed to a method is a string (i.e. only one keyword)
         * then we must convert it to an array of one string in order for the 
         * SQL engine to accept it. 
         * 
         * Arguments:
         * - str: the data to be checked (type string or array)
         * 
         * Returns:
         * - array, which is either the 'str' argument unchanged if already array
         *      or an array of one element
         */
        if (typeof str !== 'object') {
            str = [str]
        }
        return str
    }

    createColArr() {
        /* creates the array for storing the similarity
         * scores when ranking the rows to be returned to the user.
         * Each sub-array represents one column of the seed set, and 
         * contains the similarity scores of that column with the 
         * value that is being compared 
         * 
         * Arguments:
         * None
         * 
         * Returns:
         * - 2D array with # of sub-arrays equal to # of columns in seed set */
        return Array.apply(null, Array(this.seedSet['numCols'])).map(() => {return []})
    }
    
    getQMarks(arr) {
        /* Since the SQL engine uses '?' placeholders in order to format the query,
        * this function determines the number of question marks based on the number
        * of arguments passed to the query (arr).
        * 
        * Arguments:
         * - arr: The array which will be passed to the query engine
         * 
         * Returns:
         * - A string of the format "(?, ?, ..., ?)" with # of '?' equal to the length of 'arr'
         */
        if (typeof arr === 'undefined') {
            return ''
        }

        var qMarks = [];

        if (typeof arr === 'string') {
            arr = [arr]; // Allows for use of spread operator below
            qMarks = '(?)'
        } else {
            arr.forEach(() => {
                qMarks.push('?')
            })
            qMarks = `(${qMarks.join(', ')})`;
        }

        return qMarks
    }

    overlapSim(arr1, arr2) {
        var colSet = new Set(arr2);
        return new Set(arr1.filter(value => colSet.has(value))).size / new Set(arr1).size
    }

    resetDPArr(dpArr, ssCols, potTableCols) {
        /* Resets the DP array used in finding both numerical mappings
         * and textual mappings
         * 
         * Arguments:
         * - dpArr: The array used to memoize the values
         * - ssCols: The length of the # of seed set columns of the type we are
         *      analyzing
         * - potTableCols: The maximum column number of the table for which we are
         *      finding a mapping
         * 
         * Returns:
         * - undefined: All operations are performed dpArr in place. */
        for (let i = 0; i < ssCols; i++) {
            dpArr[i] = [];
            for (let j = 0; j <= potTableCols; j++) {
                dpArr[i].push(-1)
            }
        }
    }

    swap(arr, i, j) {
        /* Swaps the elements at indices i, j in arr
         * 
         * Arguments:
         * - arr: The array in which to swap elements
         * - i,j: The indices of the elements to be swapped
         * 
         */
        var tmp = arr[i]
        arr[i] = arr[j];
        arr[j] = tmp;
    }


    close() {
        /* Closes the database instance. */
        this.db.close();
        return
    }
}

module.exports = Database;
