/* REFERENCES 
https://stackabuse.com/a-sqlite-tutorial-with-node-js/
https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md

*/ 
const sqlite3 = require('better-sqlite3');
const {similarity, distance, custom} = require('talisman/metrics/jaro-winkler')
const dice = require('talisman/metrics/dice');
const moment = require('moment');
const ttest = require('ttest');

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

        console.log("Connected to database");

        this.seedSet = {
            sliders: [],
            rows: [],
            table_ids: '',
            row_ids: '',
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
        this.db.function('T_TEST', (arr1, arr2, alpha) => {
            arr1 = JSON.parse(arr1)
            arr2 = JSON.parse(arr2)

            return Number(ttest(arr1, arr2, {alpha: 1 - alpha}).valid()) // We want low slider values to represent similar data => 1 - alpha
        })

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
                FROM keywords_title_caption k, titles t, cells c
                WHERE k.table_id = t.table_id AND t.table_id = c.table_id 
                AND k.keyword IN ${keywordQMarks}
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
            this.all(
                stmt, 
                [],
                this.seedSet['rows']
            )
            .then(() => {
                /* 'unpack' results of query */
                this.seedSet['rows'] = this.seedSet['rows'].map(row => row['value'])
                this.seedSet['numCols'] = this.seedSet['rows'].map(row => row.split(' || ').length).reduce((a, b) => Math.max(a, b), 0)
                
                this.fillNulls(this.seedSet['rows'])
                this.seedSet['types'] = this.getTypes(this.seedSet['rows'])
                console.log(this.seedSet['types'])

                /* Group cols only if we have a lot of data, otherwise let the user perform all organization */
                if (new Set(tableIDs).size > 2 || this.seedSet['rows'].length > 10)  {
                    this.groupCols(this.seedSet['rows'])
                }

                /* Set sliders to defaults */
                for (let i = 0; i < this.seedSet['rows'][0].split(this.cellSep).length; i++) {
                    this.seedSet['sliders'].push(50);
                }

                resolve()
            })
            .catch((err) => {
                reject(err)
            })
        })
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
            // console.log(curRow)
            
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

                this.seedSet['numCols'] -= cols.length;

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
                    var seedCopy = {...this.seedSet}
                    seedCopy['rows'] = results
                    resolve(seedCopy)
                })
            } catch (error) {
                reject(error)
            }
        })
    }

    xr() {
        /* Append rows to table which are related
         * to the current table
         *
         * PSEUDO:
         * 1. Iterate over each column, getting table_id, row_id of matches
         *      a) Restrict / eliminate results by proximity to original values
         *      b) Restrict results to slider percentage is upheld
         * 2. Intersect all result sets.
         * 3. Order by # of matches
         * 4. Return specified # of matches.
         *
         */

        return new Promise((resolve, reject) => {
            try {
                this.getMatches()
                .then((results) => {          
                    resolve(results.slice(0, 10));
                })
                .catch((error) => {
                    reject(error);
                })
            } catch (error) {
                console.log(error);
            }
        })
    }

    xc() {

    }

    fill() {
        
    }

    getMatches() {
        /* getMatches finds the rows that are most similar to the 
         * current state of the seed set
         * TODO: figure out the best way to implement similarity
         * 
         * Arguments:
         * None
         * 
         * Returns:
         * - Promise which resolves if query is successful, rejects otherwise.*/
        var results = [];
        var column = [];
        var stmt = null;
        var customTable = [];
        var cur;

        var cells = this.seedSet['rows'].map(row => row.split(' || '))

        return new Promise((resolve, reject) => {
            try {
                for (let i = 0; i < this.seedSet['numCols']; i++) {
                    for (let j = 0; j < this.seedSet['rows'].length; j++) {
                        cur = cells[j][i]
                        if (cur !== "NULL") {
                            column.push(cur);
                            customTable.push(`
                                SELECT '${cur.replace(new RegExp(/'/, 'gi'), match => "'" + match)}' AS word, 
                                ${i} AS col_id, 
                                ${this.seedSet['sliders'][i]} AS proximity_limit
                            `)
                        }
                    }
                }
        
                customTable = customTable.join(' UNION ALL ')
    
                stmt = this.db.prepare(`
                SELECT DISTINCT table_id, row_id, GROUP_CONCAT(value, ' || ') AS value, SUM(p) AS pSum
                FROM 
                (
                    SELECT c.table_id, c.row_id, c.col_id, c.value, MIN(proximity(c.value, o.word)) AS p
                    FROM cells c, (${customTable}) o
                    WHERE c.col_id = o.col_id
                    AND ABS(LENGTH(c.value) - LENGTH(o.word)) <= o.proximity_limit
                    AND sameType(c.value, o.word) = 1
                    AND 0 < proximity(c.value, o.word)
                    AND proximity(c.value, o.word) <= o.proximity_limit
                    GROUP BY c.table_id, c.row_id, c.col_id, c.value
                )
                GROUP BY table_id, row_id
                HAVING COUNT(DISTINCT col_id) = ?
                ORDER BY pSum ASC;
                `)
    
                this.all(stmt, [this.seedSet['numCols']], results);

                results = results.map(result => result['value'])

                resolve(results)
            } catch (error) {
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
            if (column.indexOf(true) === -1) types.push("numerical")
            else types.push("text");
        }

        return types
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