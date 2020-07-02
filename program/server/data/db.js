/* REFERENCES 
https://stackabuse.com/a-sqlite-tutorial-with-node-js/
https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md

*/ 
const sqlite3 = require('better-sqlite3');
const {similarity, distance, custom} = require('talisman/metrics/jaro-winkler')
const dice = require('talisman/metrics/dice');
const ttest = require('ttest');
const statistics = require('simple-statistics')
const combinatorics = require('js-combinatorics')

/* SCHEMA 
 * cells(table_id, row_id, col_id, value)
 * titles(table_id, title)
 * captions(table_id, caption)
 * headers(table_id, col_id, header)
 * keywords_cell_header(keyword, table_id, row_id, col_id,location)
 * keywords_title_caption(table_id, location, keyword)
 */

/* An instance of the Database class represents a database */
class Database {

    /* Constructor to initialize the database class */
    constructor(dbPath) {
        try {
            this.db = new sqlite3(dbPath, {
                readonly: true,
                // verbose: console.log
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

        // var jaroSim = function(str1, str2) {return similarity(str1, str2)}
        // var diceSim = function(str1, str2) {return 1 - dice(str1, str2)} // Perfect match is 0, rather than 1

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

            return statistics.standardDeviation(arr) / (Math.sqrt(arr.length) + 1e-5) // Avoid division by 0
        })

        this.db.function('isNumber', (num) => 1 - Number(isNaN(num)))

        // this.db.function('jaro', (str1, str2) => similarity(str1, str2));
        // this.db.function('dice', (str1, str2) => dice(str1, str2))
    } 

    keywordSearch(keywords, params = []) {
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

        /* https://stackoverflow.com/questions/21223357/sql-request-with-case-in-order-by-throws-1-1st-order-by-term-does-not-match-a
         * Accessed June 9th 2020
         * Custom ordering of columns, by location
         * 
         * Nested query is due to same keyword appearing in multiple
         * locations on same table, leading to repeated rows in output
         */
        const stmt = this.db.prepare(`
            SELECT DISTINCT r.table_id, title, row_id, value, rowCount
            FROM
            (
                SELECT DISTINCT t.table_id, t.title, c.row_id, value
                FROM titles t NATURAL JOIN keywords_cell_header k NATURAL JOIN (
                    SELECT table_id, row_id, GROUP_CONCAT(value, ' || ') AS value 
                    FROM cells 
                    GROUP BY table_id, row_id
                ) c
                WHERE k.row_id = c.row_id
                AND k.keyword IN ${keywordQMarks}
                GROUP BY t.table_id, c.row_id
    
                UNION
    
                SELECT t.table_id, t.title , c.row_id, GROUP_CONCAT(c.value, ' || ') AS value
                FROM (
                    SELECT DISTINCT table_id 
                    FROM keywords_title_caption 
                    WHERE keyword IN ${keywordQMarks}
                ) k, titles t, cells c
                WHERE k.table_id = t.table_id AND t.table_id = c.table_id
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
            sliders: [],
            rows: [],
            types: [],
            table_ids: tableIDs.map(id => id.trim()),
            row_ids: rowIDs.map(id => id.trim()),
            numCols: 0,
        };

        /* Create 'table' based on values of tableIDs, rowIDs
         * https://stackoverflow.com/questions/985295/can-you-define-literal-tables-in-sql
         * Accessed June 9th, 2020
         * 
         * This breaks if we have more than 500 rows in the seed set, but if a user is selecting 500
         * rows then that's their problem.
         */
        for (let i = 0; i < rowIDs.length; i++) {
            customTable.push(`SELECT ${tableIDs[i].trim()} AS table_id, ${rowIDs[i].trim()} AS row_id`)
        }
        customTable = `(${customTable.join(' UNION ALL ')})`

        const stmt = this.db.prepare(` 
            SELECT DISTINCT table_id, row_id, GROUP_CONCAT(value, '${this.cellSep}') AS value
            FROM cells 
            WHERE (table_id, row_id) IN ${customTable}
            GROUP BY table_id, row_id
            ORDER BY table_id, row_id;
        `)

        return new Promise((resolve, reject) => {
            this.all( stmt,  [], this.seedSet['rows'])
            .then(() => {
                /* 'unpack' results of query */
                this.seedSet['rows'] = this.seedSet['rows'].map(row => row['value'])
                
                this.cleanRows(true, true);

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
        if (grouping && ( new Set(this.seedSet['table_ids']).size > 2 || this.seedSet['rows'].length > 10 )) {
            this.groupCols(this.seedSet['rows'])
        }


        if (changeSeed)
            this.seedSet['types'] = this.getTypes(this.seedSet['rows'])

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

    handleDotOps(dotOp, sliderValues) {
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
                
                for (let i = 0; i < sliderValues.length; i++) {
                    this.seedSet['sliders'][i] = Number(sliderValues[i])
                }
                
                /* Handle specific dot op */
                new Promise((res, rej) => {
                    /* Only upon initialization of the dot-ops page */
                    if (dotOp === 'undefined') {
                        res(this.seedSet['rows'])
                        
                    } else if (dotOp === 'xr') {
                        this.xr()
                        .then((results) => {
                            res(results)
                        })
                    } else if (dotOp === 'xc') {
                        this.xc()
                    } else if (dotOp === 'fill') {
                        this.fill()
                    } else {
                        rej(`dotOp specified (${dotOp}) is not possible`)
                    }
                })
                .then((results) => {
                    this.fillNulls(results)
                    seedCopy = {...this.seedSet}
                    seedCopy['rows'] = results
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
                this.getNumericalMatches()
                .then((results) => {
                    return this.getNumericalPerms(results)
                }).then((results) => {          
                    return this.getTextualMatches(results)
                }).then((results) => {
                    return this.getTextualPerms(results)
                }).then((results) => {
                    return this.getPermutedRows(results)
                }).then((results) => {
                    resolve(this.rankResults(results));
                })
                .catch((error) => {
                    console.log(error);
                })
            } catch (error) {
                console.log(error);
                reject(error);
            }
        })
    }

    xc() {

    }

    fill() {
        
    }

    getNumericalMatches() {
        /* for every numerical column in the seed set, getNumericalMatches
         * compares its distribution with the numerical columns in the database
         * using Welch's t-distribution test, or the one-sample test depending on 
         * the length of the seed set. We then sort these columns based on their p-value,
         * and organize them according to the seed set column they are being compared
         * 
         * Arguments:
         * None
         * 
         * Returns:
         * - Promise which resolves if query is successful, rejects otherwise.*/
        
        var rows = this.seedSet['rows'].map(row => row.split(' || '));
        var numNumerical = this.seedSet['types'].filter(type => type === 'numerical').length
        var numTextual = this.seedSet['types'].filter(type => type === 'text').length
        var results = [];
        var column = [];
        var ssCols = [];
        var stmt;
        
        return new Promise((resolve, reject) => {
            try {
                for (let i = 0; i < this.seedSet['types'].length; i++) {
                    results.push([])
                    if (this.seedSet['types'][i] !== 'numerical')
                        continue
                    ssCols.push([])
                    column = ssCols[ssCols.length - 1]
                    for (let j = 0; j < rows.length; j++) {
                        if (rows[j][i] !== "NULL")
                            column.push(Number(rows[j][i]))
                    }

                    column = JSON.stringify(column)
        
                    stmt = this.db.prepare(`
                        SELECT DISTINCT table_id
                        FROM cells c NATURAL JOIN columns col    
                        WHERE c.table_id IN 
                        (
                            SELECT table_id
                            FROM columns
                            WHERE type = 'numerical'
                            GROUP BY table_id
                            HAVING COUNT(DISTINCT col_id) >= ?

                            INTERSECT 

                            SELECT table_id
                            FROM columns
                            WHERE type = 'text'
                            GROUP BY table_id
                            HAVING COUNT(DISTINCT col_id) >= ?
                        )
                        AND col.type = 'numerical' 
                        AND c.location != 'header'
                        AND c.value != ''
                        GROUP BY table_id, col_id
                        HAVING T_TEST(?, toArr(value)) > ?
                        AND SEM(toArr(value)) < ?;
                    `)

                    this.all(stmt, 
                        [numNumerical, numTextual, column, (1 - this.seedSet['sliders'][i] / 100), this.seedSet['sliders'][i]], 
                        results[i])
                }

                var union = results.filter(result => result.length > 0).map(result => result.map(table => table['table_id']))
                union = [...new Set(union.flat())] // NOTE: this will be 'undefined' if results is empty

                resolve(union)
                
            } catch (error) {
                reject(error);
            }
        })
    }

    getNumericalPerms(results) {
        /* Get the best permutation for numerical columns for each table */

        var tables = [];
        var cols = [];
        var curChiTestStat;
        var bestPerm;
        var idPerms;
        var idPerm;
        var pValDP = [];

        for (let i = 0; i < numNumerical; i++) 
            pValDP.push([])

        for (const table_id of results) {
            cols = [];
            stmt = this.db.prepare(`
                SELECT table_id, col_id, toArr(value) AS column
                FROM cells c NATURAL JOIN columns col
                WHERE col.type = 'numerical'
                AND c.location != 'header'
                AND table_id = ?
                GROUP BY table_id, col_id
            `)

            this.all(stmt, [table_id], cols)

            /* 'refine' result of query */
            cols = {
                table_id: table_id,
                columns: cols.map(res => JSON.parse(res['column']).map(num => Number(num))),
                colIDs: cols.map(res => res['col_id'])
            }

            /* Re-initialize dynamic programming array */
            pValDP = []
            for (let i = 0; i < numNumerical; i++) {
                pValDP[i] = [];
                for (let j = 0; j <= Math.max(...cols['colIDs']); j++) {
                    pValDP[i].push(-1)
                }
            }

            bestPerm = {
                table_id: table_id,
                numericalPerm: [],
                chiTestStat: 0,
            };

            curChiTestStat = 0;
            idPerms = combinatorics.permutation(cols['colIDs'])

            /* Iterate over all permutations of the columns, 
                * finding the one that returns the lowest cumulative p-value */
            combinatorics.permutation(cols['columns']).forEach(perm => {
                idPerm = idPerms.next();
                curChiTestStat = 0;
                
                /* Emphasises 0s at the front (can be seen when querying first 2 rows of 'aircraft carriers')*/
                ssCols.forEach((col, index) => {
                    /* If haven't calculated matching, fill dp array */
                    if (pValDP[index][idPerm[index]] < 0) {
                            /* Map p-values between 0.1 and 1 to avoid log(0) */
                        if (statistics.standardDeviation(col) === 0 && statistics.standardDeviation(perm[index]) === 0)
                        pValDP[index][idPerm[index]] = 0.9 * (1 - Number(col[0] === perm[index][0])) + 0.1
                        else
                            pValDP[index][idPerm[index]] = 0.9 * (1 - this.ttestCases(col, perm[index])) + 0.1 // Low p-values are bad
                    }

                    
                    curChiTestStat += Math.log(pValDP[index][idPerm[index]])
                })
                
                curChiTestStat *= -2;

                if (curChiTestStat > bestPerm['chiTestStat']) {
                    bestPerm['numericalPerm'] = idPerm;
                    bestPerm['chiTestStat'] = curChiTestStat
                }
            })
            tables.push(bestPerm)
        }

        resolve(tables)
    }

    getTextualMatches(tables) {
        /* 
         * 
         * Arguments:
         * - results: The results of getNumericalMatches
         * 
         * Returns:
         * - Promise that resolves if querying is successful, rejects otherwise */

        return new Promise((resolve, reject) => {
            try {
                
                /* No numerical columns */
                if (tables.length === 0) {
                    stmt = this.db.prepare(`
                        SELECT table_id
                        FROM columns
                        WHERE type = 'text'
                        GROUP BY table_id
                        HAVING COUNT(DISTINCT col_id) >= ?;
                    `)
                } else  {
                }
            } catch(error) {
                reject(error)
            }
        })
    }

    getTextualPerms(results) {

    }

    getPermutedRows(results) {
        var cols;
        var cases;
        var stmt;
        var orderedRows = [];
        
        try {
            var nP = 0;
            var tP = 0;

            /* Get the best permutation for textual columns for each table */
            for (let table of tables) {
                cols = [];
                stmt = this.db.prepare(`
                    SELECT table_id, col_id, toArr(value) AS column
                    FROM cells c NATURAL JOIN columns col
                    WHERE col.type = 'text'
                    AND c.location != 'header'
                    AND c.table_id = ?
                    GROUP BY table_id, col_id
                `)

                this.all(stmt, [table['table_id']], cols)

                if (cols.length === 0)
                    continue

                cols = {
                    table_id: cols['table_id'],
                    columns: cols.map(res => JSON.parse(res['column']).map(num => Number(num))),
                    colIDs: cols.map(res => res['col_id'])
                }

                // No rearranging columns for now.
                table['textualPerm'] = cols['colIDs']

                // Create custom CASE statement for col_id for ordering of columns based on ideal permutations
                var ignoredCols = table['textualPerm'].length + table['numericalPerm'].length + 1
                nP = 0;
                tP = 0;
                cases = "";

                for (let i = 0; i < this.seedSet['types'].length; i++) {
                    if (this.seedSet['types'][i] === 'text')
                        cases += `WHEN ${table['textualPerm'][tP++]} THEN ${i}\n`
                    else
                        cases += `WHEN ${table['numericalPerm'][nP++]} THEN ${i}\n`
                }

                // Columns that are not in the column range of the seed set are ignored.
                cases += `ELSE ${ignoredCols}`
                
                stmt = this.db.prepare(`
                SELECT table_id, row_id, GROUP_CONCAT(value, ' || ') AS value
                FROM
                (
                    SELECT table_id, row_id, CASE col_id ${cases} END AS col_order, value
                    FROM cells c
                    WHERE table_id = ?
                    AND c.location != 'header'
                    ORDER BY table_id, row_id, col_order, value ASC
                )
                WHERE col_order != ?
                GROUP BY table_id, row_id
                `)
                
                this.all(stmt, [table['table_id'], ignoredCols], orderedRows)

            }

            resolve(orderedRows)
        } catch (error) {
            reject(error)
        }
    }

    rankResults(results) {
        /* Ranks the results that are gotten from getTextualMatches, 
         * returns the 10 best
         * 
         * Arguments:
         * - results: an array of rows from the tables that were identified to fit best with the data
         * 
         * Returns:
         * - Promise which resolves if ranking is successful, rejects otherwise */

        var sumSquaredDistance = 0;
        var rows = this.seedSet['rows'].map(row => row.split(' || ').map(cell => isNaN(cell) ? cell : Number(cell)))

        return new Promise((resolve, reject) => {
            try {
                for (let result of results) {
                    sumSquaredDistance = 1;
                    result['value'] = result['value'].split(' || ').map(cell => isNaN(cell) ? cell : Number(cell))
                    for (let row of rows) {
                        for (let i = 0; i < row.length; i++) {
                            if (!isNaN(row[i]) && !isNaN(result['value'][i]))
                                sumSquaredDistance += Math.pow(row[i] - result['value'][i], 2)
                            else
                                sumSquaredDistance *= 2; // Want to remove as many nulls as possible
                        }
                    }
                    
                     // Average distance across rows, SUBJECT TO CHANGE
                    result['dist'] = sumSquaredDistance / rows.length
                }

                results = results.sort((res1, res2) => {return res1['dist'] - res2['dist']}); // Sort in ascending order
                
                results = results.slice(0, 10).map(res => res['value'].join(' || '));

                resolve(results)
            } catch (error) {
                console.log(error)
                reject(error)
            }
        })
    }

    all(stmt, params = [], results) {
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
            for (let j = 0; j < rows.length; j++) {
                if (rows[j][i] !== "NULL")
                    column.push(rows[j][i])
            }       

            column = column.map(value => isNaN(value));
            if (column.indexOf(true) === -1 && column.length > 0) types.push("numerical")
            else types.push("text");
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

        var p = null; 
        if (arr1.length === 0 || arr2.length === 0)
            return 0 // Lowest p-value possible => worst result (want the best match)

        if (arr1.length === 1 && arr2.length === 1) 
            p = Number(arr1[0] === arr2[0])
            
        /* If only one row in seedSet's numerical col, use one-sample t-test */
        else if (arr1.length === 1)
            p = Number(ttest(arr2, {mu: arr1[0]}).pValue())
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

    getQMarks(arr) {
        /* Since the SQL engine uses '?' placeholders in order to format the query,
         * this function determines the number of question marks based on the number
         * of arguments passed to the query.
         * 
         * Arguments:
         * - arr: The array which will be passed to the query engine
         * 
         * Returns:
         * - An array of '?', with length equal to the length of 'arr'
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

/*
    TEST QUERIES: RUN IN TERMINAL

    db.aggregate('toArr', {
        start: () => [],
        step: (array, nextValue) => {
            array.push(nextValue);
        },
        result: array => JSON.stringify(array)
    });

    
    
    SELECT table_id, row_id, col_id, value
    FROM cells c NATURAL JOIN types    
    WHERE t.type = 'numerical  
    AND c.location != 'header'
    GROUP BY table_id, col_id
    HAVING (something about T_TEST)
*/

/* 
    UNUSED FUNCTIONS

        getRelatedTables() {
        /* 'key' refers to primary key, LH column.
         * 
         * Get titles of the tables with rows
         * currently in the seed set.
         * 
         * Find similar titles (HOW)
         * Try:
         *      - Dice
         *      - Levenshtein
         *      - Jaro-Winkler
         * 
         // END COMMENT 
        var results = [];
        var limit = 1.0;
        var prom;

        return new Promise((resolve, reject) => {
            do {
                const stmt = this.db.prepare(`
                    WITH currentTitles AS (
                        SELECT table_id, title
                        FROM titles
                        WHERE table_id in (${this.seedSet['table_ids']})
                    )
                    SELECT DISTINCT c.table_id AS c, t.table_id AS t, t.title
                    FROM titles t, currentTitles c
                    WHERE c.title != t.title -- Change to table_id if you only want to ensure the actual content isn't the same
                    AND 
                    (
                        (dice(c.title, t.title) >= ${limit})
                    );
                `)
                prom = this.all(stmt, [], results)
                limit -= 0.05;
            } while ( new Set(results.map(result => result['title'])).size <= 1 ); // At least two unique tables in results
            prom
            .then(() => {
                console.log(results, limit)
                resolve(results);
            })
            .catch((error) => {
                reject(error);
            })
        });
    }

        this.db.function('sameType', (cVal, ssVal) => Number(isNaN(cVal) === isNaN(ssVal)))

        this.db.function('proximity', (cVal, ssVal) => {
            if (!isNaN(ssVal))
                return Math.abs(Number(cVal) - Number(ssVal))
            else 
                return jaroSim(cVal, ssVal)
        });

*/