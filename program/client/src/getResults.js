const axios = require('axios');
const bm25 = require('wink-bm25-text-search')
const nlp = require('wink-nlp-utils')

const baseURL = 'http://localhost:3000/api/results/';
const kwURL = `${baseURL}keyword/?keyword=`;
const seedSetURL = `${baseURL}seed-set/?tableIDs=`;
const dotOpURL = `${baseURL}dot-op/?dotOp=`
const deleteURL = `${baseURL}delete/?del=`
const swapURL = `${baseURL}swap/?rowIDs=`

const pipe = [
    nlp.string.lowerCase,
    nlp.string.tokenize0,
];

class ResultService {

    static getKeywords(keywords) {
        /* Handles the API call from the user interface to the database, 
         * parses the data which is returned from the call to make it easier 
         * to present. 
         * 
         * Arguments: 
         * - keywords: A list of keywords passed by user input
         * - categories: The categories in which to look for the keywords
         * 
         * Returns:
         * - Promise containing the formatted response, or reject with an error. 
         */
        return new Promise((resolve, reject) => {
            try {
                var url = kwURL + keywords.replace(new RegExp(/ *, */, 'gi'), () => {
                    return '&keyword='
                })

                axios.get(url)
                    .then((response) => {
                        var tables = ResultService.handleResponse(response)
                        tables = ResultService.rankTables(tables, keywords.replace(/ *, */g, ' '));

                        resolve(tables);
                    })
            } catch (err) {
                reject(err);
            }
        })
    }

    static postSeedSet(rowIDs, tableIDs) {
        /* Once the user has decided on a seed set, the row, table, and 
         * 'stickiness' information is passed to the backend to be stored. 
         * 
         * Arguments: 
         * - rowIDs: The list of rowIDs for the rows the user selected.
         * - tableIDs: The list of tableIDs for the rows the user selected
         *      => NOTE: The rowID at index 'i' in rowIDs belongs to the table
         *         defined at index 'i' in tableIDs. 
         * - sliderValues: The values of the sliders used to determine 'stickiness', 
         *      ordered by the appearance of the columns from left to right
         * 
         * Returns:
         * - Promise: resolves with nothing (change slides), or reject with error
         */
        return new Promise((resolve, reject) => {
            try {
                var url = `${seedSetURL}
                            ${tableIDs.join('&tableIDs=')}
                            &rowIDs=${rowIDs.join('&rowIDs=')}`
                // console.log(url);
                axios.get(url)
                    .then(() => {
                        resolve();
                    })
            } catch (error) {
                reject(error);
            }
        })
    }

    static swapCells(indices) {
        /* Handles the swapping of the cells the user selected
         * 
         * Arguments:
         * - indices: an array of arrays containing the row and column indices of the 
         *      cells to be swapped
         * 
         * Returns:
         * - Promise: Resolves if successfully swapped cells, rejects otherwise */
        return new Promise((resolve, reject) => {
            try {
                var url = `${swapURL}${indices.map(index => index[0]).join('&rowIDs=')}&colIDs=${indices.map(index => index[1]).join('&colIDs=')}`
                axios.get(url)
                    .then((response) => {
                        resolve(response['data']);
                    })
            } catch (err) {
                reject(err)
            }
        })
    }

    static deleteCols(cols) {
        /* Handles the deletions of columns from the user table, 
         * constructing the url and calling the back-end's API
         * 
         * Arguments:
         * - cols: The array of columns to delete, 1-indexed
         * 
         * Returns:
         * - Promise containing the success / failure of the API call
         */
        return new Promise((resolve, reject) => {
            try {
                var url = `${deleteURL}${cols.join('&del=')}`
                axios.get(url)
                    .then((response) => {
                        resolve(response['data'])
                    })
            } catch (error) {
                reject(error);
            }
        })
    }

