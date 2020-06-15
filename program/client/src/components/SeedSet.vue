<template>
    <div>
        <div class="separate-components centering">
            <Logo />
        </div>

        <!-- LHS of Webpage -->
        <div class="page">
            <div class="separate-components centering">
                <h2>Please enter query information:</h2>
                <hr style="width: 90%; margin-bottom: 20px;">
                
                <!-- Form to submit keyword queries -->
                <form v-on:submit.prevent="submitQuery">
                    <p v-if="errors.length">
                        <strong>
                            Please enter at least one keyword
                        </strong>
                    </p>
                    
                    <div class="inputField">
                        <input type="text" id="keywords" 
                            placeholder="Enter keyword(s)">
                    </div>
                    <br>
                    <div class="inputField">
                        <input type="submit">
                    </div>
                </form>
            </div>
            <hr>

            <!-- Display for selected seed set rows -->
            <div class="separate-components centering">
                <h3>Seed Set</h3>
                <p v-if="table['numRows'] === 0">
                    No seed set rows have been selected
                </p>
                <div v-else>

                    <!-- Table content -->
                    <UserTable :table="table['rows']" />
                    <button @click="postSeedSet">Use as Seed Set</button>
                </div>
            </div>
        </div>

        <!-- RHS of Page -->
        <div class="page">
            <div class="separate-components">
                <div class="centering">
                    <h4>Results</h4>
                </div>

                <!-- List of tables for results -->
                <ul v-if="Object.keys(results).length > 0">

                    <!-- Summary of results -->
                    <p class="centering">
                        There are {{ Object.keys(results).length }} table(s) matching the keywords '{{ keywords }}'.<br>
                        Click on a title to view the table's rows.
                    </p>

                    <!-- Display for query results -->
                    <form>
                        <li v-for="(table, table_rank, index) in results" :key="index" class="top-most-li">
                            <!-- Row title, clicking on title reveals rows of table -->
                            <!-- /* https://codepen.io/Idered/pen/AeBgF */ -->
                            <input type="checkbox" class="read-more-state" :id="'_'+table_rank">
                            
                            <label class="read-more-trigger" :for="'_'+table_rank" style="cursor: pointer;"
                                v-html="'List of '
                                        + makeKeywordsBold(table['title'], keywords) 
                                        + ': (contains '
                                        + Object.keys(results[table_rank]['rows']).length
                                        + ' matching rows)'">
                            </label>
                                
                            <!-- Rows of table -->
                            <div class="read-more-wrap">
                               <p v-for="(rowContent, rowID) in table['rows']" :key="rowID" class="read-more-target">
                                    <input type="checkbox" :id="table_rank+'-'+rowID" 
                                            :value="logRowInfo(rowContent, rowID, table['table_id'])" v-model="selectedRows">
                                    <label :for="table_rank+'-'+rowID"
                                        v-html="'('
                                                + makeKeywordsBold(rowContent, keywords)
                                                + ')'">
                                    </label>
                                </p> 
                            </div>
                        </li>
                    </form>
                </ul>
                <!-- Only upon initialization of page -->
                <p v-else-if="typeof results === 'string'" class='centering'> 
                    Enter keywords and see the rows in our database which match!
                </p>
                <p v-else class="centering">
                    No results for the previous query.
                </p>
            </div>
        </div>
    </div>
</template>

<script>
import Logo from './Logo.vue'
import ResultService from '../getResults.js'
import UserTable from './UserTable.vue'

export default {
    name: 'SeedSet',
    components: {
        Logo,
        UserTable
    },

    data: function() {
        return {
            keywords: 'Australia, Cat',
            results: "",
            errors: [],
            selectedRows: [],
            document: document,     
        }
    },

    methods: {
        submitQuery() {
            /* Submits the keyword query to the backend,
             * assigns the result of the query (after formatting)
             * to the 'results' data
             */
            this.errors = [];
            this.selectedRows = [];
            this.keywords = this.document.querySelector('#keywords').value // Only update keywords here, not on change

            // https://vuejs.org/v2/cookbook/form-validation.html
            if (this.keywords.length > 0) {
                ResultService.getKeywords(this.keywords)
                .then((data) => {
                    this.results = data
                }).catch((err) => {
                    console.log(err);
                })     
            } else {
                if (this.keywords.length === 0) {
                        this.errors.push(0); // Need at least one item, doesn't matter what
                }

            }
        },

        postSeedSet() {
            /* Set the seed set attribute on the back-end,
             * emit event to change the page's mode
             */
            var tableIDs = [];
            var rowIDs = [];
            this.selectedRows.forEach(row => {
                tableIDs.push(row['tableID'])
                rowIDs.push(row['rowID'])
            });

            ResultService.postSeedSet(rowIDs, tableIDs)
            .then(() => {
                this.$emit('ChangeMode')
            })
            .catch((err) => {
                console.log(err);
            })
        },

        logRowInfo(rowContent, rowID, table_id) {
            /* Formats the data to be passed to 'selectedRows' */
            return {
                rowContent: rowContent.split(/ *\|\| */),
                rowID: rowID,
                tableID: table_id,
            }
        },

        makeKeywordsBold (str, keywords) {
            /* Make all keywords appear bold in result
             * TODO: 'this' refers methods (dunno why), so we pass the keywords by value 
             * https://x-team.com/blog/highlight-text-vue-regex/
             * Accessed June 9th, 2020
             */

            return str.replace(new RegExp(keywords.split(/ *, */).join('|'), 'gi'), match => {
                return '<strong>' + match + '</strong>'
            })
        },

    },

    computed: {
        table: function() {
            /* Computes the seed-set table from this.selectedRows */
            var rows = [];
            var numRows = 0;
            var numCols = 1;
            this.selectedRows.forEach(row => {
                row = row['rowContent']
                numCols = Math.max(row.length, numCols);
                numRows += 1
                rows.push(row);
            });

            return {
                rows: rows,
                numRows: numRows,
                numCols: numCols,
            }
        }
    }
}

</script>


<style scoped>

input {
    cursor: pointer;
}

input[type='text'] {
    border: 5px solid white;
    height: 100%;
    width: 35%;
}

.top-most-li {
    margin: 1%;
}

.inputField {
    margin: 1px;
}

/* https://codepen.io/Idered/pen/AeBgF */
.read-more-state {
  display: none;
}

.read-more-target {
  opacity: 0;
  max-height: 0;
  font-size: 0;
  transition: .25s ease;
}

.read-more-state:checked ~ .read-more-wrap .read-more-target {
  opacity: 1;
  font-size: inherit;
  max-height: 999em;
}

.read-more-trigger {
  cursor: pointer;
  display: inline-block;
  padding: 0 .5em;
  color: #80C080;
  font-size: 0.95em;
  line-height: 2;
  border: 1px solid #ddd;
  border-radius: .25em;
  background: rgb(49, 45, 45);
  margin: 0.1em 0;
}

</style>