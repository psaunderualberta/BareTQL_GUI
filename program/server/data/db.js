/* REFERENCES 
https://stackabuse.com/a-sqlite-tutorial-with-node-js/
https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md

*/ 
const sqlite3 = require('better-sqlite3');
const leven = require('leven')

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

        this.db.function('leven', (str1, str2) => leven(str1, str2));
        // this.db.loadExtension('./spellfix')                // for Linux
        // this.db.loadExtension('./spellfix.dll')           //  <-- UNCOMMENT HERE FOR WINDOWS

        this.seedSet = {
            sliders: [],
            rows: [],
        };

        this.functions = {
            xr: this.xr,
            xc: this.xc,
            fill: this.fill,
        }
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
            SELECT DISTINCT table_id, title, row_id, value
            FROM
            (
                SELECT t.table_id, t.title, c.row_id, GROUP_CONCAT(c.value, ' || ') AS value,
                    CASE k.location 
                        WHEN 'title' THEN '1'
                        WHEN 'caption' THEN '2'
                        WHEN 'header' THEN '3'
                        WHEN 'cell' THEN '4'
                    END AS location
                FROM titles t, keywords_cell_header k, cells c
                WHERE t.table_id = k.table_id AND k.table_id = c.table_id
                AND k.row_id = c.row_id
                AND k.keyword IN ${keywordQMarks}
                GROUP BY t.table_id, c.row_id
    
                UNION
    
                SELECT t.table_id, t.title , c.row_id, GROUP_CONCAT(c.value, ' || ') AS value,
                    CASE k.location 
                        WHEN 'title' THEN '1'
                        WHEN 'caption' THEN '2'
                        WHEN 'header' THEN '3'
                        WHEN 'cell' THEN '4'
                    END AS location
                FROM keywords_title_caption k, titles t, cells c
                WHERE k.table_id = t.table_id AND t.table_id = c.table_id 
                AND k.keyword IN ${keywordQMarks}
                GROUP BY t.table_id, c.row_id
    
                ORDER BY location, t.table_id, c.row_id
            );
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
            SELECT DISTINCT table_id, row_id, GROUP_CONCAT(value, ' || ') AS value
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
                this.seedSet['rows'] = this.seedSet['rows'].map(row => row['value'])
                for (let i = 0; i < this.seedSet['rows'][0].split(' || ').length; i++) {
                    this.seedSet['sliders'].push(10);
                }
                resolve()
            })
            .catch((err) => {
                console.log(err);
                reject(err)
            })
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
                    row = this.seedSet['rows'][i].split(' || ')
                    cols.forEach(col => {
                        delete row[col - 1] // We use 1-indexing on front-end, convert to 0-indexing
                    })

                    row = row.filter(cell => typeof cell !== 'undefined')
                    if (row.length > 0) {
                        this.seedSet['rows'][i] = row.join(' || ');
                    } else {
                        this.seedSet['rows'][i] = row
                    }
                }

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
            /* Only upon initialization of the dot-ops page */
            if (dotOp === 'undefined') {
                resolve(this.seedSet)
            }

            for (let i = 0; i < sliderValues.length; i++) {
                this.seedSet['sliders'][i] = Number(sliderValues[i]) / 5
            }
            
            new Promise((res, rej) => {
                if (dotOp === 'xr') {
                    this.xr()
                } else if (dotOp === 'xc') {
                    this.xc()
                    resolve()
                } else if (dotOp === 'fill') {
                    this.fill()
                    resolve()
                } else {
                    rej(`dotOp specified (${dotOp}) is not possible`)
                }
                res();
            })
            .then(() => {
                resolve(this.seedSet)
            })
            .catch((err) => {
                reject(err);
            })
        })
    }

    xr() {
        /* Append rows to table which are related
         * to the current table
         *
         * PSEUDO:
         * 1. Find related tables to the current table
         *      a) Give each table a 'related' score based on # 
         *         of rows which match
         *      b) Identify the row and column mapping from current table
         * 2. Create new rows based on the column mapping for each table,
         *      add the 'related' score to the score for each row
         * 3. Sort the created rows based on the score.
         * 4. Append the rows with the highest score to the seed set.
         *
         */

        return new Promise((resolve, reject) => {
            try {
                this.getRelatedTables()
                .then((results) => {
                    resolve();
                })
            } catch (error) {
                reject(error);
            }
        })
    }

    xc() {

    }

    fill() {
        
    }

    getRelatedTables() {
        /* 'key' refers to primary key, LH column.
         * 
         * Iterate over all keys
         * Check if length of key makes it possible to match.
         * If keys match (based on levenshtein distance)
         *     If that table contains the entire row
         *         Add to list of potential tables
         * 
         * Count # of times each table shows up in
         * list of potential tables
         * 
         * Only take tables which appear enough times
         * 
         * For each potential table:
         *      Eliminate if table has fewer columns OR # of rows < self.num_rows * relational_threshold)
         *      Determine column & row mapping, related score of table
         *      If the related_score > relational_threshold: 
         *          Add mappings, value to list of related tables
         * 
         * return list of related tables
         * 
         */ 
    
        return new Promise((resolve, reject) => {
            var stmt, stmtString, params;
            var rows = this.seedSet['rows']

            try {

                // Can't split rows into cells, since object keys cannot be arrays
                var rowTables = { }
                rows.forEach(row => {
                    rowTables[row] = []
                })

                /* Identify tables with pk within edit distance of key */
                var customTable = [];
                var splitRow;
                Object.keys(rowTables).forEach(row => {  
                    customTable = [];
                    splitRow = row.split(' || ');

                    var customTable = this.makeTempTable(splitRow);
                    /* Create 'table' based on values of splitRow cells, slider values
                    * https://stackoverflow.com/questions/985295/can-you-define-literal-tables-in-sql
                    * Accessed June 12th, 2020
                    */
                    
                    stmtString = `
                        -- Primary key specific 
                        SELECT table_id, row_id
                        FROM cells c
                        WHERE c.col_id = 0
                        AND row_id > 0
                        AND leven(?, value) <= ?
                    `;
 
                    /* kept separate, since if a row has only one column this
                        second query will produce an empty set which we do not want */
                    if (splitRow.length > 1) {
                        stmtString += `
                            INTERSECT
 
                            -- all other columns
                            SELECT table_id, row_id
                            FROM cells c, ${customTable} AS custom
                            WHERE c.col_id > 0
                            AND row_id > 0 -- Ensures we don't column headers in output
                            AND leven(custom.word, c.value) < custom.edit_limit
                            GROUP BY c.table_id, c.row_id
                            HAVING COUNT(DISTINCT custom.word) = ?
                            AND COUNT(DISTINCT c.col_id) = ? 
                            AND MAX(c.col_id) >= ?
                        `
                        params = [splitRow[0], this.seedSet['sliders'][0], splitRow.length - 1, splitRow.length - 1, splitRow.length - 1];
                    } else {
                        params = [splitRow[0], this.seedSet['sliders'][0]];
                    }
                    stmt = this.db.prepare(stmtString)
                    this.all(stmt, params, rowTables[row])
                })

                /* Organize results into object, where key is a table_id and
                 * value is an array of all rows which match. There is no defined ordering,
                 * although the query returns the rows in ascending order since that is how
                 * they are represented in the database.
                 */
                var tables = { };
                var sortedTables = [];
                Object.keys(rowTables).forEach(key => {
                    rowTables[key].forEach(result => {
                        if (tables[result['table_id']]) {
                            tables[result['table_id']].push(result['row_id'])
                        } else {
                            tables[result['table_id']] = [result['row_id']]
                        }
                    })
                })

                /* http://stackoverflow.com/questions/1069666/ddg#16794116
                 * Accessed June 15th, 2020
                 */
                sortedTables = Object.keys(tables).sort((key1, key2) => {
                    return tables[key1] - tables[key2]
                }).reverse();

                // console.log(tables);

                var cMap;
                Object.keys(tables).forEach(table_id => {
                    cMap = this.getColumnMapping(table_id, tables[table_id])
                })
                
                resolve(sortedTables);

            } catch(error) {
                console.log(error);
                reject(error)
            }

        })
    }

    getColumnMapping(table_id, rowIDs) {
        /* Gets the column mapping of the table with id 'table_id'
         * to the current state of the seed set. The column mapping
         * is defined as follows: For each row in the table
         * which has been found to match a row in the seed set
         * there is a number of possible orderings of the columns 
         * to convert that row into the row in the seed set. We find
         * these possible orderings, and the column mapping is the most common one.
         * 
         * Arguments:
         * - table_id, the ID of the table to test
         * 
         * Returns:
         * - object containing the column mapping from the table
         *   to our seed set, the related score, and the row mapping
         */

        var rowStr = [];
        for (const row of rowIDs) {
            rowStr.push(row);
        }
        rowIDs = `(${rowStr.join(', ')})`

        var mappings;
        var mappingCounts = [];
        for (const row of this.seedSet['rows']) {
            mappings = [];
            var customTable = this.makeTempTable(row.split(' || '))
    
            const stmt = this.db.prepare(`
                WITH origin AS ${customTable}
                SELECT GROUP_CONCAT(cols, ' || ') AS mapping
                FROM (
                    SELECT table_id, row_id, word, GROUP_CONCAT(c.col_id, ', ') AS cols
                    FROM cells c, origin
                    WHERE table_id = ${table_id}
                    AND row_id IN ${rowIDs}
                    AND c.col_id > 0
                    AND leven(origin.word, c.value) < origin.edit_limit
                    GROUP BY table_id, row_id, word
                )
                GROUP BY table_id, row_id
            `)
            this.all(stmt, [], mappings)
            .then(() => {
                console.log(mappings, mappings.length);
                if (mappings.length > 0) {
                    mappings.map(mapping => mapping['mapping'].split(' || ').map(cols => cols.split(', '))) // Undoes the above GROUP_CONCATs

                    console.log(mappings, 'here')
                    /* Count most frequent column mapping for each column */
                    for (const row in mappings) {
                        for (let i = 0; i < row.length; i++) {
                            for (let j = 0; j < row[i].length; j++) {
                                if (typeof mappingCounts[i] === 'undefined') {
                                    mappingCounts[i] = { };
                                }
                                if (mappingCounts[i][row[i][j]]) mappingCounts[i][row[i][j]]++;
                                else mappingCounts[i][row[i][j]] = 1;
                            }
                        }
                    }


                    mappings = [];
                    for (const count in mappingCounts) {
                        var max = Object.keys(count).sort((i, j) => count[i] - count[j])[-1]
                        mappings.push(max);
                    }

                    return mappings

                }
            })
        }



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
                    results.push(row);
                })
                res();
            } catch (error) {
                // console.log(err);
                rej(error)
            }
        })
    }

    makeTempTable(splitRow) {
        /* Converts the row into a temporary table (combination of 'SELECT's and 'UNION ALL's)
         * 
         * Arguments:
         * - splitRow: The row to make into a temporary table, represented as an array of cells
         * 
         * Returns:
         * - customTable: a string representing a temporary table, with each row being a cell
         * from 'splitRow' and the corresponding slider value
         */
        var customTable = [];
        for (let i = 1; i < splitRow.length; i++) {
            customTable.push(`SELECT '${splitRow[i]}' AS word, ${this.seedSet['sliders'][i]} AS edit_limit`)
         }
        return `(${customTable.join(' UNION ALL ')})`
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

    close() {
        /* Closes the database instance. */
        this.db.close();
        return
    }
}

module.exports = Database;

/*
    TEST QUERIES: RUN IN TERMINAL   

    db.prepare(`
    SELECT *
    FROM cells
    WHERE dice(value, '1982') >= 0.8;

    `).all();
*/