    static handleDotOps(dotOp, sliderValues, uniqueCols, rowsReturned) {
        /* Handles all user input once the user has selected a seed set and
         * is choosing dot operations.
         * 
         * Arguments:
         * - dotOp: A string determining the operation to execute
         *      => belongs to ['xr', 'xc', 'fill']
         * 
         * Returns:
         * - Promise: resolves with formatted response, rejects with error.
         */
        return new Promise((resolve, reject) => {
            try {
                var url = `${dotOpURL}${dotOp}&sliders=${sliderValues.join('&sliders=')}&unique=${uniqueCols.join('&unique=')}&rowsReturned=${rowsReturned}`
                axios.get(url)
                    .then((response) => {
                        resolve(response['data']);
                    })
            } catch (err) {
                reject(err);
            }
        })
    }


    static handleResponse(response) {
        /* Performes the formatting necessary for the data returned from the 
         * API calls. Organizes the data first by the table_id, then by the row.
         * The DB call uses 'ORDER BY', and so we know that the data is already sorted
         * in the order we want.
         * 
         * Arguments:
         * - response: The response from the API call
         * 
         * Returns: 
         * - The formatted response according to the rules defined above
         */
        var data = response['data'];

        // https://stackoverflow.com/questions/21776389/javascript-object-grouping

        /* groupBy titles */
        var tables = {};
        data.forEach(function (item) {
            var list = tables[item["table_id"]];

            if (list) {
                list['rows'].push(item);
            } else {
                tables[item["table_id"]] = {
                    title: item['title'],
                    rows: [item],
                    rowCount: item['rowCount']
                }
            }
            delete item["table_id"]
        });


        /* 'groupBy rows for each title */
        for (var id in tables) {
            var rows = {};
            tables[id]['rows'].forEach(function (value) {
                rows[value['row_id']] = `${value['value']}`
            });

            tables[id]['rows'] = rows
        }

        // console.log(tables);
        return tables;
    }

    static rankTables(tables, keywords) {
        /* This function ranks the tables returned by 
         * the keyword search based on the Okapi BM25 
         * retrieval function
         * https://en.wikipedia.org/wiki/Okapi_BM25
         * 
         * Arguments: 
         * - tables: The object containing all table information
         * - keywords: The string containing the keywords, a comma separated list
         * 
         * Returns:
         * - tables object, modified to use rank as key rather than table_id.
         * 
         */


        /* Standard pipe and config from Wink-bm25 documentation
         * https://www.npmjs.com/package/wink-bm25-text-search
         * Accessed June 19th, 2020 */

        var rankedTables = [];
        var engine = bm25();

        /* Wink-BM25() requires at least 3 documents.
         * If there are < 3 documents (tables), just display them 
         * as is */
        if (Object.keys(tables).length < 3) {
            Object.keys(tables).forEach(id => {
                rankedTables.push({
                    table_id: id,
                    ...tables[id]
                })
            })
        } else {

            // Preparatory tasks
            engine.defineConfig({
                fldWeights: { title: 10, rows: 1 },
                bm25Params: { k1: 1.2, b: 0.4, k: 1 }
            });

            engine.definePrepTasks(pipe);
            ResultService.addTablesToEngine(tables, engine)

            // Indexing
            engine.consolidate()

            // Searching
            let results = engine.search(keywords, 20)

            var id;
            var table;

            results.forEach(result => {
                id = result[0]
                table = tables[id]
                rankedTables.push({
                    table_id: id,
                    ...table,
                })
            })
        }

        return rankedTables

    }

    static addTablesToEngine(tables, engine) {
        /* Organizes each table into an object, with fields for the table_id, 
         * title and the table rows.
         * 
         * Arguments: 
         * - tables: The tables object formatted with 'handleResponse()'
         * 
         * Returns:
         * - Array of objects, with each object representing a table
         *      as formatted above
         */

        // TODO: Somehow include a bias for the location of the keywords
        var curTable = {};
        Object.keys(tables).forEach(table_id => {
            curTable['title'] = tables[table_id]['title']           /* Join rows, split cells on separator, join cells with space */
            curTable['rows'] = Object.values(tables[table_id]['rows']).join(' ').split(' || ').join(' ')
            engine.addDoc(curTable, table_id)
        })
    }
}


export default ResultService;