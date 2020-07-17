<template>
    <div id="seed-set">
        <div class="separate-components centering" style="margin-bottom: 1%; ">
            <Logo />


        </div>
        <div class="separate-components centering">            
            <Instruction ref="instruction-1" index="1" style="padding-bottom: 1%;">
                <template #hidden>
                    <p>
                        Welcome to BareTQL! BareTQL is a tool which provides a GUI search through our database of wikipedia tables. <br>
                        There are two parts to the tool: the screen you are looking at right now is the first screen, where keyword searching occurs.
                    </p>
                </template>
            </Instruction>
            <button @click="showInstructions">Click me to learn how to use BareTQL!</button>

            <Instruction ref="instruction-2" index="2" style="padding-bottom: 1%;">

                <template #hidden>
                    <p>
                        <br>
                        This is where you can enter keywords to search for in the database.<br>
                        Separate individual keywords by a comma, and then click the submit button below to run your query. Note
                        that common words like 'the' or 'and' will take longer to query, just because they are more common in the database.
                    </p>
                </template>
            </Instruction>
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
                    <button type="submit" id="submit-query-button">Submit Query</button>
                </div>
            </form>
        </div>

        <div style="display: flex;">
            <!-- LHS of Page -->
            <div class="page">
                <div class="separate-components">
                    <div class="centering">
                        <Instruction ref="instruction-3" index="3">
                            <template #shown>
                                <h3>Results</h3>
                            </template>
                            
                            <template #hidden>
                                <p>
                                    This the the 'Results' tab, where the results of your query will be shown, separated into tables. <br>
                                    Click on the title of a table to see its rows, and click on a row to add it to your seed set.
                                </p>
                            </template>
                        </Instruction>


                    </div>

                    <!-- List of tables for results -->
                    <ul v-if="Object.keys(results).length > 0">

                        <!-- Summary of results -->
                        <p v-if="Object.keys(results).length === 20" class="centering">
                            These are the top 20 tables that match the keywords '{{ keywords }}'. <br>
                            Click on a title to view the table's rows.
                        </p>
                        <p v-else class="centering">
                            There are {{ Object.keys(results).length }} table(s) matching the keywords '{{ keywords }}'. <br>
                            Click on a title to view the table's rows.
                        </p>

                        <!-- Display for query results -->
                        <form style="font-size: 0.9em;">
                            <li v-for="(table, table_rank, index) in results" :key="index" class="top-most-li">
                                <!-- Row title, clicking on title reveals rows of table
                                    https://codepen.io/Idered/pen/AeBgF */ -->
                                <input type="checkbox" class="read-more-state" :id="'_'+table_rank" :value="table_rank" v-model="clickedTables">
                                
                                <label class="read-more-trigger" :for="'_'+table_rank" style="cursor: pointer;">
                                    List of
                                    <span v-html="makeKeywordsBold(table['title'], keywords)"></span>:
                                    ({{ Object.keys(results[table_rank]['rows']).length }}
                                    {{Object.keys(results[table_rank]['rows']).length > 1 ? ' matches from  ' : ' match from '}}
                                    {{results[table_rank]['rowCount']}} rows)
                                    <span v-if="isTableInSS(table['table_id'])">***</span>
                                            
                                </label>
                                    
                                <!-- Rows of table -->
                                <transition name="table">
                                    <div v-if="isTableChecked(table_rank)">
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
                                </transition>
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

            <!-- RHS of Webpage -->
            <div class="page">
                <div class="sticky">

                    <!-- Display for selected seed set rows -->
                    <div class="separate-components centering">
                        <Instruction ref="instruction-4" index="4">
                            <template #shown>
                                <h3>Seed Set</h3>
                            </template>

                            <template #hidden>
                                <p>
                                    This is where a preview of your seed set will be displayed. Once you are happy with your seed set,
                                    click the button below the table to move to the next portion of the app: Set Expansion.
                                </p>
                            </template>

                            <template #button-text>
                                End Tutorial
                            </template>

                        </Instruction>
                        <p v-if="table['numRows'] === 0">
                            No seed set rows have been selected
                        </p>
                        <div v-else>

                            <!-- Table content -->
                            <div class="no-overflow">
                                <UserTable :table="table['rows']" :allowSelection="false"/>
                            </div>
                            <button @click="postSeedSet">Use as Seed Set</button>
                        </div>
                    </div>
                </div>
                
                <!-- Fills up rest of 'page', so the seed set has 
                    something to slide overtop. -->
                <div>

                </div>
            </div>
        </div>
    </div>
