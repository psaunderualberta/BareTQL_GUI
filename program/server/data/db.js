/* REFERENCES
 * https://stackabuse.com/a-sqlite-tutorial-with-node-js/
 * https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md */

const sqlite3 = require("better-sqlite3");
const leven = require("leven");
const ttest = require("ttest");
const statistics = require("simple-statistics");
const bs25 = require("./bs25-sim-search");
const solver = require("javascript-lp-solver");

/* SCHEMA
 * cells(table_id, row_id, col_id, value)
 * titles(table_id, title)
 * captions(table_id, caption)
 * headers(table_id, col_id, header)
 * keywords_cell_header(keyword, table_id, row_id, col_id,location)
 * keywords_title_caption(table_id, location, keyword) */

/* An instance of the Database class represents a database */
class Database {
  /**
   * Constructor to initialize the database class
   * @param {String} dbPath the path to the database from the cwd
   */
  constructor(dbPath) {
    try {
      this.db = new sqlite3(dbPath, {
        readonly: true,
      });
    } catch (error) {
      console.log(`Something went wrong with dbPath (${dbPath}): ${error}`);
      return;
    }

    console.log(`Connected to database at ${dbPath}`);

    this.seedSet = {
      sliders: [],
      rows: [],
      types: [],
      table_ids: "",
      row_ids: "",
      numCols: 0,
    };

    this.functions = {
      xr: this.xr,
    };

    this.cellSep = " || ";
    this.rowsReturned = 10;

    /* Aggregate function to turn col into array
     * https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
     * Accessed June 23rd, 2020 */
    this.db.aggregate("toArr", {
      start: () => [],
      step: (array, nextValue) => {
        array.push(nextValue);
      },
      result: (array) => JSON.stringify(array),
    });

    /* We are using Welch's t-test to calculate the probability
     * of two numerical columns being related
     * https://en.wikipedia.org/wiki/Welch%27s_t-test
     * Accessed June 23 2020 */
    this.db.function("T_TEST", { deterministic: true }, (arr1, arr2) => {
      arr1 = JSON.parse(arr1)
        .map((num) => Number(num))
        .filter((num) => !isNaN(num));
      arr2 = JSON.parse(arr2)
        .map((num) => Number(num))
        .filter((num) => !isNaN(num));

      return this.ttestCases(arr1, arr2);
    });

    this.db.function(
      "OVERLAP_SIM",
      { deterministic: true },
      (ssCol, keyCol) => {
        ssCol = JSON.parse(ssCol).map((v) => String(v));
        keyCol = JSON.parse(keyCol);

        return this.overlapSim(ssCol, keyCol);
      }
    );
  }

