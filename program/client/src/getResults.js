const axios = require('axios');
const Retrieval = require('retrieval')

const kwURL = 'http://localhost:3000/api/results/keyword/?keyword='; // hardcoded for now
const seedSetURL = 'http://localhost:3000/api/results/seed-set/?tableIDs=';
const dotOpURL = 'http://localhost:3000/api/results/dot-op/?dotOp='
const deleteURL = 'http://localhost:3000/api/results/delete/?del='
const swapURL = 'http://localhost:3000/api/results/swap/?rowIDs='

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

    static handleDotOps(dotOp, sliderValues) {
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
                var url = `${dotOpURL}${dotOp}&sliders=${sliderValues.join('&sliders=')}`
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
        var tables = { };
        data.forEach(function(item) {
            var list = tables[item["table_id"]];

            if(list){
                list['rows'].push(item);
            } else{
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
            var rows = { };
            tables[id]['rows'].forEach(function(value) {
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
         * retrieval function, where D is a given table,
         * Q is the array of keywords, k_1 = 1.5, and b = 0.75.
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

        let K = 0.75, B = 0.3
        let rt = new Retrieval(K, B);

        var tableArr = ResultService.tablesToArray(tables)

        rt.index(tableArr)

        let results = rt.search(keywords)

        var rankedTables = [];
        var id;
        var table;

        results.forEach(result => {
            id = result.split(' - ')[0] // Get table id
            table = tables[id]
            rankedTables.push({
                table_id: id,
                ...table,
            })
        })

        return rankedTables

    }

    static tablesToArray(tables) {
        /* Organizes the tables into an array of the following form:
         * [
         *    "<table_id> - <string of rows, no separators>"
         *     ...
         * ]
         * 
         * Arguments: 
         * - tables: The tables object formatted with 'handleResponse()'
         * 
         * Returns:
         * - array formatted to the above description
         */
        
         // TODO: Somehow include a bias for the location of the keywords
         var tableArr = [];
         var rows;
         var str;
         Object.keys(tables).forEach(table_id => {
                                                                    /* Join rows, split cells on separator, join cells with space */
            rows = `${tables[table_id]['title']} ${Object.values(tables[table_id]['rows']).join(' ').split(' || ').join(' ')}`;
            str = `${table_id} - ${rows}`
            tableArr.push(str);
         })

         return tableArr
    }
}


export default ResultService;