</template>

<script>
import Logo from './Logo.vue'
import ResultService from '../getResults.js'
import UserTable from './UserTable.vue'
import Instruction from './Instruction.vue'

export default {
    name: 'SeedSet',
    components: {
        Logo,
        UserTable,
        Instruction,
    },

    data: function() {
        return {
            document: document,  
            clickedTables: [],
            selectedRows: [],
            keywords: '',
            results: "",
            errors: [],
        }
    },

    methods: {

        async showInstructions() {
            var inputButtons = this.document.querySelectorAll("button:not(.instruction-button), input, label")

            for (let inp of Object.values(inputButtons)) {inp.disabled = true; inp.classList.toggle('deactivate')}

            for (let i = 1; i < document.querySelectorAll('.instruction-component').length + 1; i++) {
                await this.$refs[`instruction-${i}`].handleClick();
            }

            for (let inp of Object.values(inputButtons)) {inp.disabled = false; inp.classList.toggle('deactivate')}
        },

        /* Use single button in corner as measure of when to increment i */

        submitQuery() {
            /* Submits the keyword query to the backend,
             * assigns the result of the query (after formatting)
             * to the 'results' data
             */
            var changeButton = function(button, content) {
                button.textContent = content;
                button.disabled = !button.disabled;
                button.classList.toggle('deactivate');
            }

            this.errors = [];
            this.selectedRows = [];
            var keywords = this.document.querySelector('#keywords').value // Only update keywords here, not on change
            var submitButton = this.document.querySelector('#submit-query-button')

            // https://vuejs.org/v2/cookbook/form-validation.html
            if (keywords.length > 0) {
                changeButton(submitButton, "Loading...");
                ResultService.getKeywords(keywords)
                .then((data) => {
                    changeButton(submitButton, "Submit Query");
                    this.results = data
                    this.keywords = keywords

                }).catch((err) => {
                    changeButton(submitButton, err);
                    console.log(err);
                })     
            } else {
                if (this.keywords.length === 0) {
                    this.errors.push(0); /* Need at least one item, doesn't matter what it is. */
                }

            }
        },

        postSeedSet() {
            /* Set the seed set attribute on the back-end,
             * emit event to change the page's mode */
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

        isTableChecked(table_rank) {
            /* Checks if table checkbox is checked, 
             * allows for rendering of rows. */
            return this.clickedTables.indexOf(table_rank) !== -1
        },

        isTableInSS(table_id) {
            /* Checks if a row from table_id is selected to
             * be in the seed set, if it is we record it in the DOM */
            return this.selectedRows.some(row => row['tableID'] === table_id);
        },

        makeKeywordsBold (str, keywords) {
            /* Make all keywords appear bold in result
             * TODO: 'this' refers methods (dunno why), so we pass the keywords by value 
             * https://x-team.com/blog/highlight-text-vue-regex/
             * Accessed June 9th, 2020
             */
            return str.replace(new RegExp(`(?<=^|[^a-zA-Z])(?:${keywords.split(/ *, */).join('|')})(?=[^a-zA-Z]|$)`, 'gi'), match => {
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
        },
    }, 
}

</script>


<style scoped>

input {
    cursor: pointer;
}

input[type='text'] {
    border: 5px solid white;
    height: 100%;
    width: 30%;
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

.table-enter-active, .table-leave-active {
  opacity: 1;
  font-size: inherit;
  max-height: 999em;
  transition: .25s ease;
}

.table-enter, .table-leave-to {
  opacity: 0;
  max-height: 0;
  font-size: 0;
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