  /**
   * Queries the database for keywords found in cells, headers,
   * titles, and captions and returns the rows that matched,
   * @param {String} keywords the stringified array of keywords to search for.
   * @return {Promise} Promise containing the result of the keyword search.
   */
  keywordSearch(keywords) {
    var results = [];
    keywords = this.makeStrArr(keywords);
    var keywordQMarks = this.getQMarks(keywords);

    /* Nested query is due to same keyword appearing in multiple
     * locations on same table, leading to repeated rows in output */
    const stmt = this.db.prepare(`
            WITH cellHeaderRows(table_id, row_id) AS (
                SELECT DISTINCT table_id, row_id 
                FROM keywords_cell_header 
                WHERE keyword IN ${keywordQMarks}
            ), titleCaptionRows(table_id) AS (
                SELECT DISTINCT table_id 
                FROM keywords_title_caption 
                WHERE keyword IN ${keywordQMarks}
            ), keywordRows AS (
                SELECT k.table_id, c.row_id, GROUP_CONCAT(c.value, ' || ') AS value
                FROM cellHeaderRows k NATURAL JOIN cells c
                WHERE c.location != 'header'
                GROUP BY k.table_id, c.row_id
    
                UNION
    
                SELECT k.table_id,  c.row_id, GROUP_CONCAT(c.value, ' || ') AS value
                FROM titleCaptionRows k NATURAL JOIN cells c
                GROUP BY k.table_id, c.row_id
    
                ORDER BY k.table_id, c.row_id
            ), rowCounts(table_id, rowCount) AS (
                SELECT table_id, COUNT(DISTINCT row_id) AS rowCount
                FROM cells
                GROUP BY table_id
            ), rows(table_id, row_id, value, rowCount) AS (
                SELECT r.table_id, row_id, value, rowCount
                FROM keywordRows r
                LEFT JOIN
                rowCounts c
                ON r.table_id = c.table_id
            )
            SELECT r.table_id, title, row_id, value, rowCount
            FROM rows r NATURAL JOIN titles t;
        `);

    /* Return the promise containing the result of the query */
    return new Promise((resolve, reject) => {
      this.all(stmt, [...keywords, ...keywords], results)
        .then(() => {
          resolve(results);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Sets the current seed set to be referenced later upon set expansion.
   * @param {String} tableIDs Stringified list of tableIDs of the seed set rows
   * @param {String} rowIDs Stringified list of rowIDs of the seed set rows
   * @return {Promise} Promise which resolves when the seed set is successfully set.
   */
  postSeedSet(tableIDs, rowIDs) {
    var customTable = [];
    rowIDs = this.makeStrArr(rowIDs);
    tableIDs = this.makeStrArr(tableIDs);

    this.seedSet = {
      table_ids: tableIDs.map((id) => id.trim()),
      row_ids: rowIDs.map((id) => id.trim()),
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
      customTable.push(
        `SELECT ${tableIDs[i].trim()} AS table_id, ${rowIDs[
          i
        ].trim()} AS row_id`
      );
    }
    customTable = `(${customTable.join(" UNION ALL ")})`;

    const stmt = this.db.prepare(` 
            SELECT DISTINCT table_id, row_id, GROUP_CONCAT(value, '${this.cellSep}') AS value
            FROM cells c NATURAL JOIN ${customTable}
            GROUP BY table_id, row_id;
        `);

    return new Promise((resolve, reject) => {
      this.all(stmt, [], this.seedSet["rows"])
        .then(() => {
          /* 'unpack' results of query */
          this.seedSet["rows"] = this.seedSet["rows"].map(
            (row) => row["value"]
          );

          this.cleanRows(true, false);

          /* Set sliders to default value (50%) */
          for (
            let i = 0;
            i < this.seedSet["rows"][0].split(this.cellSep).length;
            i++
          ) {
            this.seedSet["sliders"].push(50);
          }

          resolve();
        })
        .catch((err) => {
          console.log(err);
          reject(err);
        });
    });
  }

  /**
   * Performs the steps to clean the rows of the seed set,
   * including finding the number of cols, filling Null values,
   * grouping columns, and getting the types of the columns
   * @param {Boolean} changeSeed Flag if the seed set has been changed
   * @param {Boolean} grouping Flag if the columns should be grouped / rearranged
   */
  cleanRows(changeSeed, grouping) {
    if (changeSeed)
      this.seedSet["numCols"] = this.seedSet["rows"]
        .map((row) => row.split(" || ").length)
        .reduce((a, b) => Math.max(a, b), 0);

    this.fillNulls(this.seedSet["rows"], this.seedSet["numCols"]);

    /* Group cols only if we have a lot of data, otherwise let the user perform all organization */
    if (
      grouping &&
      (new Set(this.seedSet["table_ids"]).size > 2 ||
        this.seedSet["rows"].length > 10)
    ) {
      this.groupCols(this.seedSet["rows"]);
    }

    if (changeSeed) this.seedSet["types"] = this.getTypes(this.seedSet["rows"]);

    /* We access these values often enough that they are worth storing to save time */
    this.seedSet["numNumerical"] = this.seedSet["types"].filter(
      (type) => type === "numerical"
    ).length;
    this.seedSet["numTextual"] = this.seedSet["types"].filter(
      (type) => type === "text"
    ).length;
    this.seedSet["numNULL"] = this.seedSet["types"].filter(
      (type) => type === "NULL"
    ).length;
  }

  /**
   * Attempts to group columns based on similar datatypes
   * The datatypes we are considering are: 'null', 'numerical',
   * and 'text' if neither of these two options are satisfied.
   * This is designed to be a general grouping measure, as
   * we provide the user with the option to manually rearrange cells themselves.
   * Cells are only swapped across columns; they are not swapped between rows.
   *
   * We are grouping the columns thusly:
   * [PRIMARY KEY (unchanged), ...text, ...numerical, ...empty cells]
   *
   * @param {Array} rows An array of stringified rows to be grouped by column type.
   */
  groupCols(rows) {
    var curRow;

    for (let i = 0; i < rows.length; i++) {
      /* Split rows into arrays of cells */
      curRow = rows[i].split(" || ");

      /* I created this O(n) 'sorting' algorithm for 3 items w/ duplicates
       * when solving the leetcode problem 'sort colours':
       * https://leetcode.com/problems/sort-colors/ */
      var numPointer = 1;
      var emptyPointer = 1;

      for (let j = 1; j < curRow.length; j++) {
        if (curRow[j] === "NULL") continue;

        this.swap(curRow, emptyPointer, j);
        if (isNaN(curRow[emptyPointer])) {
          this.swap(curRow, emptyPointer, numPointer);
          numPointer++;
        }

        emptyPointer++;
      }

      rows[i] = curRow.join(" || ");
    }
  }

  /**
   * Swaps the two cells selected by the user, denoted
   * by the positions of values in rowIDs, colIDs
   * @param {Array} rowIDs The array of rowIDs to be swapped
   * @param {Array} colIDs The array of column IDs to be swapped
   * @return {Promise} The result of the swapped rows.
   */
  swapCells(rowIDs, colIDs) {
    return new Promise((resolve, reject) => {
      try {
        var rows = this.seedSet["rows"].map((row) => row.split(" || "));

        var tmp = rows[rowIDs[0]][colIDs[0]];
        rows[rowIDs[0]][colIDs[0]] = rows[rowIDs[1]][colIDs[1]];
        rows[rowIDs[1]][colIDs[1]] = tmp;

        this.seedSet["rows"] = rows.map((row) => row.join(" || "));

        this.cleanRows(true, false);

        resolve(this.seedSet);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deletes the specified columns from the user's table.
   * @param {String} cols The stringified list of column ids to be deleted.
   */
  deleteCols(cols) {
    cols = this.makeStrArr(cols);
    var row;
    return new Promise((resolve, reject) => {
      try {
        /* Delete slider cells */
        cols.forEach((col) => {
          delete this.seedSet["sliders"][col - 1];
        });
        this.seedSet["sliders"] = this.seedSet["sliders"].filter(
          (val) => typeof val !== "undefined"
        );

        /* Delete columns in the table */
        for (let i = 0; i < this.seedSet["rows"].length; i++) {
          row = this.seedSet["rows"][i].split(this.cellSep);
          cols.forEach((col) => {
            delete row[col - 1]; // We use 1-indexing on front-end, convert to 0-indexing
          });

          row = row.filter((cell) => typeof cell !== "undefined");
          if (row.length > 0) {
            this.seedSet["rows"][i] = row.join(this.cellSep);
          } else {
            this.seedSet["rows"][i] = row;
          }
        }

        this.cleanRows(true, false);

        resolve(this.seedSet);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handles all dot operations, calling the correct functions to mutate the
   * seed set attribute. The first time this method is called, we are initializing
   * the operations page and so return the rows of the seed set without changing them.
   * @param {String} dotOp The operation to perform
   * @param {String} sliderValues The stringified list of slider values.
   * @param {String} uniqueCols The stringified list of column ids which are set to be unique.
   * @param {String} rowsReturned The number of rows to be returned to the user.
   * @returns {Promise} A promise which resolves when the dot operation completes.
   */
  handleDotOps(dotOp, sliderValues, uniqueCols, rowsReturned) {
    return new Promise((resolve, reject) => {
      try {
        /* Rather than adjusting existing slider values and unique columns,
         * we just reset all values to those currently set by the user
         * (even if they haven't changed) */
        this.rowsReturned = rowsReturned;

        if (sliderValues.length) {
          sliderValues = this.makeStrArr(sliderValues);
          for (let i = 0; i < sliderValues.length; i++) {
            this.seedSet["sliders"][i] = Number(sliderValues[i]);
          }
        }

        this.seedSet["uniqueCols"] = [];
        for (let i = 0; i < uniqueCols.length; i++) {
          this.seedSet["uniqueCols"].push(uniqueCols[i] - 1);
        }

        /* Handle specific dot op */
        new Promise((res, rej) => {
          /* Only upon initialization of the dot-ops page OR user deleted all columns */
          if (
            dotOp === "undefined" ||
            this.seedSet["rows"].every((row) => row.length === 0)
          ) {
            res(this.seedSet["rows"].flat());
          } else if (dotOp === "xr") {
            this.xr().then((results) => {
              res(results);
            });
          } else {
            rej(`dotOp specified (${dotOp}) is not possible`);
          }
        }).then((results) => {
          var seedCopy = { ...this.seedSet };

          if (typeof results["rows"] !== "undefined") {
            this.fillNulls(results["rows"], this.seedSet["numCols"]);
            seedCopy["rows"] = results["rows"];
            seedCopy["info"] = results["info"];
          } else {
            this.fillNulls(results, this.seedSet["numCols"]);
            seedCopy["rows"] = results;
          }

          resolve(seedCopy);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Delegates tasks related to the set expansion of
   * seed set rows.
   * @returns {Promise} Promise which resolves if successfully completed search, rejects otherwise
   */
  xr() {
    return new Promise((resolve, reject) => {
      try {
        this.getMatchingTables()
          .then((results) => {
            return this.getTextualMatches(results);
          })
          .then((results) => {
            return this.getNumericalMatches(results);
          })
          .then((results) => {
            return this.getNULLMatches(results);
          })
          .then((results) => {
            return this.getPermutedRows(results);
          })
          .then((results) => {
            return this.rankResults(results);
          })
          .then((results) => {
            resolve(results);
          })
          .catch((error) => {
            console.log(error);
            resolve([]);
          });
      } catch (error) {
        console.log(error);
        reject(error);
      }
    });
  }

  /**
   * Detects the tables which are likely to be related to the
   * seed set. This is done by evaluating the similarity between
   * the LH-most textual column in the seed set and textual
   * columns in a table, and similarly for numerical columns. We then
   * take the intersection of the tables which matched textually and numerically
   * @returns {Promise} Promise which resolves with tables if querying is successful, rejects otherwise.
   */
  getMatchingTables() {
    var rows = this.seedSet["rows"].map((row) => row.split(" || "));
    var textSlider = [];
    var numSlider = [];
    var textCol = [];
    var numCol = [];
    var tables = [];
    var params = [];
    var stmt = "";

    var getFirstCol = function (seedSet, type, slider, arr) {
      for (let i = 0; i < seedSet["types"].length; i++) {
        if (seedSet["types"][i] !== type || seedSet["sliders"][i] === 0)
          continue;

        slider.push(seedSet["sliders"][i]);
        for (let j = 0; j < rows.length; j++) {
          if (rows[j][i] !== "NULL") arr.push(rows[j][i]);
        }
        break;
      }
    };

    /* Get the first textual & numerical columns, starting from RHS.
     * These first columns are treated as the 'primary keys', in that related tables must
     * be measurably related to these columns */
    getFirstCol(this.seedSet, "text", textSlider, textCol);
    getFirstCol(this.seedSet, "numerical", numSlider, numCol);

    textSlider = textSlider[0];
    numSlider = numSlider[0];
    numCol = JSON.stringify(numCol.map((num) => Number(num)));

    return new Promise((resolve, reject) => {
      try {
        /* 'textCol' is a stringified array, so an empty textCol is the string '[]'.
         * The '- 2' is to compensate for the brackets that are always present */
        if (textCol.length - 2) {
          stmt += `
                        SELECT table_id, title
                        FROM cells NATURAL JOIN columns NATURAL JOIN titles NATURAL JOIN (
                            SELECT table_id
                            FROM columns
                            WHERE type = 'text'
                            GROUP BY table_id
                            HAVING COUNT(DISTINCT col_id) >= ?
                        )
                        WHERE type = 'text'
                        AND value IN ${this.getQMarks(textCol)}
                        GROUP BY table_id, col_id
                        HAVING COUNT(*) >= ?
        
                        INTERSECT
                    `;
          params.push(
            ...[
              this.seedSet["numTextual"],
              ...textCol,
              (textSlider / 100) * textCol.length,
            ]
          );
        }

        if (numCol.length - 2) {
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
                    `;
          params.push(
            ...[this.seedSet["numNumerical"], numCol, numCol, numSlider / 100]
          );
        }

        stmt += `
                    SELECT table_id, title
                    FROM cells NATURAL JOIN titles
                    GROUP BY table_id
                    HAVING MAX(col_id) >= ?;
                `;
        params.push(this.seedSet["types"].length - 1);

        stmt = this.db.prepare(stmt);
        this.all(stmt, params, tables);

        resolve(tables);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gets the 'best' textual permutation for all
   * tables found by getMatchingTables(), where 'best'
   * is determined by the largest cumulative overlap similarity
   * for a permutation.
   * @param {Array} tables The array of tables from the previous query
   * @returns {Promise} Promise that resolves if querying is successful, rejects otherwise
   */
  getTextualMatches(tables) {
    var rows = this.seedSet["rows"].map((row) => row.split(" || "));
    var sliderIndices = [];
    var ssCols = [];
    var pValDP = [];
    var cols = [];
    var column;
    var stmt;

    for (let i = 0; i < this.seedSet["types"].length; i++) {
      if (this.seedSet["types"][i] !== "text") continue;

      ssCols.push([]);
      sliderIndices.push(this.seedSet["sliders"][i]);
      column = ssCols[ssCols.length - 1];
      for (let j = 0; j < rows.length; j++) {
        if (rows[j][i] !== "NULL") column.push(rows[j][i]);
      }
    }

    for (let i = 0; i < sliderIndices.length; i++) pValDP.push([]);

    return new Promise((resolve, reject) => {
      try {
        /* The steps required to find the permutations of the textual columns
         * are quite similar to the steps for finding numerical column permutations.
         * However, there are a few important differences that prevent the two operations
         * from being combined into one function, such as the method used to score the permutations
         * and the format required of the columns retrieved */
        var result;
        for (let i = 0; i < tables.length; i++) {
          result = tables[i];
          cols = [];
          stmt = this.db.prepare(`
                        SELECT table_id, col_id, toArr(value) AS column
                        FROM cells c NATURAL JOIN columns col
                        WHERE col.type = 'text'
                        AND c.value != ''
                        AND c.location != 'header'
                        AND table_id = ?
                        GROUP BY table_id, col_id
                    `);

          this.all(stmt, [result["table_id"]], cols);

          /* 'refine' result of query */
          cols = {
            columns: cols.map((res) => JSON.parse(res["column"])),
            colIDs: cols.map((res) => res["col_id"]),
          };

          /* Re-initialize array used to log the values */
          this.resetDPArr(
            pValDP,
            sliderIndices.length,
            Math.max(...cols["colIDs"])
          );

          /* Fill DP array */
          for (let i = 0; i < ssCols.length; i++) {
            cols["columns"].forEach((col, j) => {
              pValDP[i][cols["colIDs"][j]] = this.overlapSim(ssCols[i], col);
            });
          }

          /* Find the best mapping from the newfound table to the seed set */
          var lpResult = this.lpSolve(pValDP, "numTextual", cols["colIDs"]);

          // If a mapping is possible, record the mapping
          if (
            lpResult["feasible"] &&
            (!this.seedSet["numTextual"] || lpResult["mapping"].length !== 0)
          ) {
            tables[i] = {
              table_id: result["table_id"],
              textualPerm: lpResult["mapping"],
              textScore: lpResult["score"],
            };
          } else {
            // Not possible to map columns, so remove this one.
            tables.splice(i--, 1);
          }
        }

        resolve(tables);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * For each table in the list of tables from 'getMatchingTables',
   * we check all permutations of the table's numerical columns in order
   * to see which permutation is the 'best'. A permutation is scored using "Fisher's
   * method" of combining p-values, where the p-value for each pair of columns
   * is the maximum of overlap similarity and the p-value of Welch's t-test. These
   * p-values are combined using Fisher's Method in order to produce a Chi-square test statistic,
   * and the permutation with the highest test statistic is determined to be the best.
   * @param {Array} tables The array of table objects from the previous query
   * @returns {Promise} Promise which resolves if column mapping is successful, rejects otherwise
   */
  getNumericalMatches(tables) {
    var rows = this.seedSet["rows"].map((row) => row.split(" || "));
    var sliderIndices = [];
    var column = [];
    var ssCols = [];
    var pValDP = [];
    var cols = [];
    var table;
    var stmt;

    for (let i = 0; i < this.seedSet["types"].length; i++) {
      if (this.seedSet["types"][i] !== "numerical") continue;

      ssCols.push([]);
      sliderIndices.push(this.seedSet["sliders"][i]);
      column = ssCols[ssCols.length - 1];
      for (let j = 0; j < rows.length; j++) {
        if (rows[j][i] !== "NULL") column.push(Number(rows[j][i]));
      }
    }

    return new Promise((resolve, reject) => {
      try {
        for (let i = 0; i < this.seedSet["numNumerical"]; i++) pValDP.push([]);
        /* Get the best permutation for numerical columns for each table */
        for (let i = 0; i < tables.length; i++) {
          table = tables[i];
          cols = [];
          stmt = this.db.prepare(`
                        SELECT table_id, col_id, toArr(value) AS column
                        FROM cells c NATURAL JOIN columns col
                        WHERE col.type = 'numerical'
                        AND c.value != ''
                        AND c.location != 'header'
                        AND table_id = ?
                        GROUP BY table_id, col_id
                        `);

          this.all(stmt, [table["table_id"]], cols);
          /* 'refine' result of query */
          cols = {
            columns: cols.map((res) =>
              JSON.parse(res["column"]).map((num) => Number(num))
            ),
            colIDs: cols.map((res) => res["col_id"]),
          };

          /* Re-initialize dynamic programming array */
          this.resetDPArr(
            pValDP,
            this.seedSet["numNumerical"],
            Math.max(...cols["colIDs"])
          );

          /* Fill DP array */
          for (let i = 0; i < ssCols.length; i++) {
            cols["columns"].forEach((col, j) => {
              pValDP[i][cols["colIDs"][j]] = Math.log(
                Math.max(
                  this.ttestCases(ssCols[i], col),
                  this.overlapSim(ssCols[i], col)
                )
              );
            });
          }

          var result = this.lpSolve(pValDP, "numNumerical", cols["colIDs"]);

          // Decipher results of the LP solve
          if (result["feasible"]) {
            if (this.seedSet["numNumerical"]) {
              table["numericalPerm"] = result["mapping"];
              table["score"] = -2 * result["score"] + table["textScore"];
            } else {
              table["numericalPerm"] = [];
              table["score"] = table["textScore"];
            }
          } else {
            tables.splice(i--, 1);
          }
        }

        resolve(tables);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * If there are 'n' columns in the seed set which are entirely filled with
   * 'NULL', this function will find the first 'n' columns in ascending order which
   * are not already in the numericalPerm or textualPerm for the table. It will then add them
   * to the table's 'NULLperm'.
   * @param {Array} tables The list of table objects from getMatchingTables(), after textual and numerical column mapping
   * @returns {Promise} Promise which resolves if querying is successful, rejects otherwise
   */
  getNULLMatches(tables) {
    var indices;
    var stmt;

    return new Promise((resolve, reject) => {
      try {
        /* If there are no NULL columns, bypass the querying */
        if (this.seedSet["numNULL"]) {
          for (let table of tables) {
            table["NULLperm"] = [];
            indices = `(${table["numericalPerm"].concat(
              table["textualPerm"]
            )})`;

            stmt = this.db.prepare(`
                            SELECT col_id
                            FROM cells
                            WHERE table_id = ?
                            AND col_id NOT IN ${indices}
                            GROUP BY col_id
                            LIMIT ?;
                        `);

            this.all(
              stmt,
              [table["table_id"], this.seedSet["numNULL"]],
              table["NULLperm"]
            );
            table["NULLperm"] = table["NULLperm"].map((col) => {
              return col["col_id"];
            });
          }
        }

        resolve(tables);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Retrieves the rows of the tables found in the previous step,
   * permuted to the 'best' possible permutations found in
   * getNumericalMatches() and getTextualMatches()
   * @param {Array} tables The results of getNumericalMatches & getTextualMatches
   * @returns {Promise} Promise which resolves if querying is successful, Rejects otherwise
   */
  getPermutedRows(tables) {
    var cases;
    var stmt;

    return new Promise((resolve, reject) => {
      try {
        var nP = 0;
        var tP = 0;
        var nullP = 0;

        for (let table of tables) {
          table["rows"] = [];
          table["titles"] = [];

          // Create custom CASE statement for col_id for ordering of columns based on ideal permutations
          var ignoredCols =
            table["textualPerm"].length + table["numericalPerm"].length + 1;
          nP = 0;
          tP = 0;
          nullP = 0;

          cases = "";

          for (let i = 0; i < this.seedSet["types"].length; i++) {
            if (this.seedSet["types"][i] === "text")
              cases += `WHEN ${table["textualPerm"][tP++]} THEN ${i}\n`;
            else if (this.seedSet["types"][i] === "numerical")
              cases += `WHEN ${table["numericalPerm"][nP++]} THEN ${i}\n`;
            else cases += `WHEN ${table["NULLperm"][nullP++]} THEN ${i}\n`;
          }

          // Columns that are not in the column range of the seed set are ignored.
          cases += `ELSE ${ignoredCols}`;

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
                    `);

          this.all(stmt, [table["table_id"], ignoredCols], table["rows"]);

          for (let i = 0; i < table["rows"].length; i++) {
            table["titles"].push(table["rows"][i]["title"]);
            table["rows"][i] = table["rows"][i]["value"];
          }
        }

        resolve(tables);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Ranks the results that are gotten from getTextualMatches
   * by comparing each potential row with each row in the seed set, giving
   * that comparison a score, then averaging the scores across seed set rows
   * returns the 10 best
   * @param {Array} tables An array of rows from the tables that were identified to fit best with the data.
   * @returns {Promise} Promise which resolves if ranking is successful, rejects otherwise.
   */
  rankResults(tables) {
    var cols = this.seedSet["rows"].map((row) => row.split(" || "));
    var scores = {};
    var numRows = 0;
    var key;

    function adjustK1(val) {
      return 0.01 * val;
    }

    /* Transposing 2D array in JS
     * https://stackoverflow.com/questions/17428587/transposing-a-2d-array-in-javascript
     * Accessed August 5th, 2020 */
    var numRows = tables.reduce((num, table) => num + table["rows"].length, 0);

    cols = cols[0].map((x, i) => cols.map((x) => x[i]));

    /* Define an object to contain the results of the row ranking */
    for (let table of tables) {
      scores[table["table_id"]] = {};
      for (let i = 0; i < table["rows"].length; i++) {
        table["rows"][i] = table["rows"][i].split(" || ");
        key = `${table["table_id"]}-${i}`;
        scores[key] = {};
        scores[key]["row"] = table["rows"][i];
        scores[key]["title"] = table["titles"][i];
        scores[key]["score"] = 0;
        scores[key]["ranks"] = [];
        numRows++;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        /* Custom similarity function to work with both textual
         * & numerical values */
        var normData = (a, b) => {
          if (!isNaN(a) && !isNaN(b)) {
            a = Math.abs(a); /* Automatically converts to Number */
            b = Math.abs(b);
            return (Math.min(a, b) + 10e-5) / (Math.max(a, b) + 10e-5);
          } else {
            return 1 - leven(a, b) / Math.max(a.length, b.length);
          }
        };

        var engine = new bs25(normData);
        var numNonZeroCols = 0;

        for (let col = 0; col < this.seedSet["numCols"]; col++) {
          if (this.seedSet["sliders"][col] === 0) continue;

          numNonZeroCols++;

          /* Reset search engine */
          engine.defineConfig({
            terms: cols[col],
            bs25Params: {
              k1: adjustK1(this.seedSet["sliders"][col]),
              b: 0.3,
            },
          });

          for (let table of tables) {
            for (let [i, row] of table["rows"].entries()) {
              if (row[col] === "NULL")
                engine.addDoc("", `${table["table_id"]}-${i}`);
              else engine.addDoc(row[col], `${table["table_id"]}-${i}`);
            }
          }

          engine.consolidate();
          var results = engine.query(numRows);

          /* Borda's method for rank aggregation */
          var numAfter = results.reduce((prev, cur) => prev + cur[0].length, 0);
          results.forEach((result, i) => {
            result[0].forEach((id) => {
              scores[id]["ranks"].push(numAfter / numRows);
            });
            numAfter -= result[0].length;
          });

          engine.reset();
        }

        results = Object.values(scores).filter(
          (obj) => Object.keys(obj).length
        );

        /* Use the average ranking across the row as the score */
        results = results.map((score) => {
          score["score"] +=
            score["ranks"].reduce((prev, cur) => prev + cur, 0) /
            numNonZeroCols;
          return score;
        });
        var tmp = { rows: [], info: [] };

        /* Sort the rows in descending order according to score */
        results = results.sort((res1, res2) => {
          return res2["score"] - res1["score"];
        });

        results.forEach((res) => {
          tmp["rows"].push(res["row"]);
          tmp["info"].push(
            `Title: List of ${res[
              "title"
            ].trim()}<br>Similarity Score: ${+parseFloat(res["score"]).toFixed(
              5
            )}`
          );
        });

        results = tmp;

        results = this.applyColumnConstraints(results);

        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Ensures that each column that the user tagged as 'unique' is actually unique,
   * and each column with 100% stickiness has only the values in the seed set.
   * @param {Array} rankedRows The rows that are sorted in ascending order according to their score.
   * @returns {Array} The top 10 results (or less) that satisfy the user's unique
   */
  applyColumnConstraints(rankedRows) {
    var uniqueSets = [];
    var stickySets = [];
    var uniqueRows = { rows: [], info: [] };
    var stickyCols = this.seedSet["sliders"].reduce((arr, cur, i) => {
      if (cur === 100) arr.push(i);
      return arr;
    }, []);
    var rrIndex = 0;

    for (const _ of this.seedSet["uniqueCols"]) uniqueSets.push(new Set());
    for (const _ of stickyCols) stickySets.push(new Set());

    for (let row of this.seedSet["rows"]) {
      row = row.split(" || ");
      for (let [i, el] of stickyCols.entries()) {
        stickySets[i].add(row[el]);
      }
    }

    while (
      uniqueRows["rows"].length < this.rowsReturned &&
      rrIndex < rankedRows["rows"].length
    ) {
      /* This row is in the expanded rows, or has a NULL value */
      if (
        uniqueRows["rows"].indexOf(
          rankedRows["rows"][rrIndex].join(" || ").trim()
        ) !== -1 ||
        this.seedSet["rows"].indexOf(
          rankedRows["rows"][rrIndex].join(" || ").trim()
        ) !== -1 ||
        rankedRows["rows"][rrIndex].indexOf("NULL") > 0
      )
        rrIndex++;
      /* No values in rankedRows['rows'][rrIndex] are in the uniqueCols' sets,
       * every value in rankedRows['rows'][rrIndex] are in the stickyCols' sets */ else if (
        this.seedSet["uniqueCols"]
          .map((col, i) => uniqueSets[i].has(rankedRows["rows"][rrIndex][col]))
          .every((inSet) => !inSet) &&
        stickyCols
          .map((col, i) => stickySets[i].has(rankedRows["rows"][rrIndex][col]))
          .every((inSet) => inSet)
      ) {
        for (let [i, el] of this.seedSet["uniqueCols"].entries())
          uniqueSets[i].add(rankedRows["rows"][rrIndex][el]);

        uniqueRows["rows"].push(rankedRows["rows"][rrIndex].join(" || "));
        uniqueRows["info"].push(rankedRows["info"][rrIndex++]);
      } else rrIndex++;

      /* A unique constraint is broken if we show the row to the user */
    }

    return uniqueRows;
  }

  /**
   * Custom definition of db.all used to work with
   * our use of promises.
   * @param {String} stmt A string containing the SQL query.
   * @param {String} params A string containing the parameters of the SQL query
   * @param {Array} results The array to which the results of the query will be pushed.
   * @returns {Promise} A promise which resolves when our query completes and results are pushed to the results array.
   */
  all(stmt, params, results) {
    return new Promise((res, rej) => {
      try {
        const rows = stmt.all(params);
        rows.forEach((row) => {
          // Set empty cells to be 'NULL'
          if (typeof row["value"] !== "undefined")
            row["value"] = row["value"]
              .split(" || ")
              .map((cell) => (cell.length === 0 ? "NULL" : cell))
              .join(" || ");

          results.push(row);
        });
        res();
      } catch (error) {
        console.log(error);
        rej(error);
      }
    });
  }

  /**
   * Pad each row in 'table' with NULL until the table is a rectangle.
   * @param {Array} table A table containing rows which may need to be padded.
   * @param {Number} numCols The number of columns to pad the table.
   */
  fillNulls(table, numCols) {
    var row;
    for (let i = 0; i < table.length; i++) {
      row = table[i].split(" || ");
      for (let j = row.length; j < numCols; j++) row.push("NULL");
      table[i] = row.join(" || ");
    }
  }

  /**
   * Gets the type of each column in 'table'.
   * If every cell is a number, it is labelled as 'number'
   * Otherwise, it is of type 'text'
   * @param {Array} table The table for which column types will be found
   * @returns {Array} An array of datatypes with 1-1 correspondence to the table's columns.
   */
  getTypes(table) {
    var types = [];
    var column = [];
    var rows = table.map((row) => row.split(" || "));

    if (rows.length) {
      for (let i = 0; i < rows[0].length; i++) {
        column = [];
        for (let j = 0; j < rows.length; j++) {
          if (rows[j][i] !== "NULL") column.push(rows[j][i]);
        }

        column = column.map((value) => isNaN(value));

        if (column.indexOf(true) === -1 && column.length > 0)
          types.push("numerical");
        else if (column.length === 0) types.push("NULL");
        else types.push("text");
      }
    }

    return types;
  }

  /**
   * Handles the different cases of the t-test,
   * returning the p-value in each case
   * @param {Array} arr1 The first array, containing all numbers
   * @param {Array} arr2 The second array, containing all numbers
   * @returns {Number} The p-value of the t-test
   */
  ttestCases(arr1, arr2) {
    var p;

    if (arr1.length === 0 || arr2.length === 0)
      /* Lowest p-value possible => worst result (want the best match)
       * Likley won't occur, since seed set requires >= 1 row. */
      return 0;

    if (arr1.length === 1 && arr2.length === 1)
      /* Map between 0.01 and 0.99 to avoid log(0) */
      p = 0.98 * Number(arr1[0] === arr2[0]) + 0.01;
    else if (
      statistics.standardDeviation(arr1) === 0 &&
      statistics.standardDeviation(arr2) === 0
    )
      p = 0.98 * Number(arr1[0] === arr2[0]) + 0.01;
    else if (arr1.length === 1)
      /* If only one row in seedSet's numerical col, use one-sample t-test */
      p = Number(ttest(arr2, { mu: arr1[0] }).pValue());
    /* Run Welch's t-test */ else p = Number(ttest(arr1, arr2).pValue());

    return p;
  }

  /**
   * Produce constraints for the linear programming.
   * Maximum number of columns: the number of seed set columns of that type
   * Only one of each seed set can be mapped to.
   * Each potential column can only be mapped to one seed set column.
   * @param {Array} scores A 2D array containing the relational values for the seed set.
   * @param {String} colType The type of the columns being matched
   * @param {Array} colIDs The column IDs of the columns being mapped to the seed set.
   * @returns {Object} Contains the mapping of the columns, as well as a boolean 'feasible' if the mapping is sucessful.
   */
  lpSolve(scores, colType, colIDs) {
    var constraints;

    /* Determine if we are optimizing to minimize or maximize, based on the type
     * of columns being mapped */
    if (colType === "numNumerical") {
      constraints = { columns: { min: this.seedSet[colType] } };
    } else {
      constraints = { columns: { max: this.seedSet[colType] } };
    }

    /* Record the necessary values (all others are set to 0) */
    for (var i = 0; i <= this.seedSet[colType]; i++) {
      constraints[`ss${i}`] = { max: 1 };
    }
    colIDs.forEach((id) => {
      constraints[`cid${id}`] = { max: 1 };
    });

    /*
     * Each variable has the column count (always 1), its score,
     * and a one-hot encoding identifying the seed set variable and potential column
     * which correspond to its score.
     */
    var variables = {},
      mapping;

    colIDs.forEach((id) => {
      for (var i = 0; i < this.seedSet[colType]; i++) {
        mapping = `${id}-${i}`;

        variables[mapping] = {
          columns: 1,
          score: scores[i][id],
        };

        variables[mapping][`ss${i}`] = 1;
        variables[mapping][`cid${id}`] = 1;
      }
    });

    // Build model
    var model = {
      optimize: "score",
      opType: "max",
      constraints: constraints,
      variables: variables,
    };

    // Solve model
    var result = solver.Solve(model);

    // Initialize result to be returned
    var returned = {
      feasible: result["feasible"],
      score: result["result"],
      mapping: [],
    };
    for (var i = 0; i < this.seedSet[colType]; i++) {
      returned["mapping"].push(null);
    }

    // Map the columns into a list of indices
    var map;
    if (result["feasible"]) {
      Object.keys(result).forEach((key) => {
        if (key.indexOf("-") >= 0) {
          map = key.split("-").map((num) => Number(num));
          returned["mapping"][map[1]] = map[0];
        }
      });
    }

    // If some columns were not mapped, ignore the result
    if (returned["mapping"].some((num) => num === null)) {
      returned["feasible"] = false;
    }

    return returned;
  }

  /**
   * Since the SQL arguments need to be an array,
   * if the argument passed to a method is a string (i.e. only one keyword)
   * then we must convert it to an array of one string in order for the
   * SQL engine to accept it.
   * @param {String | Array} str If the argument is a string, convert it to an array. Otherwise, leave it be.
   * @returns {Array} Either the 'str' argument unchanged if already array or an array of one element
   */
  makeStrArr(str) {
    if (typeof str !== "object") {
      str = [str];
    }
    return str;
  }

  /**
   * Creates the array for storing the similarity
   * scores when ranking the rows to be returned to the user.
   * Each sub-array represents one column of the seed set, and
   * contains the similarity scores of that column with the
   * value that is being compared.
   * @returns {Array} 2D array with # of sub-arrays equal to # of columns in seed set
   */
  createColArr() {
    return Array.apply(null, Array(this.seedSet["numCols"])).map(() => {
      return [];
    });
  }

  /**
   * Since the SQL engine uses '?' placeholders in order to format the query,
   * this function determines the number of question marks based on the number
   * of arguments passed to the query (arr).
   * @param {Array} arr The array which is being passed to the query engine
   * @returns {String} A string of the format "(?, ?, ..., ?)" with # of '?' equal to the length of 'arr'
   */
  getQMarks(arr) {
    if (typeof arr === "undefined") {
      return "";
    }

    var qMarks = [];

    if (typeof arr === "string") {
      arr = [arr]; // Allows for use of spread operator below
      qMarks = "(?)";
    } else {
      arr.forEach(() => {
        qMarks.push("?");
      });
      qMarks = `(${qMarks.join(", ")})`;
    }

    return qMarks;
  }

  /**
   * Determines the 'overlap similarity' between the two arrays. To reduce the runtime
   * of the function, we do not convert to sets. Also, we divide by the length of arr1, which is
   * usually the seed set.
   * The overlap similarity of two sets A, B is defined to be Intersect(A, B) / max(|A|, |B|)
   * @param {Array} arr1 The first array.
   * @param {Array} arr2 The second array.
   * @returns {Number} The overlap similarity value, which is between 0 and 1.
   */
  overlapSim(arr1, arr2) {
    return (
      arr1.filter((value) => arr2.indexOf(value) >= 0).length / arr1.length
    );
  }

  /**
   * Resets the DP array used in finding both numerical mappings
   * and textual mappings
   * @param {Array} dpArr The array used to log the values
   * @param {Number} ssCols The length of the # of seed set columns of the type we are analyzing.
   * @param {Number} potTableCols The maximum column number of the table for which we are finding a mapping.
   */
  resetDPArr(dpArr, ssCols, potTableCols) {
    for (let i = 0; i < ssCols; i++) {
      dpArr[i] = [];
      for (let j = 0; j <= potTableCols; j++) {
        dpArr[i].push(0);
      }
    }
  }

  /**
   * Swaps the elements at indices i, j in 'arr'.
   * @param {Array} arr The array in which to swap elements
   * @param {Number} i The index of the first element to swap
   * @param {Number} j The index of the second element to swap.
   */
  swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  /**
   * Closes the database instance.
   */
  close() {
    this.db.close();
    return;
  }
}

module.exports = Database;
